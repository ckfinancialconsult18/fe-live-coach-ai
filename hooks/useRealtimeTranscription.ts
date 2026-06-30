'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptLine, Speaker } from '@/lib/types';

export interface UseRealtimeTranscriptionReturn {
  transcript: TranscriptLine[];
  isConnected: boolean;
  isListening: boolean;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  clearTranscript: () => void;
}

let lineId = 0;
function nextId() { return `line-${++lineId}`; }

export function useRealtimeTranscription(): UseRealtimeTranscriptionReturn {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const speakerToggleRef = useRef<Speaker>('agent');

  const addLine = useCallback((speaker: Speaker, text: string) => {
    setTranscript((prev) => [
      ...prev,
      { id: nextId(), speaker, text: text.trim(), timestamp: new Date() },
    ]);
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    try {
      // Get ephemeral session token from our server
      const res = await fetch('/api/session', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create session');
      const { client_secret } = await res.json();

      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Open WebSocket to OpenAI Realtime
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        ['realtime', `openai-insecure-api-key.${client_secret.value}`, 'openai-beta.realtime-v1']
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsListening(true);

        // Configure session for transcription only
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

        // Stream mic audio
        const ctx = new AudioContext({ sampleRate: 24000 });
        contextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
          }
          const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
          ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            const text = msg.transcript?.trim();
            if (text) {
              // Alternate speakers: first line is agent, then prospect, etc.
              // In practice the agent can manually tag, but we auto-alternate for demo
              const speaker = speakerToggleRef.current;
              speakerToggleRef.current = speaker === 'agent' ? 'prospect' : 'agent';
              addLine(speaker, text);
            }
          }

          if (msg.type === 'error') {
            setError(msg.error?.message ?? 'WebSocket error');
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => setError('Connection error. Check microphone permissions.');
      ws.onclose = () => {
        setIsConnected(false);
        setIsListening(false);
      };

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      // Fallback to demo mode if no API key configured
      startDemoMode(addLine);
      setIsListening(true);
      setIsConnected(true);
    }
  }, [addLine]);

  const stopListening = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    contextRef.current?.close();
    contextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setIsListening(false);
    setIsConnected(false);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    lineId = 0;
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  return { transcript, isConnected, isListening, error, startListening, stopListening, clearTranscript };
}

// ── Demo mode — simulates a real call for development / when no API key ───────

function startDemoMode(addLine: (s: Speaker, t: string) => void) {
  const script: [Speaker, string, number][] = [
    ['agent',    'Hello, may I speak with Dorothy? This is Courtney calling from FE Financial.', 2000],
    ['prospect', 'Yes, this is Dorothy. Who did you say you were with?', 3000],
    ['agent',    'Hi Dorothy, I\'m Courtney with FE Financial. The reason I\'m calling is you recently filled out a card requesting information about final expense life insurance. Is that right?', 5000],
    ['prospect', 'Oh yes, I did fill something out. I\'ve been meaning to look into that.', 3000],
    ['agent',    'Perfect. Is now a good time to talk for just a few minutes?', 2500],
    ['prospect', 'Sure, I have a few minutes. I\'m 68 years old and I do have a little bit of coverage but I\'m not sure if it\'s enough.', 5000],
    ['agent',    'I understand. Can I ask what company your current coverage is with and how much you currently have?', 3500],
    ['prospect', 'It\'s through AARP, I think I have about five thousand dollars worth. I pay around thirty dollars a month for it.', 4500],
    ['agent',    'I see. And what made you feel that five thousand might not be quite enough?', 3000],
    ['prospect', 'Well, funerals are so expensive these days. My neighbor just passed and it cost over twelve thousand dollars. I don\'t want to leave that burden on my kids.', 6000],
    ['agent',    'That\'s such an important thing to think about, Dorothy. You mentioned you\'re 68 — are you in relatively good health? Do you have any major health conditions I should know about?', 4500],
    ['prospect', 'I have type 2 diabetes, been managing it for about ten years with Metformin. Other than that I\'m pretty healthy. No heart problems or anything like that.', 5500],
    ['agent',    'That\'s good to know. And are you a tobacco user at all?', 2000],
    ['prospect', 'No, I quit smoking about fifteen years ago.', 2000],
    ['agent',    'Wonderful. If I could show you a plan that would give you ten to fifteen thousand dollars in coverage for less than you\'re currently paying, would that be something worth taking a look at?', 4000],
    ['prospect', 'That sounds almost too good to be true. How much would something like that cost?', 3000],
    ['agent',    'For someone your age and health, you\'d be looking at right around twenty-five to thirty dollars a month for ten thousand dollars in coverage. That\'s actually less than what you\'re paying now for only five thousand.', 5000],
    ['prospect', 'Wow. I\'d like to think about that. Can I call you back?', 2500],
  ];

  let i = 0;
  function next() {
    if (i >= script.length) return;
    const [speaker, text, delay] = script[i++];
    setTimeout(() => {
      addLine(speaker, text);
      next();
    }, delay);
  }
  next();
}
