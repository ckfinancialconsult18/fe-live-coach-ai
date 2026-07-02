'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptLine } from '@/lib/types';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';
import { createLevelMeter, type LevelMeter } from '@/lib/audio/level-meter';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
export type TranscriptionMode = 'deepgram' | 'webspeech';

export interface PartialTranscript {
  speaker: 'agent' | 'prospect';
  text: string;
}

export interface UseDeepgramTranscriptionReturn {
  transcript: TranscriptLine[];
  partial: PartialTranscript | null;
  connectionState: ConnectionState;
  transcriptionMode: TranscriptionMode | null;
  isListening: boolean;
  error: string | null;
  startListening: (explicitStream?: MediaStream) => Promise<void>;
  stopListening: () => void;
  clearTranscript: () => void;
  correctSpeaker: (lineId: string) => void;
}

// Logged on every start and sent as an x-pipeline-version header with every
// chunk so the server logs prove which client bundle is actually running.
// Bump this string whenever the recording pipeline changes.
const PIPELINE_VERSION = 'chunked-recorder-v3';

const MAX_RECONNECT = 5;
// How long to record each chunk before stopping and POSTing.
// Each stop+start produces a complete WebM file — Deepgram can decode every chunk.
const CHUNK_INTERVAL_MS = 4000;
// Minimum blob size to bother sending (avoids POSTing empty/header-only blobs)
const MIN_CHUNK_BYTES = 500;
// RMS below this across a whole chunk means the chunk contained only silence.
const SILENCE_PEAK_THRESHOLD = 0.01;

let lineSeq = 0;
function nextId() { return `dg-${++lineSeq}`; }

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

