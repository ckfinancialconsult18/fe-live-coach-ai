'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptLine } from '@/lib/types';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';
import { createLevelMeter, type LevelMeter } from '@/lib/audio/level-meter';
import { useAudioInputManager } from '@/hooks/useAudioInputManager';

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
  /** Acquire system audio (speaker-mode) after the call has already started. */
  enableSpeakerMode: () => Promise<void>;
  /** Stop capturing system audio, revert to mic-only. */
  disableSpeakerMode: () => void;
  /** Non-fatal warning from the audio manager (e.g. system audio declined). */
  audioWarning: string | null;
  /** Set when consecutive silent chunks are detected — describes the likely cause. */
  silenceWarning: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Sent as x-pipeline-version with every chunk so server logs identify the bundle.
const PIPELINE_VERSION = 'timeslice-v1';

const MAX_RECONNECT = 5;
// MediaRecorder timeslice interval — ondataavailable fires this often.
// The recorder runs for the entire call; we never manually stop it.
const CHUNK_INTERVAL_MS = 4000;
const MIN_CHUNK_BYTES = 500;
const SILENCE_PEAK_THRESHOLD = 0.01;
const SILENCE_WARNING_CHUNKS = 2;

// WebM Cluster EBML element ID — marks the start of encoded audio data.
// Everything before the first Cluster is the initialization segment (header).
const CLUSTER_ID = [0x1F, 0x43, 0xB6, 0x75];

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

function bestMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  return candidates.find(
    (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
  ) ?? '';
}

/**
 * Scans the first ondataavailable blob for the WebM Cluster element (1F 43 B6 75).
 * Returns a slice of the buffer containing only the initialization segment
 * (EBML header + Tracks), with no audio data.
 *
 * Why: MediaRecorder timeslice emits the EBML header only in the FIRST chunk.
 * Subsequent chunks contain raw Cluster elements that Deepgram cannot decode
 * without the header. Prepending this init segment to every subsequent chunk
 * makes each POST a valid, standalone WebM file.
 */
async function extractInitSegment(blob: Blob): Promise<ArrayBuffer> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  for (let i = 0; i <= bytes.length - 4; i++) {
    if (
      bytes[i]   === CLUSTER_ID[0] &&
      bytes[i+1] === CLUSTER_ID[1] &&
      bytes[i+2] === CLUSTER_ID[2] &&
      bytes[i+3] === CLUSTER_ID[3]
    ) {
      console.log(`[transcription] init segment found at offset ${i} — ${i} header bytes + ${buf.byteLength - i} audio bytes`);
      return buf.slice(0, i);
    }
  }
  // No Cluster found — entire blob may be header-only (some browsers emit a
  // zero-length first chunk). Return the whole buffer.
  console.warn('[transcription] no Cluster found in first chunk — using full blob as init segment');
  return buf;
}

