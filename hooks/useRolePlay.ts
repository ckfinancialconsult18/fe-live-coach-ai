'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TranscriptLine } from '@/lib/types';
import { getPersona, type RolePlayPersona } from '@/lib/roleplay-personas';

export type RolePlayPhase = 'idle' | 'active' | 'ending' | 'ended';

export interface RolePlayMessage {
  id: string;
  role: 'agent' | 'prospect';
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface RolePlaySession {
  personaId: string;
  persona: RolePlayPersona;
  startedAt: Date;
  messages: RolePlayMessage[];
  phase: RolePlayPhase;
  turnCount: number;
}

interface UseRolePlayReturn {
  session: RolePlaySession | null;
  phase: RolePlayPhase;
  isProspectTyping: boolean;
  transcript: TranscriptLine[];
  rapportTrend: 'improving' | 'declining' | 'neutral';
  startSession: (personaId: string) => void;
  sendAgentMessage: (text: string) => Promise<void>;
  endSession: () => void;
  resetSession: () => void;
  durationSeconds: number;
}

let msgId = 0;
function nextId() { return `rp-${++msgId}`; }

function toTranscriptLines(messages: RolePlayMessage[]): TranscriptLine[] {
  return messages
    .filter(m => !m.isStreaming)
    .map((m): TranscriptLine => ({
      id: m.id,
      speaker: m.role === 'agent' ? 'agent' : 'prospect',
      text: m.text,
      timestamp: m.timestamp,
    }));
}

// Estimate rapport trend from the last few coaching results (passed in from useAICoach)
function estimateRapportTrend(transcript: TranscriptLine[]): 'improving' | 'declining' | 'neutral' {
  // Heuristic: count rapport keywords in recent prospect messages
  const recentProspect = transcript
    .filter(l => l.speaker === 'prospect')
    .slice(-3)
    .map(l => l.text.toLowerCase())
    .join(' ');
  const positive = ['tell me more', 'that makes sense', 'i understand', 'good point', 'thank you', 'that\'s helpful', 'i see', 'okay', 'interested', 'sounds good'];
  const negative = ['not interested', 'don\'t have time', 'stop calling', 'i said no', 'goodbye', 'hung up', 'waste of time', 'scam', 'rude'];
  const pos = positive.filter(w => recentProspect.includes(w)).length;
  const neg = negative.filter(w => recentProspect.includes(w)).length;
  if (pos > neg) return 'improving';
  if (neg > pos) return 'declining';
  return 'neutral';
}

export function useRolePlay(): UseRolePlayReturn {
  const [session, setSession] = useState<RolePlaySession | null>(null);
  const [phase, setPhase] = useState<RolePlayPhase>('idle');
  const [isProspectTyping, setIsProspectTyping] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<RolePlaySession | null>(null);

  // Keep ref in sync so callbacks always see latest session
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Duration timer
  useEffect(() => {
    if (phase === 'active') {
      timerRef.current = setInterval(() => setDurationSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const startSession = useCallback((personaId: string) => {
    const persona = getPersona(personaId);
    if (!persona) return;

    const openingMsg: RolePlayMessage = {
      id: nextId(),
      role: 'prospect',
      text: persona.openingLine,
      timestamp: new Date(),
    };

    const newSession: RolePlaySession = {
      personaId,
      persona,
      startedAt: new Date(),
      messages: [openingMsg],
      phase: 'active',
      turnCount: 0,
    };

    setSession(newSession);
    setPhase('active');
    setDurationSeconds(0);
    setTranscript(toTranscriptLines([openingMsg]));
  }, []);

  const sendAgentMessage = useCallback(async (text: string) => {
    const current = sessionRef.current;
    if (!current || phase !== 'active') return;

    const agentMsg: RolePlayMessage = {
      id: nextId(),
      role: 'agent',
      text,
      timestamp: new Date(),
    };

    // Add agent message immediately
    const updatedMessages = [...current.messages, agentMsg];
    const updatedSession = { ...current, messages: updatedMessages, turnCount: current.turnCount + 1 };
    setSession(updatedSession);
    sessionRef.current = updatedSession;
    setTranscript(toTranscriptLines(updatedMessages));

    // Stream prospect response
    setIsProspectTyping(true);
    const streamingId = nextId();
    const streamingMsg: RolePlayMessage = {
      id: streamingId,
      role: 'prospect',
      text: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setSession(prev => prev ? { ...prev, messages: [...prev.messages, streamingMsg] } : prev);

    try {
      const rapportTrend = estimateRapportTrend(toTranscriptLines(updatedMessages));

      const res = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: current.personaId,
          messages: updatedMessages.map(m => ({ role: m.role, text: m.text })),
          turnCount: updatedSession.turnCount,
          rapportTrend,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Prospect response failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: !done });
        setSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map(m =>
              m.id === streamingId ? { ...m, text: fullText } : m
            ),
          };
        });
      }

      // Finalize the streaming message
      const finalMsg: RolePlayMessage = {
        id: streamingId,
        role: 'prospect',
        text: fullText.trim(),
        timestamp: new Date(),
        isStreaming: false,
      };
      setSession(prev => {
        if (!prev) return prev;
        const finalMessages = prev.messages.map(m => m.id === streamingId ? finalMsg : m);
        sessionRef.current = { ...prev, messages: finalMessages };
        return { ...prev, messages: finalMessages };
      });
      setTranscript(prev => {
        const cur = sessionRef.current;
        return cur ? toTranscriptLines(cur.messages) : prev;
      });
    } catch {
      // Fallback — remove streaming placeholder
      setSession(prev => {
        if (!prev) return prev;
        return { ...prev, messages: prev.messages.filter(m => m.id !== streamingId) };
      });
    } finally {
      setIsProspectTyping(false);
    }
  }, [phase]);

  const endSession = useCallback(() => {
    setPhase('ended');
    setSession(prev => prev ? { ...prev, phase: 'ended' } : prev);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const resetSession = useCallback(() => {
    setSession(null);
    setPhase('idle');
    setTranscript([]);
    setDurationSeconds(0);
  }, []);

  const rapportTrend = estimateRapportTrend(transcript);

  return {
    session,
    phase,
    isProspectTyping,
    transcript,
    rapportTrend,
    startSession,
    sendAgentMessage,
    endSession,
    resetSession,
    durationSeconds,
  };
}
