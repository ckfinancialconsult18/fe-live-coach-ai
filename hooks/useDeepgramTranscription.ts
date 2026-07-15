'use client';

/**
 * Audio pipeline — deepgram-streaming-v1
 *
 * How audio flows from microphone to Deepgram (continuous, no gaps):
 *
 *  1. useMicrophone acquires the MediaStream from getUserMedia.
 *  2. useAudioInputManager optionally mixes system audio (speaker mode).
 *  3. MediaRecorder.start(TIMESLICE_MS=250) — timeslice mode.
 *     No stop/restart. One MediaRecorder instance runs for the entire call.
 *     The first ondataavailable event contains the WebM EBML header + first
 *     cluster. Every subsequent event is a cluster (no header). Deepgram's
 *     streaming API accepts this as a continuous WebM/Opus stream.
 *  4. Each ondataavailable blob is sent immediately via ws.send() on the
 *     browser WebSocket to /api/transcribe-ws on the custom Next.js server.
 *  5. server.ts (WebSocket upgrade handler) routes the connection to
 *     lib/transcribe-ws-server.ts, which opens a persistent Deepgram streaming
 *     WebSocket and proxies audio bytes through. DEEPGRAM_API_KEY never
 *     leaves the server.
 *  6. Deepgram fires Results events:
 *       is_final=false → server sends { type:'interim' } → setPartial()
 *       is_final=true  → server sends { type:'final'   } → addLine()
 *  7. In parallel, Web Speech API provides immediate (<100ms) interim text
 *     for display while Deepgram processes. Deepgram finals supersede Web
 *     Speech text with higher accuracy.
 *
 * Chunk boundaries never interrupt recognition because there ARE no chunk
 * boundaries — it's a single continuous stream.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import type { TranscriptLine } from '@/lib/types';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';
import { createLevelMeter, type LevelMeter } from '@/lib/audio/level-meter';
import { useAudioInputManager } from '@/hooks/useAudioInputManager';
import { emitPerf } from '@/lib/perf-bus';

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
  swapSpeakers: () => void;
  enableSpeakerMode: () => Promise<void>;
  disableSpeakerMode: () => void;
  audioWarning: string | null;
  silenceWarning: string | null;
  /** Active MediaRecorder timeslice interval in ms (100/150/200/250/300). */
  recorderIntervalMs: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_VERSION = 'deepgram-streaming-v1';

// MediaRecorder timeslice — configurable for benchmarking.
// Valid values: 100 | 150 | 200 | 250 | 300 ms.
// Change via localStorage key 'fe_recorder_interval_ms', then restart the call.
// Default 250 ms gives Deepgram enough data per chunk while keeping perceived
// latency low. See the Performance Debug Panel (Ctrl+Shift+D) for live metrics.
const VALID_INTERVALS = [100, 150, 200, 250, 300] as const;
const DEFAULT_TIMESLICE_MS = 250;
const LS_INTERVAL_KEY = 'fe_recorder_interval_ms';

function readStoredInterval(): number {
  if (typeof window === 'undefined') return DEFAULT_TIMESLICE_MS;
  const v = parseInt(localStorage.getItem(LS_INTERVAL_KEY) ?? '', 10);
  return (VALID_INTERVALS as readonly number[]).includes(v) ? v : DEFAULT_TIMESLICE_MS;
}

// Peak RMS below this = silent chunk
const SILENCE_PEAK_THRESHOLD = 0.01;
// Warn after this many consecutive silent heartbeat ticks (1 tick = 1 s)
const SILENCE_WARNING_TICKS = 3;
const MAX_RECONNECT = 5;

let lineSeq = 0;
function nextId() { return `dg-${++lineSeq}`; }

// ── Deepgram word type ────────────────────────────────────────────────────────

interface DgWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

interface WsServerMessage {
  type: 'auth_required' | 'connected' | 'interim' | 'final' | 'error' | 'speech-started';
  transcript?: string;
  words?: DgWord[];
  confidence?: number;
  message?: string;
  /** Server-side Date.now() when Deepgram result arrived. Used to measure
   *  the server→browser network leg independently of processing time. */
  serverTs?: number;
}