function dominantSpeaker(words: DeepgramWord[]): 'agent' | 'prospect' {
  if (!words.length) return 'agent';
  const counts: Record<number, number> = {};
  for (const w of words) {
    const s = w.speaker ?? 0;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return Number(top[0]) === 0 ? 'agent' : 'prospect';
}

// ── Web Speech API shim ───────────────────────────────────────────────────────
interface SpeechRecognitionEvent {
  results: { [i: number]: { [j: number]: { transcript: string; confidence: number }; isFinal: boolean; length: number } };
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent { error: string; message?: string }
interface SpeechRecognitionInstance {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null; onstart: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as SpeechRecognitionCtor | null;
}

function bestMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  return candidates.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
}

function trackInfo(t: MediaStreamTrack): string {
  return `label="${t.label}" readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`;
}

// Attach mute/unmute/ended diagnostics exactly once per track. `muted` flipping
// to true means the OS/browser stopped delivering samples on a still-live track
// — the classic signature of a phone/VoIP app grabbing the input device or a
// Bluetooth headset switching profiles mid-call.
function attachTrackDiagnostics(track: MediaStreamTrack, streamLabel: string) {
  track.addEventListener('mute', () => {
    console.warn(`[transcription] TRACK MUTED (${streamLabel}) — the OS stopped delivering audio on this track. ` +
      `Typical cause: another app (phone call, FaceTime, VoIP) took over the input device, or a Bluetooth ` +
      `headset switched to call mode. MediaRecorder will keep producing chunks but they will contain SILENCE. ` +
      trackInfo(track));
  });
  track.addEventListener('unmute', () => {
    console.log(`[transcription] track unmuted (${streamLabel}) — audio delivery resumed. ${trackInfo(track)}`);
  });
  track.addEventListener('ended', () => {
    console.error(`[transcription] TRACK ENDED (${streamLabel}) — device disconnected or capture revoked. ${trackInfo(track)}`);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDeepgramTranscription(mic: UseMicrophoneReturn): UseDeepgramTranscriptionReturn {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [partial, setPartial] = useState<PartialTranscript | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const micRef = useRef(mic);
  const usingWebSpeechRef = useRef(false);
  // Combined stream (mic + system audio) used for recording
  const combinedStreamRef = useRef<MediaStream | null>(null);
  // AudioContext that mixes mic + system audio (must be closed on stop)
  const mergeCtxRef = useRef<AudioContext | null>(null);
  // The base stream chosen at startListening — fallback if micRef state is stale
  const recordStreamRef = useRef<MediaStream | null>(null);
  // Level monitoring on the exact stream being recorded
  const monitorCtxRef = useRef<AudioContext | null>(null);
  const monitorMeterRef = useRef<LevelMeter | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // RMS accumulated over the current chunk window (fed by the heartbeat)
  const rmsWindowRef = useRef<{ sum: number; peak: number; n: number }>({ sum: 0, peak: 0, n: 0 });
  const chunkSeqRef = useRef(0);
  const diagnosedTracksRef = useRef<WeakSet<MediaStreamTrack>>(new WeakSet());

  // Stable function refs to avoid stale closures inside MediaRecorder callbacks
  const startWebSpeechRef = useRef<() => void>(() => {});
  const startChunkCycleRef = useRef<() => void>(() => {});
  const sendChunkRef = useRef<(blob: Blob, seq: number, durationMs: number) => Promise<void>>(async () => {});

  useEffect(() => { micRef.current = mic; }, [mic]);

  const addLine = useCallback((text: string, speaker: 'agent' | 'prospect', confidence: number) => {
    if (!text.trim()) return;
    setPartial(null);
    setTranscript((prev) => [
      ...prev,
      { id: nextId(), speaker, text: text.trim(), timestamp: new Date(), speakerConfidence: confidence },
    ]);
  }, []);

  // ── Web Speech API fallback ─────────────────────────────────────────────────

  const startWebSpeech = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError('Deepgram is not configured and the Web Speech API is not supported by this browser (try Chrome or Edge).');
      setConnectionState('failed');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      reconnectAttemptRef.current = 0;
      setConnectionState('connected');
      setTranscriptionMode('webspeech');
    };
    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          if (text.trim()) addLine(text, 'agent', Math.round((result[0]?.confidence ?? 0.5) * 100));
        } else { interim += text; }
      }
      if (interim.trim()) setPartial({ speaker: 'agent', text: interim.trim() });
    };
    recognition.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      setError(`Web Speech API error: ${e.error}${e.message ? ` — ${e.message}` : ''}`);
    };
    recognition.onend = () => {
      setPartial(null);
      if (shouldReconnectRef.current) {
        if (reconnectAttemptRef.current < MAX_RECONNECT) {
          reconnectAttemptRef.current++;
          setConnectionState('reconnecting');
          reconnectTimerRef.current = setTimeout(() => {
            try { recognition.start(); } catch { /* already started */ }
          }, 300);
        } else {
          setConnectionState('failed');
          setError('Web Speech API stopped after multiple reconnect attempts.');
          shouldReconnectRef.current = false;
        }
      } else {
        setConnectionState('idle');
      }
    };
    speechRef.current = recognition;
    try { recognition.start(); } catch (err) {
      setError(`Could not start Web Speech API: ${err instanceof Error ? err.message : String(err)}`);
      setConnectionState('failed');
    }
  }, [addLine]);

  useEffect(() => { startWebSpeechRef.current = startWebSpeech; }, [startWebSpeech]);

  // ── Send chunk to server ────────────────────────────────────────────────────

  const sendChunk = useCallback(async (blob: Blob, seq: number, durationMs: number) => {
    const contentType = (blob.type || 'audio/webm').split(';')[0].trim();
    console.log(`[transcription] chunk #${seq} POSTing — size=${blob.size} durationMs=${durationMs} contentType=${contentType}`);

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'x-pipeline-version': PIPELINE_VERSION,
          'x-chunk-seq': String(seq),
        },
        body: blob,
      });

      console.log(`[transcription] chunk #${seq} /api/transcribe responded — status: ${res.status}`);

      if (res.status === 503) {
        console.warn('[transcription] Deepgram not configured (503) — switching to Web Speech API');
        usingWebSpeechRef.current = true;
        startWebSpeechRef.current();
        return;
      }

      const data = await res.json().catch(() => ({ error: 'non-JSON response' })) as {
        transcript?: string; words?: DeepgramWord[]; confidence?: number; error?: string;
        deepgramStatus?: number; deepgramBody?: unknown; attempts?: unknown;
      };

      if (!res.ok || data.error) {
        // FULL server error body — this is the actual Deepgram error, passed through.
        console.error(`[transcription] chunk #${seq} server error (HTTP ${res.status}) — FULL response:`,
          JSON.stringify(data, null, 2));
        setError(`Transcription failed (HTTP ${res.status}): ${data.error ?? 'unknown error'}`);
        return;
      }

      // A successful chunk clears any stale error banner from earlier failures.
      setError(null);

      const words = data.words ?? [];
      const text = words.length > 0
        ? words.map((w) => w.punctuated_word ?? w.word).join(' ').trim()
        : (data.transcript?.trim() ?? '');

      console.log(`[transcription] chunk #${seq} transcript received — length=${text.length} words=${words.length}`);
      if (text) addLine(text, dominantSpeaker(words), Math.round((data.confidence ?? 0.8) * 100));
    } catch (err) {
      console.error(`[transcription] chunk #${seq} sendChunk network error:`, err instanceof Error ? err.message : err);
    }
  }, [addLine]);

  useEffect(() => { sendChunkRef.current = sendChunk; }, [sendChunk]);

  // ── One chunk cycle: record → stop → POST → repeat ─────────────────────────
  //
  // CRITICAL: We do NOT use MediaRecorder.start(timeslice). With a timeslice,
  // the WebM initialization segment (EBML header) only appears in the very
  // first ondataavailable event. Every subsequent event contains raw media
  // segments with no header — Deepgram cannot decode them and returns 400.
  //
  // Instead we start a fresh MediaRecorder for each chunk and let it run to
  // completion (start → stop). Each resulting blob is a complete, self-contained
  // WebM file that Deepgram can decode independently.

  const startChunkCycle = useCallback(() => {
    if (!shouldReconnectRef.current || usingWebSpeechRef.current) return;

    // Prefer combined stream (mic + system audio); fall back to mic-only.
    // recordStreamRef covers the first cycle when React state hasn't flushed yet.
    const stream = combinedStreamRef.current ?? micRef.current.stream ?? recordStreamRef.current;
    if (!stream) {
      console.error('[transcription] no audio stream available');
      setConnectionState('failed');
      setError('Microphone is not active — cannot start transcription.');
      return;
    }

    const seq = ++chunkSeqRef.current;
    const startedAt = performance.now();

    // Log every audio track so we can see if any go dead
    const tracks = stream.getAudioTracks();
    tracks.forEach((t, i) => {
      console.log(`[transcription] chunk #${seq} track[${i}] ${trackInfo(t)}`);
      if (!diagnosedTracksRef.current.has(t)) {
        diagnosedTracksRef.current.add(t);
        attachTrackDiagnostics(t, `recording track[${i}]`);
      }
    });

    const liveTracks = tracks.filter((t) => t.readyState === 'live');
    if (liveTracks.length === 0) {
      console.error('[transcription] all audio tracks are ended — cannot record');
      setConnectionState('failed');
      setError('Microphone disconnected. Please check your audio device.');
      return;
    }

    const mimeType = bestMimeType();
    const chunks: Blob[] = [];

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[transcription] MediaRecorder constructor threw:', msg);
      setError(`Could not start recording: ${msg}`);
      setConnectionState('failed');
      return;
    }

    recorderRef.current = recorder;
    // Fresh RMS window for this chunk — heartbeat fills it while we record.
    rmsWindowRef.current = { sum: 0, peak: 0, n: 0 };

    recorder.ondataavailable = (e) => {
      console.log(`[transcription] chunk #${seq} ondataavailable — size=${e.data.size} recorder.state=${recorder.state} ` +
        `elapsedMs=${Math.round(performance.now() - startedAt)}`);
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const durationMs = Math.round(performance.now() - startedAt);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const { sum, peak, n } = rmsWindowRef.current;
      const avgRms = n > 0 ? sum / n : -1;

      console.log(`[transcription] chunk #${seq} complete — blob.size=${blob.size} durationMs=${durationMs} ` +
        `blob.type=${blob.type} recorder.mimeType=${recorder.mimeType} ` +
        `avgRMS=${avgRms.toFixed(4)} peakRMS=${peak.toFixed(4)} rmsSamples=${n}`);

      // Silence detection: valid-but-silent chunks return HTTP 200 with an empty
      // transcript. This log explains exactly WHY nothing is being transcribed.
      if (n > 0 && peak < SILENCE_PEAK_THRESHOLD) {
        const states = stream.getAudioTracks().map((t, i) => `track[${i}]: ${trackInfo(t)}`).join(' | ');
        console.warn(`[transcription] chunk #${seq} contained ONLY SILENCE (peakRMS=${peak.toFixed(4)}). ` +
          `Causes, in order of likelihood: (1) a track reports muted=true — the OS/another app took the ` +
          `input device; (2) browser audio processing (echo cancellation) is zeroing the signal while ` +
          `speaker audio plays; (3) the merge AudioContext is suspended. Current state: ${states}`);
      }

      // Verify the blob starts with a container header (EBML 1a 45 df a3 for WebM).
      void blob.slice(0, 4).arrayBuffer().then((head) => {
        const hex = Array.from(new Uint8Array(head)).map((x) => x.toString(16).padStart(2, '0')).join(' ');
        const validWebm = hex === '1a 45 df a3';
        console.log(`[transcription] chunk #${seq} header bytes: ${hex}${validWebm ? ' (valid WebM/EBML)' : ''}`);
      });

      if (blob.size >= MIN_CHUNK_BYTES) {
        void sendChunkRef.current(blob, seq, durationMs);
      } else {
        console.warn(`[transcription] chunk #${seq} below minimum size (${blob.size} bytes) — skipping`);
      }

      // Schedule next cycle immediately — onstop is the clean restart point
      if (shouldReconnectRef.current && !usingWebSpeechRef.current) {
        startChunkCycleRef.current();
      }
    };

    recorder.onerror = (e: Event) => {
      console.error(`[transcription] chunk #${seq} MediaRecorder.onerror:`, e);
    };

    try {
      recorder.start(); // NO timeslice — run until we explicitly call stop()
      console.log(`[transcription] chunk #${seq} MediaRecorder running — state=${recorder.state} ` +
        `mimeType=${recorder.mimeType} | stopping in ${CHUNK_INTERVAL_MS}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[transcription] MediaRecorder.start() threw:', msg);
      setError(`Could not start recording: ${msg}`);
      setConnectionState('failed');
      return;
    }

    // Stop after CHUNK_INTERVAL_MS — this triggers ondataavailable then onstop
    chunkTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    }, CHUNK_INTERVAL_MS);

  }, []);

  useEffect(() => { startChunkCycleRef.current = startChunkCycle; }, [startChunkCycle]);

  // ── Request system audio (to capture speaker output / remote call) ──────────
  // getUserMedia only captures the microphone. When the remote party speaks
  // through the computer's speakers, that audio is NOT in the mic stream.
  // getDisplayMedia with audio:true captures the system audio (loopback).
  // We merge both tracks into a single stream so Deepgram hears both sides.

  const acquireSystemAudio = useCallback(async (): Promise<MediaStream | null> => {
    if (typeof navigator?.mediaDevices?.getDisplayMedia !== 'function') return null;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true, // required by most browsers to trigger the picker
        audio: true,
      });
      // Stop the video track immediately — we only want audio
      display.getVideoTracks().forEach((t) => t.stop());
      const audioTracks = display.getAudioTracks();
      console.log('[transcription] system audio tracks:', audioTracks.length,
        '| labels:', audioTracks.map((t) => t.label).join(', '));
      return audioTracks.length > 0 ? display : null;
    } catch (err) {
      // User cancelled the picker or browser doesn't allow audio-only getDisplayMedia
      console.warn('[transcription] getDisplayMedia cancelled or unavailable:', err instanceof Error ? err.message : err);
      return null;
    }
  }, []);

  // ── Level monitor + heartbeat ───────────────────────────────────────────────
  // Samples the RMS of the exact stream being recorded every second, and logs
  // recorder state + every track's readyState/enabled/muted. This is the
  // ground truth for "are the chunks silent, and if so, since when".

  const startMonitoring = useCallback(async (target: MediaStream) => {
    try {
      const mctx = new AudioContext();
      if (mctx.state === 'suspended') await mctx.resume().catch(() => {});
      monitorCtxRef.current = mctx;
      monitorMeterRef.current = createLevelMeter(target, mctx);
      console.log('[transcription] level monitor attached — AudioContext state:', mctx.state);
    } catch (err) {
      console.warn('[transcription] level monitor unavailable:', err instanceof Error ? err.message : err);
    }

    heartbeatRef.current = setInterval(() => {
      const meter = monitorMeterRef.current;
      const rms = meter?.getLevel() ?? -1;
      const peak = meter?.getPeak() ?? -1;
      if (meter) {
        const w = rmsWindowRef.current;
        w.sum += rms;
        w.n += 1;
        if (peak > w.peak) w.peak = peak;
      }
      const rec = recorderRef.current;
      const stream = combinedStreamRef.current ?? micRef.current.stream ?? recordStreamRef.current;
      const states = stream?.getAudioTracks()
        .map((t, i) => `[${i}] ${t.readyState}/${t.enabled ? 'enabled' : 'DISABLED'}/${t.muted ? 'MUTED' : 'unmuted'}`)
        .join(' ') ?? 'no stream';
      console.log(`[transcription] ♥ recorder=${rec?.state ?? 'none'} rms=${rms.toFixed(4)} peak=${peak.toFixed(4)} tracks: ${states}`);
    }, 1000);
  }, []);

  // ── Public startListening ───────────────────────────────────────────────────

  const startListening = useCallback(async (explicitStream?: MediaStream) => {
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    usingWebSpeechRef.current = false;
    chunkSeqRef.current = 0;

    console.log(`[transcription] ===== starting — pipeline: ${PIPELINE_VERSION} =====`);

    if (typeof window === 'undefined' || !window.MediaRecorder) {
      console.warn('[transcription] MediaRecorder not available — using Web Speech API');
      usingWebSpeechRef.current = true;
      startWebSpeechRef.current();
      return;
    }

    setConnectionState('connecting');
    setError(null);

    // The caller can pass the stream directly (page calls mic.start() right
    // before this) — React state in micRef may not have flushed yet.
    const micStream = micRef.current.stream ?? explicitStream ?? null;
    if (!micStream) {
      setError('Microphone is not active — cannot start transcription.');
      setConnectionState('failed');
      return;
    }
    recordStreamRef.current = micStream;
    micStream.getAudioTracks().forEach((t, i) => {
      console.log(`[transcription] mic track[${i}] ${trackInfo(t)}`);
      if (!diagnosedTracksRef.current.has(t)) {
        diagnosedTracksRef.current.add(t);
        attachTrackDiagnostics(t, `mic track[${i}]`);
      }
    });

    // Try to acquire system audio to capture the remote party's voice through speakers.
    // This is optional — if the user declines or the browser doesn't support it,
    // we fall back to mic-only.
    const systemAudio = await acquireSystemAudio();

    if (systemAudio) {
      systemAudio.getAudioTracks().forEach((t, i) => {
        if (!diagnosedTracksRef.current.has(t)) {
          diagnosedTracksRef.current.add(t);
          attachTrackDiagnostics(t, `system-audio track[${i}]`);
        }
      });
      // Merge mic + system audio into a single stream
      const ctx = new AudioContext();
      mergeCtxRef.current = ctx;
      // A suspended AudioContext outputs SILENCE — resume before recording.
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (err) {
          console.error('[transcription] merge AudioContext resume() failed:', err);
        }
      }
      ctx.onstatechange = () => {
        console.warn(`[transcription] merge AudioContext state → ${ctx.state}` +
          (ctx.state !== 'running' ? ' — merged stream is SILENT until it is running again' : ''));
      };
      const dest = ctx.createMediaStreamDestination();
      const micSource = ctx.createMediaStreamSource(micStream);
      const sysSource = ctx.createMediaStreamSource(systemAudio);
      micSource.connect(dest);
      sysSource.connect(dest);
      combinedStreamRef.current = dest.stream;
      console.log('[transcription] merged mic + system audio — combined tracks:',
        dest.stream.getAudioTracks().length, '| merge AudioContext state:', ctx.state);
    } else {
      // Mic-only mode — remote call audio through speakers is only picked up
      // acoustically by the microphone (audio processing is disabled in
      // requestMicrophoneStream precisely so this works).
      combinedStreamRef.current = null;
      console.log('[transcription] mic-only mode (system audio not available)');
    }

    await startMonitoring(combinedStreamRef.current ?? micStream);

    setConnectionState('connected');
    setTranscriptionMode('deepgram');
    startChunkCycleRef.current();
  }, [acquireSystemAudio, startMonitoring]);

  // ── Public stopListening ────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    shouldReconnectRef.current = false;
    if (chunkTimerRef.current) { clearTimeout(chunkTimerRef.current); chunkTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }

    monitorMeterRef.current?.destroy();
    monitorMeterRef.current = null;
    if (monitorCtxRef.current && monitorCtxRef.current.state !== 'closed') {
      monitorCtxRef.current.close().catch(() => {});
    }
    monitorCtxRef.current = null;

    if (recorderRef.current) {
      if (recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop(); // triggers final ondataavailable + onstop
      }
      recorderRef.current = null;
    }
    if (speechRef.current) {
      speechRef.current.onend = null;
      try { speechRef.current.abort(); } catch { /* ignore */ }
      speechRef.current = null;
    }
    // Clean up combined stream (system audio tracks) and the mixing context
    if (combinedStreamRef.current) {
      combinedStreamRef.current.getTracks().forEach((t) => t.stop());
      combinedStreamRef.current = null;
    }
    if (mergeCtxRef.current && mergeCtxRef.current.state !== 'closed') {
      mergeCtxRef.current.onstatechange = null;
      mergeCtxRef.current.close().catch(() => {});
    }
    mergeCtxRef.current = null;
    recordStreamRef.current = null;
    setConnectionState('idle');
    setPartial(null);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setPartial(null);
    lineSeq = 0;
  }, []);

  const correctSpeaker = useCallback((targetId: string) => {
    setTranscript((prev) =>
      prev.map((line) =>
        line.id === targetId
          ? { ...line, speaker: line.speaker === 'agent' ? 'prospect' : 'agent', speakerEdited: true }
          : line
      )
    );
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  return {
    transcript, partial, connectionState, transcriptionMode,
    isListening: connectionState === 'connected' || connectionState === 'reconnecting',
    error, startListening, stopListening, clearTranscript, correctSpeaker,
  };
}
