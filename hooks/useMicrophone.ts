'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  listAudioInputDevices,
  getMicPermissionState,
  requestMicrophoneStream,
  type AudioInputDevice,
  type MicPermissionState,
} from '@/lib/audio/devices';
import { createLevelMeter, type LevelMeter } from '@/lib/audio/level-meter';

export type MicHealth = 'idle' | 'healthy' | 'silent' | 'disconnected' | 'error';

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

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSignalAtRef = useRef<number>(0);

  const refreshDevices = useCallback(async () => {
    const list = await listAudioInputDevices();
    setDevices(list);
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

    const onDeviceChange = () => refreshDevices();
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
      const newStream = await requestMicrophoneStream(deviceId);
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

      // Health monitoring: device unplugged / track ends unexpectedly.
      const track = newStream.getAudioTracks()[0];
      track.onended = () => setHealth('disconnected');

      lastSignalAtRef.current = Date.now();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        const currentLevel = meter.getLevel();
        setLevel(currentLevel);
        if (meter.hasSignal()) lastSignalAtRef.current = Date.now();

        if (track.readyState === 'ended') {
          setHealth('disconnected');
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
  };
}
