'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptLine } from '@/lib/types';
import { EnergyHeuristicClassifier } from '@/lib/audio/diarization';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
export type TranscriptionMode = 'realtime' | 'webspeech';

export interface PartialTranscript {
  speaker: 'agent' | 'prospect';
  text: string;
}

export interface UseRealtimeTranscriptionReturn {
  transcript: TranscriptLine[];
  partial: PartialTranscript | null;
  connectionState: ConnectionState;
  /** Which transcription backend is active: OpenAI Realtime or browser Web Speech API. */
  transcriptionMode: TranscriptionMode | null;
  isListening: boolean;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  clearTranscript: () => void;
  correctSpeaker: (lineId: string) => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

let lineId = 0;
function nextId() { return `line-${++lineId}`; }

// Minimal type shim for the Web Speech API (not in TypeScript's default lib).
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string; confidence: number }; isFinal: boolean; length: number } };
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}
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
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as SpeechRecognitionConstructor | null;
}

export function useRealtimeTranscription(mic: UseMicrophoneReturn): UseRealtimeTranscriptionReturn {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [partial, setPartial] = useState<PartialTranscript | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const classifierRef = useRef(new EnergyHeuristicClassifier());
  const utteranceEnergyRef = useRef<{ sum: number; peak: number; count: number }>({ sum: 0, peak: 0, count: 0 });
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const micRef = useRef(mic);
  const connectRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => { micRef.current = mic; }, [mic]);

  const addLine = useCallback((text: string, confidenceOverride?: number) => {
    const { sum, peak, count } = utteranceEnergyRef.current;
    const avgEnergy = count > 0 ? sum / count : 0;
    const classifier = classifierRef.current;
    const { speaker, confidence } = classifier.isCalibrated()
      ? classifier.classify(avgEnergy, peak)
      : { speaker: 'agent' as const, confidence: 30 };
    utteranceEnergyRef.current = { sum: 0, peak: 0, count: 0 };
    setPartial(null);
    setTranscript((prev) => [
      ...prev,
      {
        id: nextId(),
        speaker,
        text: text.trim(),
        timestamp: new Date(),
        speakerConfidence: confidenceOverride ?? confidence,
      },
    ]);
  }, []);

  const partialSpeaker = useCallback((): 'agent' | 'prospect' => {
    const { sum, peak, count } = utteranceEnergyRef.current;
    if (count === 0) return 'agent';
    return classifierRef.current.isCalibrated()
      ? classifierRef.current.classify(sum / count, peak).speaker
      : 'agent';
  }, []);

  const teardownAudioPipeline = useCallback(() => {
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
        'OpenAI Realtime API is unavailable on this account, and the Web Speech API is not ' +
        'supported by this browser (try Chrome or Edge). Live transcription cannot start.'
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
      let interimText = '';
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          if (text.trim()) addLine(text, Math.round((result[0]?.confidence ?? 0.5) * 100));
        } else {
          interimText += text;
        }
      }
      if (interimText.trim()) {
        setPartial({ speaker: partialSpeaker(), text: interimText.trim() });
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      setError(`Web Speech API error: ${e.error}${e.message ? ` — ${e.message}` : ''}`);
    };

    recognition.onend = () => {
      setPartial(null);
      if (shouldReconnectRef.current) {
        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptRef.current += 1;
          setConnectionState('reconnecting');
          reconnectTimeoutRef.current = setTimeout(() => {
            try { recognition.start(); } catch { /* already started */ }
          }, 300);
        } else {
          setConnectionState('failed');
          setError('Web Speech API stopped restarting after multiple attempts.');
          shouldReconnectRef.current = false;
        }
      } else {
        setConnectionState('idle');
      }
    };

    speechRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setError(`Could not start Web Speech API: ${err instanceof Error ? err.message : String(err)}`);
      setConnectionState('failed');
    }
  }, [addLine, partialSpeaker]);

  // ── OpenAI Realtime API path ────────────────────────────────────────────────

  const connect = useCallback(async () => {
    const currentMic = micRef.current;
    if (!currentMic.stream || !currentMic.audioContext) {
      setError('Microphone is not active');
      setConnectionState('failed');
      return;
    }

    setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
    setError(null);

    try {
      const res = await fetch('/api/session', { method: 'POST' });
      const sessionData = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        throw new Error((sessionData.error as string) ?? 'Failed to create transcription session');
      }

      // Server tried all Realtime models and none were available — fall back.
      if (sessionData.realtimeUnavailable) {
        setTranscriptionMode('webspeech');
        startWebSpeech();
        return;
      }

      const clientSecret = sessionData.client_secret as { value: string } | undefined;
      const modelUsed = (sessionData.modelUsed as string | undefined) ?? 'gpt-4o-realtime-preview';

      if (!clientSecret?.value) {
        throw new Error('Session response did not include a client_secret. Check /api/live-call-status for diagnostics.');
      }

      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(modelUsed)}`,
        ['realtime', `openai-insecure-api-key.${clientSecret.value}`, 'openai-beta.realtime-v1']
      );
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
        setTranscriptionMode('realtime');

        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'],
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600,
            },
          },
        }));

        const ctx = currentMic.audioContext!;
        const source = ctx.createMediaStreamSource(currentMic.stream!);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        sourceRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          let sumSquares = 0;
          let peak = 0;
          for (let i = 0; i < input.length; i++) {
            const v = input[i];
            sumSquares += v * v;
            const abs = Math.abs(v);
            if (abs > peak) peak = abs;
          }
          const rms = Math.sqrt(sumSquares / input.length);
          const energy = utteranceEnergyRef.current;
          energy.sum += rms;
          energy.peak = Math.max(energy.peak, peak);
          energy.count += 1;
          if (!classifierRef.current.isCalibrated()) classifierRef.current.calibrate(rms);

          if (ws.readyState !== WebSocket.OPEN) return;
          const pcm16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
          }
          let binary = '';
          const bytes = new Uint8Array(pcm16.buffer);
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: btoa(binary) }));
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'conversation.item.input_audio_transcription.delta' && typeof msg.delta === 'string') {
            setPartial((prev) => ({
              speaker: partialSpeaker(),
              text: ((prev?.text ?? '') + msg.delta).trim(),
            }));
          }
          if (msg.type === 'input_audio_buffer.speech_started') {
            setPartial({ speaker: partialSpeaker(), text: '' });
          }
          if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            const text = msg.transcript?.trim();
            if (text) addLine(text);
            else setPartial(null);
          }
          if (msg.type === 'error') {
            setError(msg.error?.message ?? 'Realtime API error');
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onerror = () => setError('WebSocket error — check network and microphone permissions.');

      ws.onclose = () => {
        teardownAudioPipeline();
        if (shouldReconnectRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptRef.current += 1;
          setConnectionState('reconnecting');
          reconnectTimeoutRef.current = setTimeout(
            () => connectRef.current(),
            RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptRef.current - 1)
          );
        } else if (shouldReconnectRef.current) {
          setConnectionState('failed');
          setError('Lost connection to the transcription service after multiple attempts.');
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
  }, [addLine, teardownAudioPipeline, partialSpeaker, startWebSpeech]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  const startListening = useCallback(async () => {
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    classifierRef.current = new EnergyHeuristicClassifier();
    await connect();
  }, [connect]);

  const stopListening = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
    teardownAudioPipeline();
    wsRef.current?.close();
    wsRef.current = null;
    if (speechRef.current) {
      speechRef.current.onend = null; // prevent auto-restart on manual stop
      speechRef.current.abort();
      speechRef.current = null;
    }
    setConnectionState('idle');
    setPartial(null);
  }, [teardownAudioPipeline]);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setPartial(null);
    lineId = 0;
  }, []);

  const correctSpeaker = useCallback((targetId: string) => {
    setTranscript((prev) => prev.map((line) =>
      line.id === targetId
        ? { ...line, speaker: line.speaker === 'agent' ? 'prospect' : 'agent', speakerEdited: true }
        : line
    ));
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
