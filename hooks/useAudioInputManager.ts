'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Each value represents one audio source the manager knows how to acquire.
 * Add new modes here as telephony integrations expand — the manager API stays
 * the same so callers need no changes.
 *
 *   microphone   — getUserMedia, always the base source
 *   speaker-mode — getDisplayMedia with system audio; captures the remote party's
 *                  voice when iPhone audio plays through the computer's speakers
 */
export type AudioInputMode = 'microphone' | 'speaker-mode';

export interface AudioInputManagerState {
  /** Merged stream ready for recording. Null until at least microphone is active. */
  stream: MediaStream | null;
  /** Which sources are currently contributing to the stream. */
  activeModes: AudioInputMode[];
  /** Non-fatal warning shown to the caller (e.g. system audio declined). */
  warning: string | null;
  /** Acquire the speaker-mode source (calls getDisplayMedia). */
  acquireSpeakerMode: () => Promise<void>;
  /** Release the speaker-mode source, rebuilding a mic-only stream. */
  releaseSpeakerMode: () => void;
  /** Tear down everything. Called when the call ends. */
  releaseAll: () => void;
  /** Rebuild the merged stream from currently-active sources. */
  rebuild: () => void;
}

// ── AudioContext singleton ────────────────────────────────────────────────────
// Reuse a single context across rebuilds to avoid hitting browser limits.

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAudioInputManager(mic: UseMicrophoneReturn): AudioInputManagerState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [activeModes, setActiveModes] = useState<AudioInputMode[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const micRef = useRef(mic);
  const speakerStreamRef = useRef<MediaStream | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  useEffect(() => { micRef.current = mic; }, [mic]);

  // ── Merge available sources into a single stream ────────────────────────────

  const rebuild = useCallback(() => {
    const micStream = micRef.current.stream;
    if (!micStream) {
      setStream(null);
      setActiveModes([]);
      return;
    }

    const speakerStream = speakerStreamRef.current;

    if (!speakerStream || speakerStream.getAudioTracks().every((t) => t.readyState !== 'live')) {
      // Mic-only — no Web Audio overhead needed
      setStream(micStream);
      setActiveModes(['microphone']);
      console.log('[AudioInputManager] stream: mic-only');
      return;
    }

    // Mic + system audio — merge via Web Audio API
    const ctx = getAudioContext();
    const dest = ctx.createMediaStreamDestination();
    destRef.current = dest;

    const micSource = ctx.createMediaStreamSource(micStream);
    const sysSource = ctx.createMediaStreamSource(speakerStream);
    micSource.connect(dest);
    sysSource.connect(dest);

    setStream(dest.stream);
    setActiveModes(['microphone', 'speaker-mode']);
    console.log('[AudioInputManager] stream: mic + speaker-mode merged');
  }, []);

  // Rebuild whenever the mic stream changes (e.g. device switch mid-call)
  useEffect(() => {
    if (mic.stream) rebuild();
  }, [mic.stream, rebuild]);

  // ── Acquire speaker-mode (getDisplayMedia) ──────────────────────────────────

  const acquireSpeakerMode = useCallback(async () => {
    if (typeof navigator?.mediaDevices?.getDisplayMedia !== 'function') {
      setWarning('System audio capture is not supported in this browser (try Chrome or Edge).');
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,  // required by most browsers to show the share picker
        audio: true,
      });

      // We only need the audio — stop video tracks immediately
      display.getVideoTracks().forEach((t) => t.stop());

      const audioTracks = display.getAudioTracks();
      console.log('[AudioInputManager] getDisplayMedia acquired —',
        audioTracks.length, 'audio track(s):',
        audioTracks.map((t) => `"${t.label}"`).join(', '));

      if (audioTracks.length === 0) {
        setWarning('Screen share started but no system audio was captured. Make sure "Share system audio" is checked in the share dialog.');
        return;
      }

      // Detect when the user stops sharing (browser stop button or tab close)
      audioTracks[0].onended = () => {
        console.warn('[AudioInputManager] system audio track ended — rebuilding mic-only stream');
        speakerStreamRef.current = null;
        rebuild();
      };

      speakerStreamRef.current = display;
      setWarning(null);
      rebuild();
    } catch (err) {
      // NotAllowedError = user cancelled the picker — not an error worth surfacing
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError') {
        setWarning('System audio not shared — only your microphone will be transcribed.');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setWarning(`Could not capture system audio: ${msg}`);
      }
      console.warn('[AudioInputManager] getDisplayMedia failed:', err);
    }
  }, [rebuild]);

  // ── Release speaker-mode ────────────────────────────────────────────────────

  const releaseSpeakerMode = useCallback(() => {
    if (speakerStreamRef.current) {
      speakerStreamRef.current.getTracks().forEach((t) => t.stop());
      speakerStreamRef.current = null;
    }
    rebuild();
  }, [rebuild]);

  // ── Release all ─────────────────────────────────────────────────────────────

  const releaseAll = useCallback(() => {
    if (speakerStreamRef.current) {
      speakerStreamRef.current.getTracks().forEach((t) => t.stop());
      speakerStreamRef.current = null;
    }
    destRef.current = null;
    setStream(null);
    setActiveModes([]);
    setWarning(null);
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);

  return { stream, activeModes, warning, acquireSpeakerMode, releaseSpeakerMode, releaseAll, rebuild };
}
