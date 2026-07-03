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
}

// Sent as x-pipeline-version with every chunk so server logs show which
// client bundle is actually running (survives CDN/cache confusion).
const PIPELINE_VERSION = 'audio-manager-v1';

const MAX_RECONNECT = 5;
// How long each recording segment runs before being sent to Deepgram.
// Each stop+start cycle produces a complete, self-contained WebM file.
const CHUNK_INTERVAL_MS = 4000;
// Minimum blob size to bother sending (avoids POSTing empty/header-only blobs)
const MIN_CHUNK_BYTES = 500;
// RMS peak below this across a whole chunk → the chunk contained only silence.
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

  // AudioInputManager owns which sources are active and produces the merged stream.
  const audioManager = useAudioInputManager(mic);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const usingWebSpeechRef = useRef(false);
  const chunkSeqRef = useRef(0);
  // Level monitor + heartbeat for diagnosing silent chunks
  const monitorCtxRef = useRef<AudioContext | null>(null);
  const monitorMeterRef = useRef<LevelMeter | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // RMS accumulated over the current chunk window (filled by heartbeat)
  const rmsWindowRef = useRef({ sum: 0, peak: 0, n: 0 });

  // Keep a stable ref to the current stream so MediaRecorder callbacks don't
  // close over a stale value from an earlier render.
  const streamRef = useRef(audioManager.stream);
  useEffect(() => { streamRef.current = audioManager.stream; }, [audioManager.stream]);

  // Stable function refs for use inside MediaRecorder / setTimeout callbacks
  const startChunkCycleRef = useRef<() => void>(() => {});
  const sendChunkRef = useRef<(blob: Blob, seq: number, durationMs: number) => Promise<void>>(async () => {});
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
        console.warn('[transcription] Deepgram not configured (503) — falling back to Web Speech API');
        usingWebSpeechRef.current = true;
        startWebSpeechRef.current();
        return;
      }

      const data = await res.json().catch(() => ({ error: 'non-JSON response' })) as {
        transcript?: string; words?: DeepgramWord[]; confidence?: number; error?: string;
      };

      if (!res.ok || data.error) {
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

      console.log(`[transcription] chunk #${seq} transcript — length=${text.length} words=${words.length}`);
      if (text) addLine(text, dominantSpeaker(words), Math.round((data.confidence ?? 0.8) * 100));
    } catch (err) {
      console.error(`[transcription] chunk #${seq} network error:`, err instanceof Error ? err.message : err);
    }
  }, [addLine]);

  useEffect(() => { sendChunkRef.current = sendChunk; }, [sendChunk]);

  // ── One recording cycle: start → stop → POST → repeat ──────────────────────
  //
  // We do NOT use MediaRecorder.start(timeslice). Timeslice mode emits the WebM
  // initialization segment (EBML header) only in the very first ondataavailable
  // event; subsequent events carry raw media segments with no header, which
  // Deepgram cannot decode (returns 400 → server returns 502).
  //
  // Instead: start with no timeslice, explicitly stop after CHUNK_INTERVAL_MS.
  // Each stop/start cycle produces a complete, self-contained WebM file.

  const startChunkCycle = useCallback(() => {
    if (!shouldReconnectRef.current || usingWebSpeechRef.current) return;

    const stream = streamRef.current;
    if (!stream) {
      console.error('[transcription] no audio stream — cannot start chunk cycle');
      setConnectionState('failed');
      setError('No audio stream available. Check microphone permissions.');
      return;
    }

    const seq = ++chunkSeqRef.current;
    const startedAt = performance.now();
    const tracks = stream.getAudioTracks();

    tracks.forEach((t, i) => {
      console.log(`[transcription] chunk #${seq} track[${i}] label="${t.label}" readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`);
    });

    const liveTracks = tracks.filter((t) => t.readyState === 'live');
    if (liveTracks.length === 0) {
      console.error('[transcription] all audio tracks ended — cannot record');
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
    rmsWindowRef.current = { sum: 0, peak: 0, n: 0 };

    recorder.ondataavailable = (e) => {
      console.log(`[transcription] chunk #${seq} ondataavailable — size=${e.data.size} ` +
        `state=${recorder.state} elapsedMs=${Math.round(performance.now() - startedAt)}`);
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const durationMs = Math.round(performance.now() - startedAt);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const { sum, peak, n } = rmsWindowRef.current;
      const avgRms = n > 0 ? sum / n : -1;

      console.log(`[transcription] chunk #${seq} complete — blob.size=${blob.size} durationMs=${durationMs} ` +
        `blob.type=${blob.type} avgRMS=${avgRms.toFixed(4)} peakRMS=${peak.toFixed(4)} rmsSamples=${n}`);

      if (n > 0 && peak < SILENCE_PEAK_THRESHOLD) {
        const states = tracks.map((t, i) =>
          `track[${i}]: readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`
        ).join(' | ');
        console.warn(`[transcription] chunk #${seq} contained ONLY SILENCE (peakRMS=${peak.toFixed(4)}). ` +
          `Causes: (1) OS took the input device (phone call/Bluetooth switched modes); ` +
          `(2) echo cancellation zeroed the signal; (3) merge AudioContext is suspended. ` +
          `Current track states: ${states}`);
      }

      // Verify the blob starts with a WebM container header (EBML magic bytes 1a 45 df a3).
      void blob.slice(0, 4).arrayBuffer().then((head) => {
        const hex = Array.from(new Uint8Array(head)).map((x) => x.toString(16).padStart(2, '0')).join(' ');
        console.log(`[transcription] chunk #${seq} header bytes: ${hex}` +
          (hex === '1a 45 df a3' ? ' (valid WebM/EBML ✓)' : ' ← NOT a valid WebM header'));
      });

      if (blob.size >= MIN_CHUNK_BYTES) {
        void sendChunkRef.current(blob, seq, durationMs);
      } else {
        console.warn(`[transcription] chunk #${seq} too small (${blob.size} bytes) — skipping`);
      }

      if (shouldReconnectRef.current && !usingWebSpeechRef.current) {
        startChunkCycleRef.current();
      }
    };

    recorder.onerror = (e: Event) => {
      console.error(`[transcription] chunk #${seq} MediaRecorder.onerror:`, e);
    };

    try {
      recorder.start(); // no timeslice — run until explicitly stopped
      console.log(`[transcription] chunk #${seq} MediaRecorder running — mimeType=${recorder.mimeType} | stopping in ${CHUNK_INTERVAL_MS}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[transcription] MediaRecorder.start() threw:', msg);
      setError(`Could not start recording: ${msg}`);
      setConnectionState('failed');
      return;
    }

    chunkTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    }, CHUNK_INTERVAL_MS);
  }, []);

  useEffect(() => { startChunkCycleRef.current = startChunkCycle; }, [startChunkCycle]);

  // ── Level monitor + 1s heartbeat ───────────────────────────────────────────
  // Samples RMS every second. Feeds the per-chunk silence detector and gives
  // a continuous ground-truth log of "is audio actually flowing right now".

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
        .map((t, i) => `[${i}] ${t.readyState}/${t.enabled ? 'enabled' : 'DISABLED'}/${t.muted ? 'MUTED' : 'unmuted'}`)
        .join(' ') ?? 'no stream';
      console.log(`[transcription] ♥ recorder=${rec?.state ?? 'none'} rms=${rms.toFixed(4)} peak=${peak.toFixed(4)} tracks: ${states}`);
    }, 1000);
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────────

  const startListening = useCallback(async (explicitStream?: MediaStream) => {
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    usingWebSpeechRef.current = false;
    chunkSeqRef.current = 0;

    console.log(`[transcription] ===== starting — pipeline: ${PIPELINE_VERSION} =====`);

    if (typeof window === 'undefined' || !window.MediaRecorder) {
      console.warn('[transcription] MediaRecorder unavailable — using Web Speech API');
      usingWebSpeechRef.current = true;
      startWebSpeechRef.current();
      return;
    }

    // The caller may pass the stream directly when React state in mic.stream
    // hasn't flushed yet (mic.start() called immediately before startListening).
    if (!mic.stream && !explicitStream) {
      setError('Microphone is not active — cannot start transcription.');
      setConnectionState('failed');
      return;
    }

    setConnectionState('connecting');
    setError(null);

    // Rebuild ensures AudioInputManager reflects the latest mic stream.
    audioManager.rebuild();

    const recordingStream = audioManager.stream ?? explicitStream ?? mic.stream;
    streamRef.current = recordingStream;

    await startMonitoring(recordingStream!);

    setConnectionState('connected');
    setTranscriptionMode('deepgram');
    startChunkCycleRef.current();
  }, [mic.stream, audioManager, startMonitoring]);

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
      if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      recorderRef.current = null;
    }
    if (speechRef.current) {
      speechRef.current.onend = null;
      try { speechRef.current.abort(); } catch { /* ignore */ }
      speechRef.current = null;
    }

    audioManager.releaseAll();
    setConnectionState('idle');
    setPartial(null);
  }, [audioManager]);

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
  };
}
