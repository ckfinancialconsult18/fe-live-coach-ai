'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptLine } from '@/lib/types';
import { EnergyHeuristicClassifier } from '@/lib/audio/diarization';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface PartialTranscript {
  speaker: 'agent' | 'prospect';
  text: string;
}

export interface UseRealtimeTranscriptionReturn {
  transcript: TranscriptLine[];
  /**
   * The in-progress utterance, if the Realtime API is emitting incremental
   * transcription deltas for the current speech segment (real partial STT,
   * not simulated) — null once finalized into `transcript` or when no
   * partial event has arrived yet for the current utterance.
   */
  partial: PartialTranscript | null;
  connectionState: ConnectionState;
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

/**
 * Streams microphone audio to OpenAI's Realtime transcription API and
 * assigns each transcribed utterance to a speaker using the energy-based
 * diarization heuristic (lib/audio/diarization.ts) rather than a fixed
 * alternation. Requires a microphone stream from useMicrophone — this hook
 * does not call getUserMedia itself, so device selection / level metering /
 * health stay centralized in one place.
 */
export function useRealtimeTranscription(mic: UseMicrophoneReturn): UseRealtimeTranscriptionReturn {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [partial, setPartial] = useState<PartialTranscript | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const classifierRef = useRef(new EnergyHeuristicClassifier());
  const utteranceEnergyRef = useRef<{ sum: number; peak: number; count: number }>({ sum: 0, peak: 0, count: 0 });
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const micRef = useRef(mic);
  const connectRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    micRef.current = mic;
  }, [mic]);

  const addLine = useCallback((text: string) => {
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
      { id: nextId(), speaker, text: text.trim(), timestamp: new Date(), speakerConfidence: confidence },
    ]);
  }, []);

  // Best-effort speaker guess for the in-progress utterance, from energy
  // accumulated so far — refined/finalized once the utterance completes.
  const partialSpeaker = useCallback((): 'agent' | 'prospect' => {
    const { sum, peak, count } = utteranceEnergyRef.current;
    if (count === 0) return 'agent';
    const avgEnergy = sum / count;
    const classifier = classifierRef.current;
    return classifier.isCalibrated() ? classifier.classify(avgEnergy, peak).speaker : 'agent';
  }, []);

  const teardownAudioPipeline = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
  }, []);

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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create transcription session');
      }
      const { client_secret } = await res.json();

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        ['realtime', `openai-insecure-api-key.${client_secret.value}`, 'openai-beta.realtime-v1']
      );
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');

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

          // Accumulate energy for the in-flight utterance (diarization signal).
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

          // Real partial transcription — the Realtime API streams incremental
          // deltas for the in-progress utterance before it finalizes. We show
          // these as-is; we never synthesize a partial client-side.
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
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        setError('Connection error — check your network and microphone permissions.');
      };

      ws.onclose = () => {
        teardownAudioPipeline();
        if (shouldReconnectRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptRef.current += 1;
          setConnectionState('reconnecting');
          const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptRef.current - 1);
          reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), delay);
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
  }, [addLine, teardownAudioPipeline, partialSpeaker]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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
    isListening: connectionState === 'connected' || connectionState === 'reconnecting',
    error,
    startListening,
    stopListening,
    clearTranscript,
    correctSpeaker,
  };
}
