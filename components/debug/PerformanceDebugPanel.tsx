'use client';

import { useCallback, useState } from 'react';
import { usePerformanceMetrics, type MetricSeries } from '@/hooks/usePerformanceMetrics';
import { exportPerfLogs, clearPerfHistory } from '@/lib/perf-bus';
import type { ConnectionState, TranscriptionMode } from '@/hooks/useDeepgramTranscription';

interface Props {
  connectionState: ConnectionState;
  transcriptionMode: TranscriptionMode | null;
  recorderIntervalMs?: number;
  onClose: () => void;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <div className="w-full h-8 rounded bg-white/4 flex items-center justify-center">
      <span className="text-[9px] text-slate-600">no data</span>
    </div>;
  }
  const W = 120, H = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Latest value dot */}
      <circle cx={W} cy={H - ((values[values.length - 1] - min) / range) * (H - 2) - 1} r="2.5" fill={color} />
    </svg>
  );
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function msColor(ms: number): string {
  if (ms <= 0) return '#475569';    // slate — no data
  if (ms < 300) return '#22c55e';   // green — fast
  if (ms < 800) return '#eab308';   // yellow — acceptable
  return '#ef4444';                  // red — slow
}

function kbColor(kb: number): string {
  if (kb <= 0) return '#475569';
  if (kb < 100) return '#22c55e';
  if (kb < 500) return '#eab308';
  return '#ef4444';
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, series, unit = 'ms', colorFn = msColor, description,
}: {
  label: string;
  series: MetricSeries;
  unit?: string;
  colorFn?: (v: number) => string;
  description?: string;
}) {
  const current = series.current;
  const color = colorFn(current);
  const hasData = series.values.length > 0;

  return (
    <div className="bg-white/4 border border-white/8 rounded-lg p-2 flex flex-col gap-1" title={description}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider truncate">{label}</span>
        <span className="text-xs font-mono shrink-0" style={{ color: hasData ? color : '#475569' }}>
          {hasData ? `${current}${unit}` : '—'}
        </span>
      </div>
      <Sparkline values={series.values} color={color} />
      {hasData && (
        <div className="flex gap-2 text-[8.5px] font-mono text-slate-600">
          <span>avg <span className="text-slate-400">{series.avg}{unit}</span></span>
          <span>max <span className="text-slate-400">{series.max}{unit}</span></span>
        </div>
      )}
    </div>
  );
}

// ── Connection badge ──────────────────────────────────────────────────────────