// ── Web Speech API shim ───────────────────────────────────────────────────────
interface SpeechRecognitionEvent {
  results: {
    [i: number]: {
      [j: number]: { transcript: string; confidence: number };
      isFinal: boolean;
      length: number;
    };
  };
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDeepgramTranscription(mic: UseMicrophoneReturn): UseDeepgramTranscriptionReturn {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [partial, setPartial] = useState<PartialTranscript | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [silenceWarning, setSilenceWarning] = useState<string | null>(null);

  const audioManager = useAudioInputManager(mic);

  // ── CRITICAL: route audioManager through a ref ────────────────────────────
  // audioManager is a new object every render (its state values change).
  // If stopListening/startListening close over audioManager directly they
  // become new functions on every render, which triggers their useEffect
  // cleanup → stopListening() → recorder.stop() after ~5ms.
  // Using a ref breaks the dependency chain entirely.
  const audioManagerRef = useRef(audioManager);
  useEffect(() => { audioManagerRef.current = audioManager; }, [audioManager]);

  const micRef = useRef(mic);
  useEffect(() => { micRef.current = mic; }, [mic]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const usingWebSpeechRef = useRef(false);
  const chunkSeqRef = useRef(0);
  const consecutiveSilentChunksRef = useRef(0);

  // WebM init segment — extracted from the first ondataavailable blob and
  // prepended to all subsequent blobs so each POST is a valid standalone file.
  const initSegmentRef = useRef<ArrayBuffer | null>(null);

  // Stream currently being recorded (stable ref, updated via effect).
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => { streamRef.current = audioManager.stream; }, [audioManager.stream]);

  // Level monitor
  const monitorCtxRef = useRef<AudioContext | null>(null);
  const monitorMeterRef = useRef<LevelMeter | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rmsWindowRef = useRef({ sum: 0, peak: 0, n: 0 });

  // Stable ref to sendChunk so ondataavailable doesn't capture a stale closure
  const sendChunkRef = useRef<(blob: Blob, seq: number, elapsed: number) => Promise<void>>(async () => {});
  const startWebSpeechRef = useRef<() => void>(() => {});

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
      setError('Deepgram is not configured and the Web Speech API is not supported (try Chrome or Edge).');
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

  // ── Send chunk to Deepgram via server ───────────────────────────────────────

  const sendChunk = useCallback(async (blob: Blob, seq: number, elapsedMs: number) => {
    const contentType = (blob.type || 'audio/webm').split(';')[0].trim();
    console.log(`[transcription] chunk #${seq} POSTing — size=${blob.size} elapsedMs=${elapsedMs} contentType=${contentType}`);

    // Verify EBML header is present before sending.
    void blob.slice(0, 4).arrayBuffer().then((head) => {
      const hex = Array.from(new Uint8Array(head)).map((x) => x.toString(16).padStart(2, '0')).join(' ');
      console.log(`[transcription] chunk #${seq} header bytes: ${hex}` +
        (hex === '1a 45 df a3' ? ' (valid WebM/EBML ✓)' : ' ← NOT a valid WebM header ✗'));
    });

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

      console.log(`[transcription] chunk #${seq} responded — HTTP ${res.status}`);

      if (res.status === 503) {
        console.warn('[transcription] Deepgram not configured (503) — falling back to Web Speech API');
        usingWebSpeechRef.current = true;
        startWebSpeechRef.current();
        return;
      }

      const data = await res.json().catch(() => ({ error: 'non-JSON response' })) as {
        transcript?: string; words?: DeepgramWord[]; confidence?: number; error?: string;
      };

      if (!res.ok || data.error) {
        console.error(`[transcription] chunk #${seq} error (HTTP ${res.status}):`, JSON.stringify(data, null, 2));
        setError(`Transcription failed (HTTP ${res.status}): ${data.error ?? 'unknown error'}`);
        return;
      }

      setError(null);
      const words = data.words ?? [];
      const text = words.length > 0
        ? words.map((w) => w.punctuated_word ?? w.word).join(' ').trim()
        : (data.transcript?.trim() ?? '');

      console.log(`[transcription] chunk #${seq} transcript — length=${text.length} words=${words.length}`);
      if (text) addLine(text, dominantSpeaker(words), Math.round((data.confidence ?? 0.8) * 100));
    } catch (err) {
      console.error(`[transcription] chunk #${seq} network error:`, err instanceof Error ? err.message : err);
    }
  }, [addLine]);

  useEffect(() => { sendChunkRef.current = sendChunk; }, [sendChunk]);

  // ── MediaRecorder setup ──────────────────────────────────────────────────────
  //
  // We use recorder.start(CHUNK_INTERVAL_MS) — timeslice mode. The recorder
  // runs for the ENTIRE call. ondataavailable fires every CHUNK_INTERVAL_MS.
  // stop() is called ONLY in stopListening() when End Call is pressed.
  //
  // WebM timeslice problem: the EBML initialization segment (codec info, track
  // layout) appears only in the FIRST ondataavailable blob. Subsequent blobs
  // contain raw Cluster elements — Deepgram cannot decode them without the header.
  //
  // Fix: extract the init segment from the first blob by scanning for the
  // Cluster element ID (1F 43 B6 75). Prepend that init segment to every
  // subsequent blob. Each POST then starts with a valid EBML header and is a
  // standalone decodable WebM file.

