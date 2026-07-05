'use client';

import { useEffect, useRef, useState } from 'react';
import { onPerfEvent, getPerfHistory, type PerfEventType } from '@/lib/perf-bus';

const SERIES_SIZE = 30; // rolling window for sparklines
const PACKET_WINDOW_MS = 10_000; // window for packets/sec calculation

export interface MetricSeries {
  values: number[];
  current: number;
  avg: number;
  max: number;
}

export interface PerformanceSnapshot {
  micLatency: MetricSeries;
  chunkUpload: MetricSeries;      // legacy REST path
  deepgramLatency: MetricSeries;  // server→browser network leg (ms)
  wsRtt: MetricSeries;            // last chunk sent → first result (ms)
  recorderInterval: MetricSeries; // actual ondataavailable gap (ms)
  aiCoaching: MetricSeries;
  transcriptRender: MetricSeries;
  coachRender: MetricSeries;
  chunkSizeKb: MetricSeries;
  packetsPerSec: number;
  avgOverallMs: number;
  maxOverallMs: number;
}

function emptySeries(): MetricSeries {
  return { values: [], current: 0, avg: 0, max: 0 };
}

function DEFAULT(): PerformanceSnapshot {
  return {
    micLatency: emptySeries(),
    chunkUpload: emptySeries(),
    deepgramLatency: emptySeries(),
    wsRtt: emptySeries(),
    recorderInterval: emptySeries(),
    aiCoaching: emptySeries(),
    transcriptRender: emptySeries(),
    coachRender: emptySeries(),
    chunkSizeKb: emptySeries(),
    packetsPerSec: 0,
    avgOverallMs: 0,
    maxOverallMs: 0,
  };
}

function pushValue(series: MetricSeries, value: number): MetricSeries {
  const values = [...series.values, value].slice(-SERIES_SIZE);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const max = Math.max(...values);
  return { values, current: value, avg, max };
}

function seriesKey(type: PerfEventType): keyof PerformanceSnapshot | null {
  switch (type) {
    case 'mic-latency':        return 'micLatency';
    case 'chunk-upload':       return 'chunkUpload';
    case 'deepgram-latency':   return 'deepgramLatency';
    case 'ws-rtt':             return 'wsRtt';
    case 'recorder-interval':  return 'recorderInterval';
    case 'ai-coaching':        return 'aiCoaching';
    case 'transcript-render':  return 'transcriptRender';
    case 'coach-render':       return 'coachRender';
    case 'chunk-size':         return 'chunkSizeKb'; // converted to KB on push
    default:                   return null;
  }
}

function computeOverall(snap: PerformanceSnapshot): Pick<PerformanceSnapshot, 'avgOverallMs' | 'maxOverallMs'> {
  // Prefer wsRtt (streaming pipeline) over chunkUpload (legacy REST).
  const pipelineLatency = snap.wsRtt.current > 0 ? snap.wsRtt : snap.chunkUpload;
  const latencies = [pipelineLatency, snap.deepgramLatency, snap.aiCoaching].filter(s => s.current > 0);
  if (!latencies.length) return { avgOverallMs: 0, maxOverallMs: 0 };
  const avgOverallMs = Math.round(latencies.reduce((s, l) => s + l.avg, 0) / latencies.length);
  const maxOverallMs = Math.max(...latencies.map(l => l.max));
  return { avgOverallMs, maxOverallMs };
}

function computePacketsPerSec(): number {
  const history = getPerfHistory();
  const cutoff = Date.now() - PACKET_WINDOW_MS;
  const recent = history.filter(e => e.type === 'chunk-size' && e.timestamp >= cutoff).length;
  return Math.round((recent / (PACKET_WINDOW_MS / 1000)) * 10) / 10;
}

/**
 * Subscribes to the perf bus and maintains rolling stats for the debug panel.
 * Safe to mount anywhere; does nothing when the bus has no events.
 */
type S = Record<string, MetricSeries | number>;

function buildSnapshotFromHistory(): PerformanceSnapshot {
  const history = getPerfHistory();
  if (history.length === 0) return DEFAULT();
  const next = { ...DEFAULT() } as S;
  for (const e of history) {
    const key = seriesKey(e.type);
    if (!key) continue;
    const value = e.type === 'chunk-size'
      ? Math.round(e.value / 1024 * 10) / 10
      : Math.round(e.value);
    next[key] = pushValue(next[key] as MetricSeries, value);
  }
  const snap = next as unknown as PerformanceSnapshot;
  return { ...snap, ...computeOverall(snap), packetsPerSec: computePacketsPerSec() };
}

export function usePerformanceMetrics(): PerformanceSnapshot {
  // Lazy initializer: replay existing history so the panel is immediately
  // populated when it is opened mid-call (no effect-based setState needed).
  const [state, setState] = useState<PerformanceSnapshot>(buildSnapshotFromHistory);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = onPerfEvent((event) => {
      const key = seriesKey(event.type);
      if (!key) return;
      const value = event.type === 'chunk-size'
        ? Math.round(event.value / 1024 * 10) / 10
        : Math.round(event.value);
      setState(prev => {
        const next: S = {
          ...(prev as unknown as S),
          [key]: pushValue((prev as unknown as S)[key] as MetricSeries, value),
        };
        const snap = next as unknown as PerformanceSnapshot;
        return { ...snap, ...computeOverall(snap) };
      });
    });

    // Recompute packets/sec every second (derived from history timestamps)
    tickRef.current = setInterval(() => {
      setState(prev => ({ ...prev, packetsPerSec: computePacketsPerSec() }));
    }, 1000);

    return () => {
      unsub();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  return state;
}
