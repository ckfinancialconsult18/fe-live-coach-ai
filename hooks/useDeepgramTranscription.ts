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
  /** Which STT backend is active: Deepgram Nova-3 or browser Web Speech API fallback. */
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

let lineSeq = 0;
function nextId() { return `dg-${++lineSeq}`; }

// Deepgram response types (minimal — only what we consume)
interface DeepgramWord {
  word: string;
  speaker?: number;
  confidence?: number;
  punctuated_word?: string;
}
interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}
interface DeepgramResultsEvent {
  type: 'Results';
  channel: { alternatives: DeepgramAlternative[] };
  is_final: boolean;
  speech_final: boolean;
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

  const wsRef = useRef<WebSocket | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const micRef = useRef(mic);
  const connectRef = useRef<() => Promise<void>>(async () => {});
  // Accumulate is_final chunks until speech_final flushes them as one line
  const finalBufferRef = useRef('');
  const finalSpeakerRef = useRef<'agent' | 'prospect'>('agent');
  const finalConfidenceRef = useRef(80);

  useEffect(() => { micRef.current = mic; }, [mic]);

  const addLine = useCallback((text: string, speaker: 'agent' | 'prospect', confidence: number) => {
    if (!text.trim()) return;
    setPartial(null);
    setTranscript((prev) => [
      ...prev,
      { id: nextId(), speaker, text: text.trim(), timestamp: new Date(), speakerConfidence: confidence },
    ]);
  }, []);

  const teardownAudio = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
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

  // ── Deepgram connection ─────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    const currentMic = micRef.current;
    if (!currentMic.stream || !currentMic.audioContext) {
      setError('Microphone is not active — cannot start transcription.');
      setConnectionState('failed');
      return;
    }

    setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
    setError(null);
    finalBufferRef.current = '';

    try {
      // Exchange server-side secret for a short-lived Deepgram key
      const tokenRes = await fetch('/api/deepgram-token', { method: 'POST' });
      const tokenData = await tokenRes.json() as { key?: string; error?: string };

      if (!tokenRes.ok || !tokenData.key) {
        // Deepgram not configured — fall back to Web Speech API
        console.warn('Deepgram unavailable, falling back to Web Speech API:', tokenData.error);
        startWebSpeech();
        return;
      }

      const sampleRate = Math.round(currentMic.audioContext.sampleRate);

      const params = new URLSearchParams({
        model: 'nova-3',
        language: 'en-US',
        encoding: 'linear16',
        sample_rate: String(sampleRate),
        channels: '1',
        interim_results: 'true',
        smart_format: 'true',
        punctuate: 'true',
        diarize: 'true',
        endpointing: '300',
        utterance_end_ms: '1000',
      });

      // Browser WebSocket auth: Deepgram accepts the API key as a subprotocol
      // (this is exactly how the official @deepgram/sdk handles browser auth)
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${params.toString()}`,
        ['token', tokenData.key]
      );
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
        setTranscriptionMode('deepgram');

        // Audio pipeline: MediaStream → ScriptProcessor → PCM16 → Deepgram binary WS messages
        const ctx = currentMic.audioContext!;
        const source = ctx.createMediaStreamSource(currentMic.stream!);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        sourceRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
          }
          ws.send(pcm16.buffer);
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const msg = JSON.parse(event.data) as DeepgramResultsEvent & { type: string; message?: string };

          if (msg.type === 'Results') {
            const alt = msg.channel?.alternatives?.[0];
            if (!alt) return;
            const text = alt.transcript ?? '';
            const words = alt.words ?? [];
            const speaker = dominantSpeaker(words);
            const confidence = Math.round((alt.confidence ?? 0.8) * 100);

            if (!msg.is_final) {
              // Interim result — live preview while the speaker is talking
              if (text.trim()) setPartial({ speaker, text: text.trim() });
            } else {
              // Finalized chunk — accumulate until speech_final flushes as one line
              if (text.trim()) {
                finalBufferRef.current = finalBufferRef.current
                  ? `${finalBufferRef.current} ${text.trim()}`
                  : text.trim();
                finalSpeakerRef.current = speaker;
                finalConfidenceRef.current = confidence;
              }
              if (msg.speech_final) {
                const full = finalBufferRef.current.trim();
                finalBufferRef.current = '';
                if (full) addLine(full, finalSpeakerRef.current, finalConfidenceRef.current);
              }
            }
          } else if (msg.type === 'UtteranceEnd') {
            // Flush any accumulated final text when Deepgram detects end-of-utterance
            const full = finalBufferRef.current.trim();
            finalBufferRef.current = '';
            if (full) addLine(full, finalSpeakerRef.current, finalConfidenceRef.current);
            setPartial(null);
          } else if (msg.type === 'Error') {
            setError(`Deepgram error: ${msg.message ?? 'Unknown error'}`);
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onerror = () => {
        setError('Deepgram WebSocket error — check network and API key.');
      };

      ws.onclose = () => {
        teardownAudio();
        // Flush any buffered text before reconnect so nothing is lost
        const buffered = finalBufferRef.current.trim();
        if (buffered) {
          addLine(buffered, finalSpeakerRef.current, finalConfidenceRef.current);
          finalBufferRef.current = '';
        }
        setPartial(null);

        if (shouldReconnectRef.current && reconnectAttemptRef.current < MAX_RECONNECT) {
          reconnectAttemptRef.current++;
          setConnectionState('reconnecting');
          const delay = RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptRef.current - 1);
          reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
        } else if (shouldReconnectRef.current) {
          setConnectionState('failed');
          setError('Lost connection to Deepgram after multiple attempts. Check your API key and network.');
          shouldReconnectRef.current = false;
        } else {
          setConnectionState('idle');
        }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error starting transcription';
      setError(msg);
      setConnectionState('failed');
    }
  }, [addLine, teardownAudio, startWebSpeech]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  const startListening = useCallback(async () => {
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    finalBufferRef.current = '';
    await connect();
  }, [connect]);

  const stopListening = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    teardownAudio();
    if (wsRef.current) {
      // Tell Deepgram we're done so it can flush any remaining audio
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    if (speechRef.current) {
      speechRef.current.onend = null;
      speechRef.current.abort();
      speechRef.current = null;
    }
    setConnectionState('idle');
    setPartial(null);
    finalBufferRef.current = '';
  }, [teardownAudio]);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setPartial(null);
    lineSeq = 0;
    finalBufferRef.current = '';
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
