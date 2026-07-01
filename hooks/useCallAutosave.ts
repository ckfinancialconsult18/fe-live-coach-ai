'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const AUTOSAVE_INTERVAL_MS = 5000;

export interface AutosavePayload {
  transcript: unknown;
  underwriting: unknown;
  metrics: unknown;
  durationSeconds: number;
  liveState: unknown;
}

export interface UseCallAutosaveReturn {
  callId: string | null;
  lastSavedAt: Date | null;
  startCall: () => Promise<string | null>;
  stopCall: () => void;
}

/**
 * Phase 3 Part 8: autosave. Creates an in-progress `calls` row when the call
 * starts, then PATCHes it every 5 seconds with the current transcript,
 * underwriting capture, metrics, and a live-state snapshot (coaching
 * insight, mid-call memory, timeline so far) — so a browser crash mid-call
 * loses at most ~5 seconds of data, never the whole call.
 */
export function useCallAutosave(getPayload: () => AutosavePayload): UseCallAutosaveReturn {
  const [callId, setCallId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const getPayloadRef = useRef(getPayload);

  useEffect(() => {
    getPayloadRef.current = getPayload;
  }, [getPayload]);

  const save = useCallback(async () => {
    const id = callIdRef.current;
    if (!id) return;
    const payload = getPayloadRef.current();
    try {
      const res = await fetch(`/api/calls/${id}/autosave`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setLastSavedAt(new Date());
      } else {
        const body = await res.json().catch(() => ({}));
        console.error('[useCallAutosave] autosave failed:', res.status, body);
      }
    } catch (err) {
      console.error('[useCallAutosave] autosave network error:', err);
    }
  }, []);

  const startCall = useCallback(async () => {
    try {
      const res = await fetch('/api/calls/start', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('[useCallAutosave] /api/calls/start failed:', res.status, body);
        return null;
      }
      const { callId: newId } = await res.json();
      callIdRef.current = newId;
      setCallId(newId);

      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(save, AUTOSAVE_INTERVAL_MS);

      return newId as string;
    } catch {
      return null;
    }
  }, [save]);

  const stopCall = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    // Final save on stop so the last few seconds before "End Call" aren't lost.
    save();
    callIdRef.current = null;
    setCallId(null);
  }, [save]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  return { callId, lastSavedAt, startCall, stopCall };
}
