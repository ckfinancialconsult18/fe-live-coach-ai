'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';
import {
  AUDIO_MODES,
  DEFAULT_MODE_ID,
  startAudioSession,
  type AudioInputSession,
  type AudioInputWarning,
  type AudioInputDiagnostics,
  type AudioModeDefinition,
} from '@/lib/audio/input-manager';

export interface UseAudioInputReturn {
  /** All registered capture modes, for the selector UI. */
  modes: AudioModeDefinition[];
  modeId: string;
  setModeId: (id: string) => void;
  /** True while a session is live (mode switching should be disabled). */
  isActive: boolean;
  /** Latest warning from the active session (quiet customer, fallback, lost source). */
  warning: AudioInputWarning | null;
  dismissWarning: () => void;
  /** Live per-source diagnostics, polled once per second while active. */
  diagnostics: AudioInputDiagnostics | null;
  /**
   * Acquires the mic (with the mode's processing constraints) plus any other
   * sources the mode wants, and returns the single mixed stream to record.
   */
  start: () => Promise<MediaStream | null>;
  stop: () => void;
}

export function useAudioInput(mic: UseMicrophoneReturn): UseAudioInputReturn {
  const [modeId, setModeId] = useState<string>(DEFAULT_MODE_ID);
  const [isActive, setIsActive] = useState(false);
  const [warning, setWarning] = useState<AudioInputWarning | null>(null);
  const [diagnostics, setDiagnostics] = useState<AudioInputDiagnostics | null>(null);

  const sessionRef = useRef<AudioInputSession | null>(null);
  const diagTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micRef = useRef(mic);
  useEffect(() => { micRef.current = mic; }, [mic]);

  const stop = useCallback(() => {
    if (diagTimerRef.current) { clearInterval(diagTimerRef.current); diagTimerRef.current = null; }
    sessionRef.current?.stop();
    sessionRef.current = null;
    setIsActive(false);
    setDiagnostics(null);
    setWarning(null);
  }, []);

  const start = useCallback(async (): Promise<MediaStream | null> => {
    const mode = AUDIO_MODES[modeId] ?? AUDIO_MODES[DEFAULT_MODE_ID];
    setWarning(null);

    const micStream = await micRef.current.start({ processing: mode.micProcessing });
    if (!micStream) return null; // mic.error carries the real failure to the UI

    const session = await startAudioSession(mode, micStream, setWarning);
    sessionRef.current = session;
    setIsActive(true);
    setDiagnostics(session.getDiagnostics());
    diagTimerRef.current = setInterval(() => {
      const s = sessionRef.current;
      if (s) setDiagnostics(s.getDiagnostics());
    }, 1000);

    return session.stream;
  }, [modeId]);

  useEffect(() => () => stop(), [stop]);

  return {
    modes: Object.values(AUDIO_MODES),
    modeId,
    setModeId,
    isActive,
    warning,
    dismissWarning: () => setWarning(null),
    diagnostics,
    start,
    stop,
  };
}
