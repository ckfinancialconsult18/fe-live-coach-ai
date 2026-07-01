'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptLine } from '@/lib/types';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';

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
  /** Which STT backend is active: Deepgram Nova-3 (chunked) or browser Web Speech API fallback. */
  transcriptionMode: TranscriptionMode | null;
  isListening: boolean;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  clearTranscript: () => void;
  correctSpeaker: (lineId: string) => void;
}

const MAX_RECONNECT = 5;
const RECONNECT_BASE_MS = 1000;
const CHUNK_INTERVAL_MS = 3000;

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

// ── Web Speech API minimal type shim ──────────────────────────────────────────
interface SpeechRecognitionEvent {
  results: { [i: number]: { [j: number]: { transcript: string; confidence: number }; isFinal: boolean; length: number } };
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent { error: string; message?: string }
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
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

  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micRef = useRef(mic);
  // Set to true once we decide to use Web Speech (so onstop doesn't re-start Deepgram)
  const usingWebSpeechRef = useRef(false);

  // Function refs — updated each render so MediaRecorder callbacks never hold stale closures
  const startWebSpeechRef = useRef<() => void>(() => {});
  const startDeepgramRef = useRef<() => void>(() => {});

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
      setError(
        'Deepgram is not configured and the Web Speech API is not supported by this browser (try Chrome or Edge). ' +
        'Live transcription cannot start.'
      );
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
        } else {
          interim += text;
        }
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

  // ── Deepgram chunked transcription ──────────────────────────────────────────
  // Audio is captured via MediaRecorder in CHUNK_INTERVAL_MS slices.
  // Each slice is POSTed to /api/transcribe, which calls Deepgram's pre-recorded
  // REST API server-side using DEEPGRAM_API_KEY. The API key never leaves the server.

  const sendChunk = useCallback(async (blob: Blob) => {
    if (!blob.size) return;

    // Strip codec parameters — Deepgram accepts base MIME type only in Content-Type
    const contentType = (blob.type || 'audio/webm').split(';')[0].trim();

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: blob,
      });

      if (res.status === 503) {
        // DEEPGRAM_API_KEY not set on server — fall back to Web Speech API
        console.warn('[transcription] Deepgram not configured (503), switching to Web Speech API');
        usingWebSpeechRef.current = true;
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        startWebSpeechRef.current();
        return;
      }

      if (!res.ok) {
        console.error('[transcription] /api/transcribe returned', res.status);
        return; // Skip this chunk but keep recording
      }

      const data = await res.json() as {
        transcript?: string;
        words?: DeepgramWord[];
        confidence?: number;
        error?: string;
      };

      if (data.error) {
        console.error('[transcription] server error in chunk response:', data.error);
        return;
      }

      const words = data.words ?? [];
      const text = words.length > 0
        ? words.map((w) => w.punctuated_word ?? w.word).join(' ').trim()
        : (data.transcript?.trim() ?? '');

      if (!text) return;

      addLine(text, dominantSpeaker(words), Math.round((data.confidence ?? 0.8) * 100));
    } catch (err) {
      console.error('[transcription] sendChunk network error:', err instanceof Error ? err.message : err);
    }
  }, [addLine]);

  const startDeepgram = useCallback(() => {
    const currentMic = micRef.current;
    if (!currentMic.stream) {
      setError('Microphone is not active — cannot start transcription.');
      setConnectionState('failed');
      return;
    }

    if (typeof window === 'undefined' || !window.MediaRecorder) {
      console.warn('[transcription] MediaRecorder not available, using Web Speech API');
      usingWebSpeechRef.current = true;
      startWebSpeechRef.current();
      return;
    }

    // Pick the first supported container format
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

    setConnectionState('connecting');
    setError(null);
    usingWebSpeechRef.current = false;

    try {
      const recorder = new MediaRecorder(currentMic.stream, mimeType ? { mimeType } : {});
      recorderRef.current = recorder;

      recorder.onstart = () => {
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
        setTranscriptionMode('deepgram');
        console.log('[transcription] MediaRecorder started — mimeType:', recorder.mimeType);
      };

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          // Fire-and-forget: errors are caught inside sendChunk
          void sendChunk(e.data);
        }
      };

      recorder.onerror = (e: Event) => {
        console.error('[transcription] MediaRecorder error:', e);
        setError('Recording error occurred.');
      };

      recorder.onstop = () => {
        recorderRef.current = null;
        if (usingWebSpeechRef.current) return; // Switching to Web Speech — don't reconnect Deepgram
        if (shouldReconnectRef.current && reconnectAttemptRef.current < MAX_RECONNECT) {
          reconnectAttemptRef.current++;
          setConnectionState('reconnecting');
          reconnectTimerRef.current = setTimeout(() => startDeepgramRef.current(), RECONNECT_BASE_MS);
        } else {
          setConnectionState('idle');
        }
      };

      recorder.start(CHUNK_INTERVAL_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not start recording: ${msg}`);
      setConnectionState('failed');
      console.error('[transcription] MediaRecorder.start() threw:', msg);
    }
  }, [sendChunk]);

  useEffect(() => { startDeepgramRef.current = startDeepgram; }, [startDeepgram]);

  // ── Public API ──────────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    usingWebSpeechRef.current = false;
    startDeepgramRef.current();
  }, []);

  const stopListening = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (recorderRef.current) {
      if (recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop(); // triggers final ondataavailable + onstop
      }
      recorderRef.current = null;
    }
    if (speechRef.current) {
      speechRef.current.onend = null; // prevent auto-reconnect
      try { speechRef.current.abort(); } catch { /* ignore NotSupportedError */ }
      speechRef.current = null;
    }
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
  };
}
