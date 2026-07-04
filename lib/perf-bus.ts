/**
 * Singleton performance event bus.
 * Any part of the app can call emitPerf(); the debug panel subscribes.
 * Zero dependencies — no React, no state.
 */

export type PerfEventType =
  | 'mic-latency'       // AudioContext.baseLatency * 1000 (ms)
  | 'chunk-upload'      // full round-trip to /api/transcribe (ms)
  | 'deepgram-latency'  // server-reported Deepgram processing (ms) via X-Transcribe-Duration-Ms
  | 'ai-coaching'       // full round-trip to /api/coach (ms)
  | 'transcript-render' // setTranscript() → next animation frame (ms)
  | 'coach-render'      // setInsight() → next animation frame (ms)
  | 'chunk-size';       // blob.size in bytes

export interface PerfEvent {
  type: PerfEventType;
  value: number;
  timestamp: number; // Date.now()
}

type PerfListener = (event: PerfEvent) => void;

const MAX_HISTORY = 2000;
const _history: PerfEvent[] = [];
const _listeners = new Set<PerfListener>();

export function emitPerf(type: PerfEventType, value: number): void {
  const event: PerfEvent = { type, value, timestamp: Date.now() };
  _history.push(event);
  if (_history.length > MAX_HISTORY) _history.shift();
  for (const l of _listeners) l(event);
}

export function onPerfEvent(listener: PerfListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function getPerfHistory(): PerfEvent[] {
  return [..._history];
}

export function clearPerfHistory(): void {
  _history.length = 0;
}

export function exportPerfLogs(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      eventCount: _history.length,
      events: _history,
    },
    null,
    2
  );
}