  const startRecorder = useCallback((stream: MediaStream) => {
    const tracks = stream.getAudioTracks();
    tracks.forEach((t, i) => {
      console.log(`[transcription] track[${i}] label="${t.label}" readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`);
    });

    const liveTracks = tracks.filter((t) => t.readyState === 'live');
    if (liveTracks.length === 0) {
      console.error('[transcription] all audio tracks ended — cannot record');
      setConnectionState('failed');
      setError('Microphone disconnected. Please check your audio device.');
      return;
    }

    const mimeType = bestMimeType();
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
    initSegmentRef.current = null;
    chunkSeqRef.current = 0;

    recorder.ondataavailable = (e) => {
      if (!shouldReconnectRef.current || usingWebSpeechRef.current) return;

      const seq = ++chunkSeqRef.current;
      const now = performance.now();

      console.log(`[transcription] chunk #${seq} ondataavailable — size=${e.data.size} state=${recorder.state}`);

      if (e.data.size < MIN_CHUNK_BYTES) {
        console.warn(`[transcription] chunk #${seq} too small (${e.data.size} bytes) — skipping`);
        return;
      }

      // RMS snapshot for this chunk
      const { sum, peak, n } = rmsWindowRef.current;
      const avgRms = n > 0 ? sum / n : -1;
      rmsWindowRef.current = { sum: 0, peak: 0, n: 0 }; // reset for next window

      console.log(`[transcription] chunk #${seq} RMS: avg=${avgRms.toFixed(4)} peak=${peak.toFixed(4)} samples=${n}`);

      // Silence detection
      if (n > 0 && peak < SILENCE_PEAK_THRESHOLD) {
        consecutiveSilentChunksRef.current += 1;
        const states = tracks.map((t, i) =>
          `track[${i}]: readyState=${t.readyState} muted=${t.muted}`
        ).join(' | ');
        console.warn(`[transcription] chunk #${seq} SILENT (peakRMS=${peak.toFixed(4)}) ` +
          `consecutive=${consecutiveSilentChunksRef.current} | ${states}`);
        if (consecutiveSilentChunksRef.current >= SILENCE_WARNING_CHUNKS) {
          const mutedTracks = tracks.filter((t) => t.muted);
          setSilenceWarning(mutedTracks.length > 0
            ? 'Microphone muted by OS — your audio device was taken by a phone call or Bluetooth app. Audio will resume when released.'
            : 'No audio detected. Check that your microphone is not muted and that echo cancellation is disabled.'
          );
        }
      } else if (n > 0) {
        if (consecutiveSilentChunksRef.current > 0) {
          console.log(`[transcription] chunk #${seq} audio restored after ${consecutiveSilentChunksRef.current} silent chunk(s)`);
          setSilenceWarning(null);
        }
        consecutiveSilentChunksRef.current = 0;
      }

      if (seq === 1) {
        // First chunk: contains EBML header + first N seconds of audio.
        // Extract and save the init segment (header only, up to first Cluster).
        // Send the full first blob as-is — it's already a valid standalone file.
        extractInitSegment(e.data).then((initSeg) => {
          initSegmentRef.current = initSeg;
          void sendChunkRef.current(e.data, seq, now);
        });
      } else {
        // Subsequent chunks: raw Cluster elements, no header.
        // Prepend saved init segment so Deepgram can decode independently.
        const init = initSegmentRef.current;
        const fullBlob = init
          ? new Blob([init, e.data], { type: recorder.mimeType || 'audio/webm' })
          : e.data;

        if (!init) {
          console.warn(`[transcription] chunk #${seq} — init segment not yet available, sending raw chunk`);
        }

        void sendChunkRef.current(fullBlob, seq, now);
      }
    };

    recorder.onstop = () => {
      console.log('[transcription] MediaRecorder stopped');
    };

    recorder.onerror = (e: Event) => {
      console.error('[transcription] MediaRecorder.onerror:', e);
    };

    try {
      // Timeslice: ondataavailable fires every CHUNK_INTERVAL_MS automatically.
      // The recorder runs until stop() is explicitly called.
      recorder.start(CHUNK_INTERVAL_MS);
      console.log(`[transcription] ===== MediaRecorder running =====`,
        `mimeType=${recorder.mimeType} timeslice=${CHUNK_INTERVAL_MS}ms pipeline=${PIPELINE_VERSION}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[transcription] MediaRecorder.start() threw:', msg);
      setError(`Could not start recording: ${msg}`);
      setConnectionState('failed');
    }
  }, []);

  // ── Level monitor + 1s heartbeat ───────────────────────────────────────────

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
      const stream = streamRef.current;
      const states = stream?.getAudioTracks()
        .map((t, i) => `[${i}] ${t.readyState}/${t.enabled ? 'on' : 'OFF'}/${t.muted ? 'MUTED' : 'ok'}`)
        .join(' ') ?? 'no stream';
      console.log(`[transcription] ♥ recorder=${rec?.state ?? 'none'} rms=${rms.toFixed(4)} peak=${peak.toFixed(4)} | ${states}`);
    }, 1000);
  }, []);

  // ── Public: startListening ──────────────────────────────────────────────────

  const startListening = useCallback(async (explicitStream?: MediaStream) => {
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    usingWebSpeechRef.current = false;
    consecutiveSilentChunksRef.current = 0;

    if (typeof window === 'undefined' || !window.MediaRecorder) {
      console.warn('[transcription] MediaRecorder unavailable — using Web Speech API');
      usingWebSpeechRef.current = true;
      startWebSpeechRef.current();
      return;
    }

    const rawStream = explicitStream ?? micRef.current.stream;
    if (!rawStream) {
      setError('Microphone is not active — cannot start transcription.');
      setConnectionState('failed');
      return;
    }

    setConnectionState('connecting');
    setError(null);
    setSilenceWarning(null);

    // Constraint audit
    const micTrack = rawStream.getAudioTracks()[0];
    if (micTrack) {
      const s = micTrack.getSettings();
      console.log('[transcription] constraint audit —',
        `device="${micTrack.label}"`,
        `sampleRate=${s.sampleRate ?? '?'}Hz`,
        `channelCount=${s.channelCount ?? '?'}`,
        `echoCancellation=${s.echoCancellation ?? '?'}`,
        `noiseSuppression=${s.noiseSuppression ?? '?'}`,
        `autoGainControl=${s.autoGainControl ?? '?'}`,
        `readyState=${micTrack.readyState}`,
        `muted=${micTrack.muted}`,
      );
      if (s.echoCancellation) {
        console.warn('[transcription] ⚠ echoCancellation=true — the browser will erase speakerphone audio as echo');
      }
      if (s.noiseSuppression) {
        console.warn('[transcription] ⚠ noiseSuppression=true — far-field audio (phone through speakers) will be attenuated');
      }
    }

    // Rebuild AudioInputManager so it picks up the latest mic stream.
    // We read audioManager through a ref (audioManagerRef) so this rebuild
    // does NOT cause stopListening to recreate and fire as cleanup.
    audioManagerRef.current.rebuild();
    const recordingStream = audioManagerRef.current.stream ?? rawStream;
    streamRef.current = recordingStream;

    await startMonitoring(recordingStream);

    setConnectionState('connected');
    setTranscriptionMode('deepgram');
    startRecorder(recordingStream);
  }, [startMonitoring, startRecorder]);

  // ── Public: stopListening ───────────────────────────────────────────────────
  // No deps that change on re-render — stable function identity across renders.

  const stopListening = useCallback(() => {
    shouldReconnectRef.current = false;
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
        console.log('[transcription] stop() called — End Call pressed');
        recorderRef.current.stop();
      }
      recorderRef.current = null;
    }

    if (speechRef.current) {
      speechRef.current.onend = null;
      try { speechRef.current.abort(); } catch { /* ignore */ }
      speechRef.current = null;
    }

    audioManagerRef.current.releaseAll();
    setConnectionState('idle');
    setPartial(null);
  }, []); // ← no deps: stable across all renders

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

  // ── Auto-restart on mic disconnect ──────────────────────────────────────────

  useEffect(() => {
    if (!shouldReconnectRef.current || mic.health !== 'disconnected') return;
    console.warn('[transcription] mic disconnected — attempting re-acquire');
    micRef.current.start().then((newStream) => {
      if (!newStream) {
        console.error('[transcription] re-acquire failed:', micRef.current.error);
        return;
      }
      console.log('[transcription] re-acquire succeeded — restarting recorder');
      audioManagerRef.current.rebuild();
      const recordingStream = audioManagerRef.current.stream ?? newStream;
      streamRef.current = recordingStream;
      // Stop the current recorder cleanly, then start fresh.
      if (recorderRef.current?.state !== 'inactive') {
        recorderRef.current?.stop();
      }
      recorderRef.current = null;
      startRecorder(recordingStream);
    }).catch((err) => {
      console.error('[transcription] re-acquire threw:', err instanceof Error ? err.message : err);
    });
  }, [mic.health, startRecorder]);

  // ── Cleanup on unmount only ─────────────────────────────────────────────────
  // IMPORTANT: the deps array is intentionally empty.
  // stopListening is stable (no changing deps), so this ref trick is not strictly
  // necessary — but using an explicit ref guarantees that even if stopListening
  // ever gains deps, the cleanup never fires on re-renders, only on unmount.
  const stopListeningRef = useRef(stopListening);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);
  useEffect(() => () => { stopListeningRef.current(); }, []); // unmount only

  return {
    transcript,
    partial,
    connectionState,
    transcriptionMode,
    isListening: connectionState === 'connected' || connectionState === 'reconnecting',
    error,
    startListening,
    stopListening,
    clearTranscript,
    correctSpeaker,
    enableSpeakerMode: audioManager.acquireSpeakerMode,
    disableSpeakerMode: audioManager.releaseSpeakerMode,
    audioWarning: audioManager.warning,
    silenceWarning,
  };
}
