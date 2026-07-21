'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  listAudioInputDevices,
  getMicPermissionState,
  requestMicrophoneStream,
  isExternalMic,
  type AudioInputDevice,
  type MicPermissionState,
} from '@/lib/audio/devices';
import { createLevelMeter, type LevelMeter } from '@/lib/audio/level-meter';

/**
 * idle        — mic not started
 * healthy     — audio is flowing
 * silent      — no audio detected for SILENCE_TIMEOUT_MS (may indicate device issue)
 * muted       — OS muted the track (another app took the input device; common during phone calls)
 * disconnected — track.readyState === 'ended' (device unplugged / permission revoked)
 * error       — getUserMedia threw
 */
export type MicHealth = 'idle' | 'healthy' | 'silent' | 'muted' | 'disconnected' | 'error';

export interface UseMicrophoneReturn {
  devices: AudioInputDevice[];
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string) => Promise<void>;
  permissionState: MicPermissionState;
  health: MicHealth;
  level: number; // 0-1, polled
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  start: () => Promise<MediaStream | null>;
  stop: () => void;
  error: string | null;
  /** Set when a better mic is auto-connected mid-call. Cleared after display. */
  hotPlugNotification: string | null;
  clearHotPlugNotification: () => void;
  /** Returns raw waveform data for canvas drawing (null if mic not active). */
  getWaveform: () => Float32Array | null;
}

const SILENCE_TIMEOUT_MS = 8000;

export function useMicrophone(): UseMicrophoneReturn {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<MicPermissionState>('unknown');
  const [health, setHealth] = useState<MicHealth>('idle');
  const [level, setLevel] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hotPlugNotification, setHotPlugNotification] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const devicesRef = useRef<AudioInputDevice[]>([]);
  const acquireRef = useRef<(deviceId?: string) => Promise<MediaStream | null>>(async () => null);
  const contextRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSignalAtRef = useRef<number>(0);

  const refreshDevices = useCallback(async () => {
    const list = await listAudioInputDevices();
    setDevices(list);
    devicesRef.current = list;
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [permission, list] = await Promise.all([getMicPermissionState(), listAudioInputDevices()]);
      if (cancelled) return;
      setPermissionState(permission);
      setDevices(list);
    })();

    const onDeviceChange = async () => {
      const prevIds = new Set(devicesRef.current.map((d) => d.deviceId));
      const newList = await refreshDevices();
      // Auto-switch to a newly-connected external mic if a call is active
      if (streamRef.current) {
        const newExternal = newList.find((d) => !prevIds.has(d.deviceId) && isExternalMic(d));
        if (newExternal) {
          console.log('[microphone] hot-plug detected — switching to', newExternal.label);
          await acquireRef.current(newExternal.deviceId);
          setHotPlugNotification(`Switched to "${newExternal.label}"`);
        }
      }
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, [refreshDevices]);

  const teardown = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    meterRef.current?.destroy();
    meterRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (contextRef.current && contextRef.current.state !== 'closed') {
      contextRef.current.close().catch(() => {});
    }
    contextRef.current = null;
    setStream(null);
    setAudioContext(null);
    setLevel(0);
  }, []);

  const acquire = useCallback(async (deviceId?: string): Promise<MediaStream | null> => {
    setError(null);
    try {
      const device = deviceId ? devicesRef.current.find((d) => d.deviceId === deviceId) : undefined;
      const newStream = await requestMicrophoneStream(deviceId, device);
      setPermissionState('granted');

      // Stop the previous stream only after the new one succeeds, so a
      // mid-call device switch doesn't leave the user with no audio if the
      // new device fails to acquire.
      const previousStream = streamRef.current;
      const previousContext = contextRef.current;
      const previousMeter = meterRef.current;

      streamRef.current = newStream;
      const ctx = new AudioContext();
      contextRef.current = ctx;
      const meter = createLevelMeter(newStream, ctx);
      meterRef.current = meter;

      previousMeter?.destroy();
      previousStream?.getTracks().forEach((t) => t.stop());
      if (previousContext && previousContext.state !== 'closed') previousContext.close().catch(() => {});

      // Health monitoring: device unplugged / track ends / OS mutes the track.
      // MUTED means the OS stopped delivering audio samples to this track — the
      // classic signature of a phone call, FaceTime, or Bluetooth headset taking
      // the input device. The track is still "live" but outputs silence.
      const track = newStream.getAudioTracks()[0];

      // Log the actual applied constraints so we can verify AEC/NS/AGC are off.
      const settings = track.getSettings();
      const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
      console.log('[microphone] track acquired —',
        `label="${track.label}"`,
        `deviceId=${settings.deviceId ?? 'unknown'}`,
        `sampleRate=${settings.sampleRate ?? 'unknown'}`,
        `channelCount=${settings.channelCount ?? 'unknown'}`,
        `echoCancellation=${settings.echoCancellation ?? 'unknown'}`,
        `noiseSuppression=${settings.noiseSuppression ?? 'unknown'}`,
        `autoGainControl=${settings.autoGainControl ?? 'unknown'}`,
      );
      if (Object.keys(caps).length) {
        console.log('[microphone] track capabilities:', JSON.stringify(caps));
      }
      track.onended = () => {
        console.error('[microphone] track ended — device disconnected or permission revoked');
        setHealth('disconnected');
      };
      track.onmute = () => {
        console.warn('[microphone] TRACK MUTED by OS — another app (phone call, FaceTime, ' +
          'Bluetooth) has taken the audio input device. Recording will produce SILENT chunks ' +
          `until the device is released. track: label="${track.label}" readyState=${track.readyState}`);
        setHealth('muted');
      };
      track.onunmute = () => {
        console.log('[microphone] track unmuted — audio delivery resumed');
        setHealth('healthy');
      };

      lastSignalAtRef.current = Date.now();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        const currentLevel = meter.getLevel();
        setLevel(currentLevel);
        if (meter.hasSignal()) lastSignalAtRef.current = Date.now();

        if (track.readyState === 'ended') {
          setHealth('disconnected');
        } else if (track.muted) {
          // onmute already set this, but keep it consistent in the poll too
          setHealth('muted');
        } else if (Date.now() - lastSignalAtRef.current > SILENCE_TIMEOUT_MS) {
          setHealth('silent');
        } else {
          setHealth('healthy');
        }
      }, 150);

      setStream(newStream);
      setAudioContext(ctx);
      const list = await refreshDevices();
      const actualDeviceId = track.getSettings().deviceId ?? deviceId ?? list[0]?.deviceId ?? null;
      setSelectedDeviceId(actualDeviceId);

      return newStream;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not access microphone';
      setError(msg);
      setHealth('error');
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPermissionState('denied');
      }
      return null;
    }
  }, [refreshDevices]);

  useEffect(() => { acquireRef.current = acquire; }, [acquire]);

  const start = useCallback(() => acquire(selectedDeviceId ?? undefined), [acquire, selectedDeviceId]);

  const selectDevice = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (streamRef.current) {
      await acquire(deviceId);
    }
  }, [acquire]);

  const stop = useCallback(() => {
    teardown();
    setHealth('idle');
  }, [teardown]);

  useEffect(() => () => teardown(), [teardown]);

  const getWaveform = useCallback((): Float32Array | null => {
    return meterRef.current?.getWaveform() ?? null;
  }, []);

  return {
    devices,
    selectedDeviceId,
    selectDevice,
    permissionState,
    health,
    level,
    stream,
    audioContext,
    start,
    stop,
    error,
    hotPlugNotification,
    clearHotPlugNotification: useCallback(() => setHotPlugNotification(null), []),
    getWaveform,
  };
}