function dominantSpeaker(words: DgWord[], swapped: boolean): 'agent' | 'prospect' {
  if (!words.length) return 'agent';
  const counts: Record<number, number> = {};
  for (const w of words) {
    const s = w.speaker ?? 0;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  // Deepgram indexes voices by order of first appearance; we assume the first
  // voice (0) is the agent. When the prospect spoke first, `swapped` inverts
  // the mapping for the whole call (see swapSpeakers).
  const isFirstVoice = Number(top[0]) === 0;
  return isFirstVoice !== swapped ? 'agent' : 'prospect';
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
  const [recorderIntervalMs, setRecorderIntervalMs] = useState(DEFAULT_TIMESLICE_MS);

  const audioManager = useAudioInputManager(mic);

  // Route through refs so stopListening/startRecorder have [] deps and are stable
  const audioManagerRef = useRef(audioManager);
  useEffect(() => { audioManagerRef.current = audioManager; }, [audioManager]);
  const micRef = useRef(mic);
  useEffect(() => { micRef.current = mic; }, [mic]);

  // ── Core refs (no React state — avoid re-render cascade) ──────────────────
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  // Parallel Web Speech: interim-only partials while Deepgram processes
  const parallelSpeechRef = useRef<SpeechRecognitionInstance | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const usingWebSpeechRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => { streamRef.current = audioManager.stream; }, [audioManager.stream]);
  // Raw mic stream from the last startListening call — used to distinguish a
  // duplicate start (same stream → ignore) from a stale session left behind
  // after a mid-session device switch (different/dead stream → restart).
  const rawStreamRef = useRef<MediaStream | null>(null);
  // Inverts the Deepgram voice-index → agent/prospect mapping for this call
  // (used when the prospect happened to speak first).
  const speakersSwappedRef = useRef(false);

  // Level monitor
  const monitorCtxRef = useRef<AudioContext | null>(null);
  const monitorMeterRef = useRef<LevelMeter | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silentTicksRef = useRef(0); // consecutive silent heartbeat ticks

  // ── Latency tracking refs ─────────────────────────────────────────────────
  // lastSentAtRef: Date.now() when the most recent audio blob was ws.send()ed.
  // ws-rtt is measured as (result received) − lastSentAtRef.
  const lastSentAtRef = useRef<number>(0);
  // lastChunkPerfRef: performance.now() of the previous ondataavailable event.
  // recorder-interval is the gap between consecutive ondataavailable calls.
  const lastChunkPerfRef = useRef<number>(0);
  // Active interval — read once at startListening so a mid-call localStorage
  // change doesn't silently take effect partway through a recording.
  const activeIntervalMsRef = useRef<number>(DEFAULT_TIMESLICE_MS);

  // Stable function refs
  const startRecorderRef = useRef<() => void>(() => {});
  const openTranscribeWsRef = useRef<() => Promise<void>>(async () => {});
  const startWebSpeechRef = useRef<() => void>(() => {});
  const startParallelWebSpeechRef = useRef<() => void>(() => {});

  // ── addLine ───────────────────────────────────────────────────────────────

  const addLine = useCallback((text: string, speaker: 'agent' | 'prospect', confidence: number) => {
    if (!text.trim()) return;
    const t0 = performance.now();
    setPartial(null);
    setTranscript((prev) => [
      ...prev,
      { id: nextId(), speaker, text: text.trim(), timestamp: new Date(), speakerConfidence: confidence },
    ]);
    requestAnimationFrame(() => emitPerf('transcript-render', Math.round(performance.now() - t0)));
  }, []);

  // ── Web Speech fallback ───────────────────────────────────────────────────
  // Used only when MediaRecorder or Deepgram are unavailable.

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

  // ── Parallel Web Speech — real-time interim display ───────────────────────
  // Runs alongside the Deepgram streaming session. Only sets partial state
  // (never adds final lines). Deepgram finals call addLine() which clears it.
  // Gives <100ms perceived latency for interim display.

  const startParallelWebSpeech = useCallback(() => {
    if (usingWebSpeechRef.current) return;
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      if (usingWebSpeechRef.current) return;
      let interim = '';
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const result = e.results[i];
        if (!result.isFinal) interim += result[0]?.transcript ?? '';
      }
      if (interim.trim()) setPartial({ speaker: 'agent', text: interim.trim() });
    };
    recognition.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        console.warn('[transcription] parallel WebSpeech error:', e.error);
      }
    };
    recognition.onend = () => {
      if (shouldReconnectRef.current && !usingWebSpeechRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    parallelSpeechRef.current = recognition;
    try {
      recognition.start();
      console.log('[transcription] parallel WebSpeech started — fast interim partials active');
    } catch (err) {
      console.warn('[transcription] parallel WebSpeech failed to start:', err instanceof Error ? err.message : err);
    }
  }, []);

  useEffect(() => { startParallelWebSpeechRef.current = startParallelWebSpeech; }, [startParallelWebSpeech]);

  // ── Level monitor + silence detection ────────────────────────────────────

  const startMonitoring = useCallback(async (target: MediaStream) => {
    // Tear down any existing monitor first
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
      emitPerf('mic-latency', Math.round((mctx.baseLatency ?? 0) * 1000));
      console.log('[transcription] level monitor attached — baseLatency:', Math.round((mctx.baseLatency ?? 0) * 1000), 'ms');
    } catch (err) {
      console.warn('[transcription] level monitor unavailable:', err instanceof Error ? err.message : err);
    }

    silentTicksRef.current = 0;

    heartbeatRef.current = setInterval(() => {
      const meter = monitorMeterRef.current;
      const rms = meter?.getLevel() ?? -1;
      const peak = meter?.getPeak() ?? -1;

      if (meter) {
        if (peak >= 0 && peak < SILENCE_PEAK_THRESHOLD) {
          silentTicksRef.current++;
          if (silentTicksRef.current >= SILENCE_WARNING_TICKS) {
            const tracks = streamRef.current?.getAudioTracks() ?? [];
            const mutedTracks = tracks.filter((t) => t.muted);
            setSilenceWarning(
              mutedTracks.length > 0
                ? 'Microphone muted by OS — your audio device was taken by a phone call or Bluetooth app. Audio will resume when released.'
                : 'No audio detected. Check that your microphone is not muted and that echo cancellation is disabled.'
            );
          }
        } else if (peak >= SILENCE_PEAK_THRESHOLD) {
          if (silentTicksRef.current > 0) {
            console.log(`[transcription] audio restored after ${silentTicksRef.current}s of silence`);
            setSilenceWarning(null);
          }
          silentTicksRef.current = 0;
        }
      }

      const rec = recorderRef.current;
      const ws = wsRef.current;
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[transcription] ♥ pipeline=${PIPELINE_VERSION}` +
          ` recorder=${rec?.state ?? 'none'}` +
          ` ws=${ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][ws.readyState] ?? '?' : 'none'}` +
          ` rms=${rms.toFixed(4)} peak=${peak.toFixed(4)}`
        );
      }
    }, 1000);
  }, []);

  // ── startRecorder ─────────────────────────────────────────────────────────
  // Starts a single MediaRecorder in timeslice mode.
  // Each ondataavailable blob is sent immediately via the open WebSocket —
  // no accumulation, no stop/restart, no audio gap.

  const startRecorder = useCallback(() => {
    if (!shouldReconnectRef.current || usingWebSpeechRef.current) return;

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      console.warn('[transcription] startRecorder — recorder already active, skipping');
      return;
    }

    const stream = streamRef.current;
    if (!stream) { console.error('[transcription] startRecorder — no stream'); return; }

    const liveTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
    if (!liveTracks.length) { console.error('[transcription] startRecorder — all tracks ended'); return; }

    const mimeType = bestMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch (err) {
      console.error('[transcription] MediaRecorder constructor:', err instanceof Error ? err.message : err);
      return;
    }

    recorderRef.current = recorder;
    const timeslice = activeIntervalMsRef.current;
    lastChunkPerfRef.current = 0; // reset interval baseline for new recorder
    console.log(`[transcription] MediaRecorder.start(${timeslice}) — mimeType=${recorder.mimeType} pipeline=${PIPELINE_VERSION}`);

    recorder.ondataavailable = (e) => {
      if (e.data.size < 10) return; // skip empty/header-only fragments

      // ── Measure actual interval between chunks ──────────────────────────────
      const nowPerf = performance.now();
      if (lastChunkPerfRef.current > 0) {
        emitPerf('recorder-interval', Math.round(nowPerf - lastChunkPerfRef.current));
      }
      lastChunkPerfRef.current = nowPerf;

      emitPerf('chunk-size', e.data.size);

      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        // Record send timestamp for ws-rtt measurement
        lastSentAtRef.current = Date.now();
        ws.send(e.data);
      }
      // If WS is not yet open, the server buffers audio in audioQueue
    };

    recorder.onerror = (e) => {
      console.error('[transcription] MediaRecorder error:', e);
    };

    recorder.start(timeslice);
  }, []);

  useEffect(() => { startRecorderRef.current = startRecorder; }, [startRecorder]);

  // ── openTranscribeWs ──────────────────────────────────────────────────────
  // Opens a browser WebSocket to /api/transcribe-ws (served by server.ts).
  // Auth is sent as the first message after open (not in the URL) so the token
  // never appears in server access logs or browser history.
  //
  // New handshake sequence:
  //  1. WS opens → server sends { type: 'auth_required' }
  //  2. Client sends { type: 'auth', token: '<access_token>' }
  //  3. Server validates, opens Deepgram, sends { type: 'connected' }
  //  4. Client starts MediaRecorder and begins sending audio blobs

  const openTranscribeWs = useCallback(async () => {
    if (!shouldReconnectRef.current) return;

    // Close stale connection if any
    if (wsRef.current) {
      const old = wsRef.current;
      wsRef.current = null;
      old.onclose = null;
      if (old.readyState !== WebSocket.CLOSED && old.readyState !== WebSocket.CLOSING) {
        old.close(1000, 'Reopening');
      }
    }

    // Fetch auth token before opening — if we can't get one, fail fast
    const supabase = createSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError('Not authenticated — cannot start Deepgram streaming.');
      setConnectionState('failed');
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // No token in URL — auth is sent as first message after open
    const wsUrl = `${proto}//${window.location.host}/api/transcribe-ws`;
    console.log('[transcription] opening WebSocket to transcribe-ws proxy');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send auth immediately — server is waiting for this before opening Deepgram
      ws.send(JSON.stringify({ type: 'auth', token }));
      console.log('[transcription] WebSocket open — auth sent, waiting for Deepgram connection');
    };

    ws.onmessage = (event) => {
      let msg: WsServerMessage;
      try { msg = JSON.parse(event.data as string) as WsServerMessage; }
      catch { return; }

      if (msg.type === 'auth_required') {
        // Server is ready for auth (already sent in onopen, this is informational)
        return;

      } else if (msg.type === 'connected') {
        // Deepgram session is ready — NOW start the recorder.
        // First ondataavailable contains the WebM EBML header that Deepgram needs
        // to initialize its decoder. Starting here ensures no audio is sent before
        // Deepgram is ready to receive it.
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
        setTranscriptionMode('deepgram');
        setError(null);
        console.log('[transcription] Deepgram streaming session connected — starting MediaRecorder');
        startRecorderRef.current();

      } else if (msg.type === 'speech-started') {
        console.log(`[transcription] DG SpeechStarted serverTs=${msg.serverTs}`);

      } else if (msg.type === 'interim') {
        if (lastSentAtRef.current > 0) emitPerf('ws-rtt', Date.now() - lastSentAtRef.current);
        if (msg.serverTs) emitPerf('deepgram-latency', Date.now() - msg.serverTs);
        if (msg.transcript?.trim()) {
          setPartial({ speaker: 'agent', text: msg.transcript.trim() });
        }

      } else if (msg.type === 'final') {
        if (lastSentAtRef.current > 0) emitPerf('ws-rtt', Date.now() - lastSentAtRef.current);
        if (msg.serverTs) emitPerf('deepgram-latency', Date.now() - msg.serverTs);
        if (msg.transcript?.trim()) {
          addLine(
            msg.transcript,
            dominantSpeaker(msg.words ?? [], speakersSwappedRef.current),
            Math.round((msg.confidence ?? 0.8) * 100),
          );
        }

      } else if (msg.type === 'error') {
        console.error('[transcription] server error:', msg.message);
        if (msg.message?.includes('DEEPGRAM_API_KEY')) {
          usingWebSpeechRef.current = true;
          if (parallelSpeechRef.current) {
            parallelSpeechRef.current.onend = null;
            try { parallelSpeechRef.current.abort(); } catch { /* ignore */ }
            parallelSpeechRef.current = null;
          }
          startWebSpeechRef.current();
        } else {
          setError(`Transcription error: ${msg.message ?? 'unknown'}`);
        }
      }
    };

    ws.onclose = (event) => {
      console.log(`[transcription] WebSocket closed — code=${event.code} reason=${event.reason}`);
      if (wsRef.current === ws) wsRef.current = null;

      if (!shouldReconnectRef.current) return;

      if (event.code === 4001) {
        setError('Authentication failed — please refresh the page.');
        setConnectionState('failed');
        return;
      }
      if (event.code === 4029) {
        setError('Too many connections. Please wait before starting a new call.');
        setConnectionState('failed');
        return;
      }

      if (reconnectAttemptRef.current < MAX_RECONNECT) {
        reconnectAttemptRef.current++;
        setConnectionState('reconnecting');
        const delay = Math.min(500 * reconnectAttemptRef.current, 3000);
        console.log(`[transcription] reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT})`);

        if (recorderRef.current?.state !== 'inactive') {
          recorderRef.current?.stop();
        }
        recorderRef.current = null;

        reconnectTimerRef.current = setTimeout(() => {
          void openTranscribeWsRef.current();
        }, delay);
      } else {
        setConnectionState('failed');
        setError('Transcription connection lost after multiple reconnect attempts.');
      }
    };

    ws.onerror = () => {
      console.error('[transcription] WebSocket error');
    };
  }, [addLine]);

  useEffect(() => { openTranscribeWsRef.current = openTranscribeWs; }, [openTranscribeWs]);

  // ── startListening ────────────────────────────────────────────────────────

  const startListening = useCallback(async (explicitStream?: MediaStream) => {
    if (shouldReconnectRef.current) {
      // A session is still flagged active. Only ignore the start request if
      // that session is genuinely alive AND no new stream is being supplied.
      // Otherwise the flag is stale (e.g. the mic device was switched
      // mid-session, killing the old stream) — tear it down and start fresh.
      const prevTracks = streamRef.current?.getAudioTracks() ?? [];
      const prevAlive = prevTracks.some((t) => t.readyState === 'live');
      const sameStream = explicitStream ? explicitStream === rawStreamRef.current : true;
      if (prevAlive && sameStream) {
        console.warn('[transcription] startListening called while already active — ignoring');
        return;
      }
      console.warn('[transcription] stale session detected (stream replaced or ended) — restarting');
      stopListeningRef.current();
    }

    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    usingWebSpeechRef.current = false;
    speakersSwappedRef.current = false;
    silentTicksRef.current = 0;
    lastSentAtRef.current = 0;
    lastChunkPerfRef.current = 0;
    // Snapshot interval once per call so mid-call localStorage changes don't
    // take effect until the next call.
    activeIntervalMsRef.current = readStoredInterval();
    setRecorderIntervalMs(activeIntervalMsRef.current);

    // MediaRecorder unavailable → fall back to Web Speech only
    if (typeof window === 'undefined' || !window.MediaRecorder) {
      console.warn('[transcription] MediaRecorder unavailable — using Web Speech API');
      usingWebSpeechRef.current = true;
      startWebSpeechRef.current();
      return;
    }

    const rawStream = explicitStream ?? micRef.current.stream;
    if (!rawStream) {
      // Reset the active flag — otherwise this failed start permanently
      // blocks every future startListening call with "already active".
      shouldReconnectRef.current = false;
      setError('Microphone is not active — cannot start transcription.');
      setConnectionState('failed');
      return;
    }
    rawStreamRef.current = rawStream;

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
        `echoCancellation=${s.echoCancellation ?? '?'}`,
        `noiseSuppression=${s.noiseSuppression ?? '?'}`,
        `readyState=${micTrack.readyState}`,
      );
      if (s.echoCancellation) {
        console.warn('[transcription] ⚠ echoCancellation=true — may suppress speakerphone audio');
      }
    }

    audioManagerRef.current.rebuild();
    const recordingStream = audioManagerRef.current.stream ?? rawStream;
    streamRef.current = recordingStream;

    await startMonitoring(recordingStream);

    // Open WebSocket → Deepgram streaming session.
    // The MediaRecorder starts inside ws.onopen, so it never sends audio
    // before the WS connection is ready.
    await openTranscribeWsRef.current();

    // Refresh the Supabase token every 45 min so calls longer than 1 hour keep
    // a valid session. Supabase tokens expire at 60 min by default; refreshing
    // at 45 min gives a 15 min buffer. The new token is sent to the server via
    // a { type: 'reauth' } message so the connection stays authorised without
    // tearing down the Deepgram stream.
    const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;
    tokenRefreshTimerRef.current = setInterval(async () => {
      if (!shouldReconnectRef.current) return;
      const supabase = createSupabaseClient();
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !data.session) {
        console.warn('[transcription] token refresh failed — session may have expired:', refreshError?.message);
        return;
      }
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'reauth', token: data.session.access_token }));
        console.log('[transcription] token refreshed and sent to server');
      }
    }, TOKEN_REFRESH_INTERVAL_MS);

    // Parallel Web Speech for immediate (<100 ms) interim display
    startParallelWebSpeechRef.current();
  }, [startMonitoring]);

  // ── stopListening ─────────────────────────────────────────────────────────
  //
  // Must have [] deps — a stable identity is required so the useEffect cleanup
  // below does not fire on every render.

  const stopListening = useCallback(() => {
    console.log('[transcription] stopListening() — End Call');
    shouldReconnectRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (tokenRefreshTimerRef.current) {
      clearInterval(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }

    monitorMeterRef.current?.destroy();
    monitorMeterRef.current = null;
    if (monitorCtxRef.current && monitorCtxRef.current.state !== 'closed') {
      monitorCtxRef.current.close().catch(() => {});
    }
    monitorCtxRef.current = null;

    // Stop MediaRecorder — no more ondataavailable events
    if (recorderRef.current) {
      if (recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
    }

    // Close WebSocket — send zero-byte end-of-stream signal first
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.onclose = null; // prevent reconnect loop
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(new Uint8Array(0)); } catch { /* ignore */ }
        ws.close(1000, 'End Call');
      }
    }

    if (speechRef.current) {
      speechRef.current.onend = null;
      try { speechRef.current.abort(); } catch { /* ignore */ }
      speechRef.current = null;
    }
    if (parallelSpeechRef.current) {
      parallelSpeechRef.current.onend = null;
      try { parallelSpeechRef.current.abort(); } catch { /* ignore */ }
      parallelSpeechRef.current = null;
    }

    audioManagerRef.current.releaseAll();
    setConnectionState('idle');
    setPartial(null);
  }, []); // permanently stable — never recreated

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setPartial(null);
    lineSeq = 0;
  }, []);

  // Flip agent/prospect for the whole call: retroactively on every existing
  // line, and for all future lines via the inverted voice-index mapping.
  // One click fixes a call where the prospect happened to speak first.
  const swapSpeakers = useCallback(() => {
    speakersSwappedRef.current = !speakersSwappedRef.current;
    setTranscript((prev) =>
      prev.map((line) => ({
        ...line,
        speaker: line.speaker === 'agent' ? 'prospect' : 'agent',
      }))
    );
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

  // ── Auto-restart on mic disconnect ────────────────────────────────────────

  useEffect(() => {
    if (!shouldReconnectRef.current || mic.health !== 'disconnected') return;
    console.warn('[transcription] mic disconnected — attempting re-acquire');
    micRef.current.start().then((newStream) => {
      if (!newStream) { console.error('[transcription] re-acquire failed'); return; }
      audioManagerRef.current.rebuild();
      streamRef.current = audioManagerRef.current.stream ?? newStream;
      // The running recorder keeps the stream alive; new chunks will pick up the
      // rebuilt stream tracks automatically via the same MediaStream reference.
    }).catch((err) => {
      console.error('[transcription] re-acquire threw:', err instanceof Error ? err.message : err);
    });
  }, [mic.health]);

  // ── Cleanup on unmount only ───────────────────────────────────────────────
  const stopListeningRef = useRef(stopListening);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);
  useEffect(() => () => { stopListeningRef.current(); }, []);

  return {
    transcript,
    partial,
    connectionState,
    transcriptionMode,
    isListening: connectionState === 'connected' || connectionState === 'reconnecting' || connectionState === 'connecting',
    error,
    startListening,
    stopListening,
    clearTranscript,
    correctSpeaker,
    swapSpeakers,
    enableSpeakerMode: audioManager.acquireSpeakerMode,
    disableSpeakerMode: audioManager.releaseSpeakerMode,
    audioWarning: audioManager.warning,
    silenceWarning,
    recorderIntervalMs,
  };
}
