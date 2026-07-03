'use client';

import { useState } from 'react';
import type { LiveObjectionState, EnhancedObjectionAnalysis, ObjectionPriority, ObjectionStatus } from '@/lib/types';

interface Props {
  state: LiveObjectionState;
  callStartMs: number;   // Date.now() at call start — for relative timestamps
}

const PRIORITY_CONFIG: Record<ObjectionPriority, { label: string; color: string; bg: string; border: string; dot: string }> = {
  critical: { label: 'CRITICAL', color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)',  dot: 'bg-red-400' },
  high:     { label: 'HIGH',     color: '#fb923c', bg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.3)', dot: 'bg-orange-400' },
  medium:   { label: 'MEDIUM',   color: '#D4AF37', bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.3)', dot: 'bg-yellow-400' },
  low:      { label: 'LOW',      color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)', dot: 'bg-slate-500' },
};

const STATUS_CONFIG: Record<ObjectionStatus, { label: string; color: string }> = {
  active:   { label: 'Active',   color: '#f87171' },
  resolved: { label: 'Resolved', color: '#4ade80' },
  reopened: { label: 'Reopened', color: '#fb923c' },
};

function riskColor(score: number): string {
  if (score >= 70) return '#ef4444';
  if (score >= 45) return '#f97316';
  if (score >= 25) return '#D4AF37';
  return '#4ade80';
}

function formatElapsed(ms: number, startMs: number): string {
  const s = Math.max(0, Math.floor((ms - startMs) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function ObjectionCard({ obj, defaultOpen = false }: { obj: EnhancedObjectionAnalysis; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = PRIORITY_CONFIG[obj.priority];

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: cfg.bg, borderColor: cfg.border }}>
      {/* Card header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
              {cfg.label}
            </span>
            <span className="text-xs font-semibold text-slate-200 truncate">
              {obj.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 truncate mt-0.5">&ldquo;{obj.quote}&rdquo;</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{obj.confidence}%</span>
          <span className="text-slate-600 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded coaching content */}
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/6">
          {/* Why AI thinks this */}
          {obj.whyItOccurred && (
            <div className="pt-2.5">
              <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider mb-1">💡 Why This Objection Exists</p>
              <p className="text-[11px] text-slate-300 leading-relaxed">{obj.whyItOccurred}</p>
            </div>
          )}

          {/* Emotional context */}
          {obj.emotionalContext && (
            <div>
              <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider mb-1">🧠 Emotional Context</p>
              <p className="text-[11px] text-slate-400 leading-relaxed italic">{obj.emotionalContext}</p>
            </div>
          )}

          {/* Recommended response */}
          {obj.recommendedResponse && (
            <div className="rounded-lg p-2.5" style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">📝 Recommended Response</p>
              <p className="text-[11px] text-slate-200 leading-relaxed">&ldquo;{obj.recommendedResponse}&rdquo;</p>
            </div>
          )}

          {/* Why it works */}
          {obj.alternateResponse && (
            <div>
              <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider mb-1">↩ Alternate Response</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">&ldquo;{obj.alternateResponse}&rdquo;</p>
            </div>
          )}

          {/* Follow-up question */}
          {obj.followUpQuestion && (
            <div className="rounded-lg p-2" style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#D4AF37' }}>❓ Follow-up Question</p>
              <p className="text-[11px] text-slate-200">&ldquo;{obj.followUpQuestion}&rdquo;</p>
            </div>
          )}

          {/* Mistakes to avoid */}
          {obj.mistakesToAvoid.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold text-red-400/80 uppercase tracking-wider mb-1.5">⚠ Mistakes to Avoid</p>
              <div className="space-y-1">
                {obj.mistakesToAvoid.map((m, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-red-500/60 text-[10px] shrink-0 mt-0.5">✗</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{m}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Closing bridge */}
          {obj.closingBridge && (
            <div className="rounded-lg p-2.5" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <p className="text-[9px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">🌉 Closing Bridge</p>
              <p className="text-[11px] text-slate-200 italic leading-relaxed">&ldquo;{obj.closingBridge}&rdquo;</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LiveObjectionPanel({ state, callStartMs }: Props) {
  const { primary, additional, history, patterns, riskScore } = state;
  const hasObjection = primary !== null || additional.length > 0;
  const rc = riskColor(riskScore);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center text-xs"
            style={{ background: 'rgba(239,68,68,0.15)' }}>
            🛡
          </div>
          <h2 className="text-sm font-semibold text-slate-200">Objection Coach</h2>
        </div>
        {hasObjection && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            {1 + additional.length} ACTIVE
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Risk meter */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Objection Risk</span>
            <span className="text-[10px] font-bold" style={{ color: rc }}>{riskScore}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${riskScore}%`,
                background: rc,
                transition: 'width 0.8s cubic-bezier(.4,0,.2,1)',
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[8px] text-slate-700">Low</span>
            <span className="text-[8px] text-slate-700">Critical</span>
          </div>
        </div>

        {/* Pattern alerts */}
        {patterns.length > 0 && (
          <div className="space-y-2">
            {patterns.map((p, i) => (
              <div key={i} className="rounded-xl border px-3 py-2.5"
                style={{ background: 'rgba(168,85,247,0.07)', borderColor: 'rgba(168,85,247,0.25)' }}>
                <p className="text-[9px] font-bold text-purple-400 uppercase tracking-wider mb-1">
                  🔗 Pattern: {p.label}
                </p>
                <p className="text-[10px] text-slate-300 leading-relaxed mb-1.5">{p.insight}</p>
                <p className="text-[10px] text-purple-300 leading-relaxed font-medium">{p.strongerApproach}</p>
              </div>
            ))}
          </div>
        )}

        {/* No active objections */}
        {!hasObjection && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <p className="text-xl mb-1">✓</p>
            <p className="text-[11px] font-semibold text-emerald-400">No Active Objections</p>
            <p className="text-[9px] text-slate-600 mt-1 leading-relaxed">
              The call is progressing well. Objection coaching<br />will appear here as soon as one is detected.
            </p>
          </div>
        )}

        {/* Primary objection — expanded by default */}
        {primary && <ObjectionCard obj={primary} defaultOpen />}

        {/* Secondary objections — collapsed by default */}
        {additional.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold">Additional Active Objections</p>
            {additional.map((obj, i) => (
              <ObjectionCard key={`${obj.type}-${i}`} obj={obj} defaultOpen={false} />
            ))}
          </div>
        )}

        {/* Objection history timeline */}
        {history.length > 0 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold mb-2">
              Objection Timeline ({history.length})
            </p>
            <div className="space-y-1.5">
              {[...history].reverse().map(entry => {
                const scfg = STATUS_CONFIG[entry.status];
                const pcfg = PRIORITY_CONFIG[entry.priority];
                return (
                  <div key={entry.id}
                    className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${pcfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold text-slate-300">{entry.label}</span>
                        <span className="text-[8px] font-bold" style={{ color: scfg.color }}>{scfg.label}</span>
                        <span className="text-[8px] text-slate-600 ml-auto">{formatElapsed(entry.timestampMs, callStartMs)}</span>
                      </div>
                      <p className="text-[9px] text-slate-600 truncate mt-0.5">&ldquo;{entry.quote}&rdquo;</p>
                      {entry.confidence > 0 && (
                        <p className="text-[8px]" style={{ color: pcfg.color }}>{entry.confidence}% confidence</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-[9px] text-slate-700 text-center pt-1 border-t border-white/5 leading-relaxed">
          Powered by AI objection analysis.<br />
          Coaching scripts update as the conversation evolves.
        </p>
      </div>
    </div>
  );
}
