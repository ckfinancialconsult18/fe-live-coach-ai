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
const PIPELINE_VERSION = 'stop-restart-v2';

const MAX_RECONNECT = 5;
// How long each recording segment runs. Each stop+start cycle produces a
// complete, self-contained WebM file that Deepgram can decode as-is.
const CHUNK_INTERVAL_MS = 4000;
// Minimum blob size to bother uploading (avoids POSTing empty/header-only blobs).
const MIN_CHUNK_BYTES = 1000;
// RMS peak below this across a whole chunk → the chunk contained only silence.
const SILENCE_PEAK_THRESHOLD = 0.01;
// How many consecutive silent chunks before we surface a warning to the user.
const SILENCE_WARNING_CHUNKS = 2;

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

  // ── Route audioManager and mic through refs ────────────────────────────────
  //
  // CRITICAL: audioManager is a new object on every render (its stream/warning
  // state changes). If stopListening or startChunkCycle close over audioManager
  // directly they become new functions every render. The old code had:
  //   useEffect(() => () => stopListening(), [stopListening])
  // which fired its cleanup on EVERY stopListening identity change — stopping
  // the recorder milliseconds after it started (the "5ms stop" bug).
  //
  // Fix: access audioManager through audioManagerRef so both stopListening and
  // startChunkCycle have [] deps and are permanently stable.
  const audioManagerRef = useRef(audioManager);
  useEffect(() => { audioManagerRef.current = audioManager; }, [audioManager]);

  const micRef = useRef(mic);
  useEffect(() => { micRef.current = mic; }, [mic]);

  // ── Recorder state (all refs — no React state for recording machinery) ──────
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  // Timer that calls recorder.stop() after CHUNK_INTERVAL_MS.
  // Only stopListening() (End Call) clears this without scheduling a restart.
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const usingWebSpeechRef = useRef(false);
  const chunkSeqRef = useRef(0);
  const consecutiveSilentChunksRef = useRef(0);

  // The stream currently being recorded. Updated when the audio manager rebuilds
  // (e.g. speaker-mode acquired, device switch mid-call).
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => { streamRef.current = audioManager.stream; }, [audioManager.stream]);

  // Level monitor
  const monitorCtxRef = useRef<AudioContext | null>(null);
  const monitorMeterRef = useRef<LevelMeter | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rmsWindowRef = useRef({ sum: 0, peak: 0, n: 0 });

  // Stable function refs so MediaRecorder callbacks never close over stale values.
  const sendChunkRef = useRef<(blob: Blob, seq: number, elapsed: number) => Promise<void>>(async () => {});
  const startChunkCycleRef = useRef<() => void>(() => {});
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
    // Strip codec params: "audio/webm;codecs=opus" → "audio/webm"
    const contentType = (blob.type || 'audio/webm').split(';')[0].trim();

    // Log first 32 bytes in hex so server logs show if the EBML header is present.
    void blob.slice(0, 32).arrayBuffer().then((head) => {
      const hex = Array.from(new Uint8Array(head)).map((x) => x.toString(16).padStart(2, '0')).join(' ');
      const isWebM = hex.startsWith('1a 45 df a3');
      const isOgg  = hex.startsWith('4f 67 67 53');
      const valid  = isWebM || isOgg;
      console.log(
        `[transcription] chunk #${seq} header: ${hex.slice(0, 47)}…` +
        ` | ${valid ? (isWebM ? 'valid WebM/EBML ✓' : 'valid Ogg ✓') : 'UNKNOWN FORMAT ✗ — Deepgram will reject this'}`
      );
      if (!valid) {
        console.error(`[transcription] chunk #${seq} INVALID — raw bytes are not WebM or Ogg. ` +
          `blob.type=${blob.type} blob.size=${blob.size} elapsedMs=${elapsedMs}`);
      }
    });

    console.log(`[transcription] chunk #${seq} uploading — size=${blob.size} elapsedMs=${Math.round(elapsedMs)} contentType=${contentType} pipeline=${PIPELINE_VERSION}`);

    if (blob.size < MIN_CHUNK_BYTES) {
      console.warn(`[transcription] chunk #${seq} too small (${blob.size} < ${MIN_CHUNK_BYTES} bytes) — skipping upload`);
      return;
    }

    if (elapsedMs < 1000) {
      console.warn(`[transcription] chunk #${seq} duration too short (${Math.round(elapsedMs)}ms < 1000ms) — skipping upload`);
      return;
    }

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

      console.log(`[transcription] chunk #${seq} response — HTTP ${res.status}`);

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

  // ── Stop/restart chunk cycle ────────────────────────────────────────────────
  //
  // WHY stop/restart instead of timeslice:
  //
  // MediaRecorder.start(N) (timeslice): ondataavailable fires every N ms but
  // each blob is a *streaming WebM fragment* — the Segment element size is set
  // to "unknown" (01 FF FF FF FF FF FF FF) and each blob is an incomplete file.
  // Deepgram's pre-recorded REST API requires a *complete* audio file and rejects
  // these fragments with HTTP 400 "corrupt or unsupported data".
  //
  // MediaRecorder.start() + stop(): each cycle produces a *complete, self-
  // contained WebM file* with a proper header and terminated Segment. Deepgram
  // decodes these reliably. The cost is a new MediaRecorder instance per chunk —
  // that's fine; the overhead is negligible compared to the 4s cycle time.
  //
  // The previous version used stop/restart but the React cleanup loop was firing
  // stopListening() after 5ms (stopListening depended on [audioManager] which
  // changed on every render). That is fixed by routing audioManager through a
  // ref so stopListening has [] deps and is permanently stable.

  const startChunkCycle = useCallback(() => {
    if (!shouldReconnectRef.current || usingWebSpeechRef.current) return;

    // Bug 4 fix: guard against a second recorder being created while one is
    // already recording (e.g. onstop fires and calls startChunkCycle while a
    // concurrent call path already started a new cycle).
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      console.warn('[transcription] startChunkCycle — recorder already active, ignoring duplicate call');
      return;
    }

    const stream = streamRef.current;
    if (!stream) {
      console.error('[transcription] startChunkCycle — no stream');
      return;
    }

    const liveTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
    if (liveTracks.length === 0) {
      console.error('[transcription] startChunkCycle — all tracks ended');
      return;
    }

    const mimeType = bestMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch (err) {
      console.error('[transcription] MediaRecorder constructor threw:', err instanceof Error ? err.message : err);
      return;
    }

    recorderRef.current = recorder;

    const seq = ++chunkSeqRef.current;
    const chunks: Blob[] = [];
    const startedAt = performance.now();

    console.log(`[transcription] chunk #${seq} ===== MediaRecorder.start() ===== mimeType=${recorder.mimeType} pipeline=${PIPELINE_VERSION}`);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const elapsed = performance.now() - startedAt;
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });

      console.log(`[transcription] chunk #${seq} onstop — elapsed=${Math.round(elapsed)}ms blob.size=${blob.size} blob.type=${blob.type}`);

      // RMS snapshot for this chunk window
      const { sum, peak, n } = rmsWindowRef.current;
      const avgRms = n > 0 ? sum / n : -1;
      rmsWindowRef.current = { sum: 0, peak: 0, n: 0 };

      console.log(`[transcription] chunk #${seq} RMS: avg=${avgRms.toFixed(4)} peak=${peak.toFixed(4)} samples=${n}`);

      // Silence detection
      const tracks = stream.getAudioTracks();
      if (n > 0 && peak < SILENCE_PEAK_THRESHOLD) {
        consecutiveSilentChunksRef.current += 1;
        const states = tracks.map((t, i) => `track[${i}]: readyState=${t.readyState} muted=${t.muted}`).join(' | ');
        console.warn(`[transcription] chunk #${seq} SILENT peakRMS=${peak.toFixed(4)} consecutive=${consecutiveSilentChunksRef.current} | ${states}`);
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

      // Upload the completed chunk
      void sendChunkRef.current(blob, seq, elapsed);

      // Schedule next cycle — only if shouldReconnect is still true
      // (stopListening sets it false so this never fires after End Call)
      if (shouldReconnectRef.current) {
        startChunkCycleRef.current();
      }
    };

    recorder.onerror = (e: Event) => {
      console.error('[transcription] MediaRecorder.onerror:', e);
    };

    recorder.start();

    // Schedule this chunk's stop. stopListening() cancels this timer (End Call path).
    chunkTimerRef.current = setTimeout(() => {
      console.log(`[transcription] chunk #${seq} timer fired — calling stop() after ${CHUNK_INTERVAL_MS}ms`);
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    }, CHUNK_INTERVAL_MS);
  }, []); // [] — no React state deps; reads everything through stable refs

  useEffect(() => { startChunkCycleRef.current = startChunkCycle; }, [startChunkCycle]);

  // ── Level monitor + 1s heartbeat ───────────────────────────────────────────

  const startMonitoring = useCallback(async (target: MediaStream) => {
    // Bug 3 fix: teardown any existing monitor before creating a new one.
    // Without this, a second startListening call leaks the AudioContext and
    // leaves an orphan heartbeat interval running in parallel.
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    monitorMeterRef.current?.destroy(); monitorMeterRef.current = null;
    if (monitorCtxRef.current && monitorCtxRef.current.state !== 'closed') {
      monitorCtxRef.current.close().catch(() => {});
    }
    monitorCtxRef.current = null;

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
    // Bug 1 fix: re-entrancy guard. startListening can be called a second time
    // during the 'connecting' window because isListening is false until
    // connectionState reaches 'connected'. Without this guard, a second click
    // creates a second recorder, second heartbeat, and second chunk cycle.
    if (shouldReconnectRef.current) {
      console.warn('[transcription] startListening called while already active — ignoring duplicate call');
      return;
    }

    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    usingWebSpeechRef.current = false;
    consecutiveSilentChunksRef.current = 0;
    chunkSeqRef.current = 0;

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
    }

    // Rebuild via ref so this rebuild does NOT cause stopListening to
    // recreate (audioManagerRef.current has no impact on deps).
    audioManagerRef.current.rebuild();
    const recordingStream = audioManagerRef.current.stream ?? rawStream;
    streamRef.current = recordingStream;

    await startMonitoring(recordingStream);

    setConnectionState('connected');
    setTranscriptionMode('deepgram');

    // Start the first chunk cycle. Subsequent cycles are self-scheduling
    // via onstop until shouldReconnectRef becomes false (End Call).
    startChunkCycleRef.current();
  }, [startMonitoring]); // startChunkCycle accessed via ref — not a dep

  // ── Public: stopListening ───────────────────────────────────────────────────
  //
  // MUST have [] deps. If it depended on audioManager (a new object every
  // render) it would be recreated on every render, which caused the old
  // useEffect cleanup to fire stopListening() after ~5ms.

  const stopListening = useCallback(() => {
    console.log('[transcription] stopListening() — End Call');
    shouldReconnectRef.current = false;

    // Cancel the in-flight chunk timer. Without this the timer fires,
    // recorder.stop() runs, onstop uploads the partial chunk, and then
    // startChunkCycle would restart (but shouldReconnect=false prevents that).
    // Cancelling here just avoids the extraneous partial-chunk upload.
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    monitorMeterRef.current?.destroy();
    monitorMeterRef.current = null;
    if (monitorCtxRef.current && monitorCtxRef.current.state !== 'closed') {
      monitorCtxRef.current.close().catch(() => {});
    }
    monitorCtxRef.current = null;

    if (recorderRef.current) {
      if (recorderRef.current.state !== 'inactive') {
        console.log('[transcription] stopping active recorder for final chunk');
        recorderRef.current.stop();
      }
      recorderRef.current = null;
    }

    if (speechRef.current) {
      speechRef.current.onend = null;
      try { speechRef.current.abort(); } catch { /* ignore */ }
      speechRef.current = null;
    }

    audioManagerRef.current.releaseAll(); // uses ref — no audioManager dep
    setConnectionState('idle');
    setPartial(null);
  }, []); // ← permanently stable — never recreated

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
      console.log('[transcription] re-acquire succeeded — rebuilding stream');
      audioManagerRef.current.rebuild();
      streamRef.current = audioManagerRef.current.stream ?? newStream;
      // The current chunk cycle will finish naturally; onstop calls
      // startChunkCycle which picks up the new streamRef.current.
    }).catch((err) => {
      console.error('[transcription] re-acquire threw:', err instanceof Error ? err.message : err);
    });
  }, [mic.health]);

  // ── Cleanup on unmount only ─────────────────────────────────────────────────
  //
  // [] deps: fires ONLY when the component unmounts, never on re-renders.
  // stopListening is stable ([] deps above) so the ref indirection here is
  // redundant — kept for belt-and-suspenders safety.
  const stopListeningRef = useRef(stopListening);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);
  useEffect(() => () => { stopListeningRef.current(); }, []); // unmount only

  return {
    transcript,
    partial,
    connectionState,
    transcriptionMode,
    // Bug 5 fix: include 'connecting' so the button switches to End Call the
    // instant Start Call is pressed, closing the window where a second click
    // could start a duplicate session before the recorder is ready.
    isListening: connectionState === 'connected' || connectionState === 'reconnecting' || connectionState === 'connecting',
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