function ConnectionBadge({ state, mode }: { state: ConnectionState; mode: TranscriptionMode | null }) {
  const dot = state === 'connected' ? '#22c55e'
    : state === 'connecting' || state === 'reconnecting' ? '#eab308'
    : state === 'failed' ? '#ef4444' : '#475569';
  const label = mode === 'webspeech' ? 'WebSpeech' : state === 'connected' ? 'Deepgram' : state;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
      <span className="text-[9px] font-mono text-slate-400">{label}</span>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const VALID_INTERVALS = [100, 150, 200, 250, 300] as const;
const LS_INTERVAL_KEY = 'fe_recorder_interval_ms';

function readStoredInterval(): number {
  if (typeof window === 'undefined') return 250;
  const v = parseInt(localStorage.getItem(LS_INTERVAL_KEY) ?? '', 10);
  return (VALID_INTERVALS as readonly number[]).includes(v) ? v : 250;
}

export function PerformanceDebugPanel({ connectionState, transcriptionMode, recorderIntervalMs, onClose }: Props) {
  const metrics = usePerformanceMetrics();
  const [expanded, setExpanded] = useState(true);
  const [storedInterval, setStoredInterval] = useState(readStoredInterval);

  const handleExport = useCallback(() => {
    const json = exportPerfLogs();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perf-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleClear = useCallback(() => {
    clearPerfHistory();
    window.location.reload();
  }, []);

  return (
    <div
      className="fixed bottom-14 right-3 z-[9999] w-[440px] rounded-xl border border-[#D4AF37]/20 shadow-2xl"
      style={{ background: 'rgba(8, 10, 14, 0.96)', backdropFilter: 'blur(12px)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
        <span className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase">⚡ Perf Debug</span>
        <ConnectionBadge state={connectionState} mode={transcriptionMode} />

        {/* Overall summary */}
        {metrics.avgOverallMs > 0 && (
          <span className="text-[9px] font-mono ml-1" style={{ color: msColor(metrics.avgOverallMs) }}>
            avg {metrics.avgOverallMs}ms · max {metrics.maxOverallMs}ms
          </span>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[9px] text-slate-600 font-mono">{metrics.packetsPerSec}/s</span>
          <button
            onClick={() => setExpanded(e => !e)}
            className="ml-1 w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-colors text-[10px]"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
          <button
            onClick={handleExport}
            className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-[#D4AF37] hover:bg-white/8 transition-colors"
            title="Export logs as JSON"
          >
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2v8m-3-3 3 3 3-3M3 12h10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={handleClear}
            className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-colors text-[9px]"
            title="Clear history &amp; reload"
          >
            ↺
          </button>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-white/8 transition-colors text-[11px] leading-none"
            title="Close (Ctrl+Shift+D)"
          >
            ×
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-2.5 space-y-2">
          {/* Row 1: pipeline latency metrics */}
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="WS RTT"
              series={metrics.wsRtt}
              description="Last audio chunk sent → first Deepgram result received (full round-trip, streaming pipeline)"
            />
            <MetricCard
              label="DG Server→Browser"
              series={metrics.deepgramLatency}
              description="Server timestamp when DG result arrived → browser receive (measures server→browser network only)"
            />
            <MetricCard
              label="Recorder Interval"
              series={metrics.recorderInterval}
              description="Actual gap between consecutive MediaRecorder ondataavailable events — should ≈ configured interval"
            />
          </div>

          {/* Row 2: render + AI */}
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="Mic Latency"
              series={metrics.micLatency}
              description="AudioContext.baseLatency — hardware/driver buffer before audio reaches the browser"
            />
            <MetricCard
              label="AI Coaching"
              series={metrics.aiCoaching}
              description="Full round-trip to /api/coach including streaming time"
            />
            <MetricCard
              label="Transcript Render"
              series={metrics.transcriptRender}
              description="setTranscript() → next animation frame (React cost)"
            />
          </div>

          {/* Row 3: chunk size + summary stats + interval selector */}
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="Chunk Size"
              series={metrics.chunkSizeKb}
              unit="KB"
              colorFn={kbColor}
              description="Size of each audio blob sent via WebSocket"
            />

            <div className="bg-white/4 border border-white/8 rounded-lg p-2 grid grid-cols-2 gap-x-4 gap-y-1.5 content-center">
              <Stat label="Packets/sec" value={`${metrics.packetsPerSec}`} color="#94a3b8" />
              <Stat label="Avg RTT" value={metrics.avgOverallMs > 0 ? `${metrics.avgOverallMs}ms` : '—'} color={msColor(metrics.avgOverallMs)} />
              <Stat label="Worst RTT" value={metrics.maxOverallMs > 0 ? `${metrics.maxOverallMs}ms` : '—'} color={msColor(metrics.maxOverallMs)} />
              <Stat label="Active" value={recorderIntervalMs != null ? `${recorderIntervalMs}ms` : `${storedInterval}ms`} color="#D4AF37" />
            </div>

            {/* Interval selector for benchmarking */}
            <div className="bg-white/4 border border-white/8 rounded-lg p-2 flex flex-col gap-1.5">
              <span className="text-[8.5px] text-slate-500 uppercase tracking-wider">Recorder Interval</span>
              <div className="grid grid-cols-5 gap-0.5">
                {VALID_INTERVALS.map((ms) => {
                  const isActive = (recorderIntervalMs ?? storedInterval) === ms;
                  const isStored = storedInterval === ms;
                  return (
                    <button
                      key={ms}
                      onClick={() => {
                        localStorage.setItem(LS_INTERVAL_KEY, String(ms));
                        setStoredInterval(ms);
                      }}
                      className="py-0.5 rounded text-[8.5px] font-mono transition-colors"
                      style={{
                        background: isActive ? 'rgba(212,175,55,0.2)' : isStored ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.04)',
                        color: isActive ? '#D4AF37' : isStored ? '#a88c2a' : '#64748b',
                        border: `1px solid ${isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                      title={`Set recorder interval to ${ms}ms (takes effect on next call start)`}
                    >
                      {ms}
                    </button>
                  );
                })}
              </div>
              <span className="text-[7.5px] text-slate-700 leading-tight">
                {(recorderIntervalMs ?? storedInterval) !== storedInterval
                  ? `Next call: ${storedInterval}ms`
                  : 'Restart call to apply'}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 pt-0.5 border-t border-white/6">
            <span className="text-[8.5px] text-slate-600 uppercase tracking-wider font-semibold">Pipeline</span>
            <span className="text-[8.5px] font-mono text-slate-500">continuous-ws</span>
            <span className="text-[8.5px] text-slate-700 mx-1">·</span>
            {[['<300ms', '#22c55e'], ['300–800ms', '#eab308'], ['>800ms', '#ef4444']].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 text-[8.5px] text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
            <span className="text-[8.5px] text-slate-700 ml-auto">Ctrl+Shift+D</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8.5px] text-slate-600 uppercase tracking-wider">{label}</span>
      <span className="text-[11px] font-mono font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}
