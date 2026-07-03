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

// ── Diagnostics ───────────────────────────────────────────────────────────────
// Muted tracks are the primary cause of silent chunks: the OS has handed the
// audio device to another app (phone call, FaceTime, Bluetooth call mode).
// The MediaRecorder keeps producing chunks but they contain silence.

const diagnosedTracks = new WeakSet<MediaStreamTrack>();

function trackInfo(t: MediaStreamTrack): string {
  return `label="${t.label}" readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`;
}

function attachTrackDiagnostics(track: MediaStreamTrack, label: string) {
  if (diagnosedTracks.has(track)) return;
  diagnosedTracks.add(track);
  track.addEventListener('mute', () => {
    console.warn(`[AudioInputManager] TRACK MUTED (${label}) — OS stopped delivering audio. ` +
      `Typical cause: another app (phone/FaceTime/VoIP) took the input device or a Bluetooth ` +
      `headset switched to call mode. MediaRecorder will produce SILENT chunks. ${trackInfo(track)}`);
  });
  track.addEventListener('unmute', () => {
    console.log(`[AudioInputManager] track unmuted (${label}) — audio delivery resumed. ${trackInfo(track)}`);
  });
  track.addEventListener('ended', () => {
    console.error(`[AudioInputManager] TRACK ENDED (${label}) — device disconnected or capture revoked. ${trackInfo(track)}`);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAudioInputManager(mic: UseMicrophoneReturn): AudioInputManagerState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [activeModes, setActiveModes] = useState<AudioInputMode[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const micRef = useRef(mic);
  const speakerStreamRef = useRef<MediaStream | null>(null);
  const mergeCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => { micRef.current = mic; }, [mic]);

  // ── Merge available sources into a single stream ────────────────────────────

  const rebuild = useCallback(() => {
    const micStream = micRef.current.stream;
    if (!micStream) {
      setStream(null);
      setActiveModes([]);
      return;
    }

    // Attach diagnostics to any new mic tracks
    micStream.getAudioTracks().forEach((t, i) => attachTrackDiagnostics(t, `mic[${i}]`));

    const speakerStream = speakerStreamRef.current;
    const speakerLive = speakerStream?.getAudioTracks().some((t) => t.readyState === 'live') ?? false;

    if (!speakerLive) {
      // Mic-only — no Web Audio overhead needed
      if (mergeCtxRef.current && mergeCtxRef.current.state !== 'closed') {
        mergeCtxRef.current.close().catch(() => {});
      }
      mergeCtxRef.current = null;
      setStream(micStream);
      setActiveModes(['microphone']);
      console.log('[AudioInputManager] stream: mic-only');
      return;
    }

    // Mic + system audio — merge via Web Audio API
    // Always create a fresh context to avoid the suspended-context silent-output bug.
    if (mergeCtxRef.current && mergeCtxRef.current.state !== 'closed') {
      mergeCtxRef.current.close().catch(() => {});
    }
    const ctx = new AudioContext();
    mergeCtxRef.current = ctx;

    ctx.onstatechange = () => {
      console.warn(`[AudioInputManager] merge AudioContext state → ${ctx.state}` +
        (ctx.state !== 'running' ? ' — merged stream is SILENT until running again' : ''));
    };

    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(micStream).connect(dest);
    ctx.createMediaStreamSource(speakerStream!).connect(dest);

    // Resume before callers start recording — a suspended context outputs silence.
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('[AudioInputManager] merge AudioContext resumed — state:', ctx.state);
      }).catch((err) => {
        console.error('[AudioInputManager] merge AudioContext resume() failed:', err);
      });
    }

    speakerStream!.getAudioTracks().forEach((t, i) => attachTrackDiagnostics(t, `speaker[${i}]`));

    setStream(dest.stream);
    setActiveModes(['microphone', 'speaker-mode']);
    console.log('[AudioInputManager] stream: mic + speaker-mode merged | AudioContext state:', ctx.state);
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
    if (mergeCtxRef.current && mergeCtxRef.current.state !== 'closed') {
      mergeCtxRef.current.onstatechange = null;
      mergeCtxRef.current.close().catch(() => {});
    }
    mergeCtxRef.current = null;
    setStream(null);
    setActiveModes([]);
    setWarning(null);
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);

  return { stream, activeModes, warning, acquireSpeakerMode, releaseSpeakerMode, releaseAll, rebuild };
}
