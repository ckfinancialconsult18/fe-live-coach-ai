'use client';

import type { LiveClosingState, ClosingReadiness, BuyingSignalStrength } from '@/lib/types';

interface Props {
  state: LiveClosingState;
  isAnalyzing: boolean;
}

// ── Readiness config ──────────────────────────────────────────────────────────
const READINESS_CONFIG: Record<ClosingReadiness, {
  label: string; color: string; bg: string; border: string; icon: string;
}> = {
  ready_to_close: { label: 'Ready to Close',   color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.3)',  icon: '🟢' },
  almost_ready:   { label: 'Almost Ready',      color: '#D4AF37', bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.3)',  icon: '🟡' },
  needs_discovery:{ label: 'Needs Discovery',   color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.3)',  icon: '🔵' },
  high_risk:      { label: 'High Risk',         color: '#fb923c', bg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.3)',  icon: '🟠' },
  lost_sale:      { label: 'Lost Sale',         color: '#f87171', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',   icon: '🔴' },
};

// ── Strength config ───────────────────────────────────────────────────────────
const STRENGTH_CONFIG: Record<BuyingSignalStrength, { label: string; color: string; dots: number }> = {
  very_strong: { label: 'Very Strong', color: '#4ade80', dots: 4 },
  strong:      { label: 'Strong',      color: '#D4AF37', dots: 3 },
  moderate:    { label: 'Moderate',    color: '#60a5fa', dots: 2 },
  weak:        { label: 'Weak',        color: '#94a3b8', dots: 1 },
};

function probColor(p: number): string {
  if (p >= 75) return '#4ade80';
  if (p >= 55) return '#D4AF37';
  if (p >= 35) return '#fb923c';
  return '#f87171';
}

// SVG ring circumference for r=38: 2π×38 ≈ 238.76
const RING_C = 238.76;

export function LiveClosingPanel({ state, isAnalyzing }: Props) {
  const {
    probability, confidence, readiness, reasons,
    requirements, nextAction, closingScript,
    buyingSignals, dangerSignals, probabilityHistory,
  } = state;

  const rc = READINESS_CONFIG[readiness];
  const pc = probColor(probability);
  const dash = Math.round((probability / 100) * RING_C);

  const metCount = requirements.filter(r => r.met).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center text-xs"
            style={{ background: 'rgba(212,175,55,0.15)' }}>
            🎯
          </div>
          <h2 className="text-sm font-semibold text-slate-200">Closing Assistant</h2>
          {isAnalyzing && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
          )}
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}>
          {rc.icon} {rc.label}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">

        {/* Probability ring + confidence */}
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 92 92" className="w-20 h-20 -rotate-90">
              <circle cx="46" cy="46" r="38" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle
                cx="46" cy="46" r="38" fill="none"
                stroke={pc} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${RING_C}`}
                style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(.4,0,.2,1), stroke 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-extrabold leading-none" style={{ color: pc }}>
                {probability}%
              </span>
              <span className="text-[8px] text-slate-600 mt-0.5">chance</span>
            </div>
          </div>

          <div className="flex-1 space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Close Probability</span>
                <span className="text-[10px] font-bold" style={{ color: pc }}>{probability}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${probability}%`, background: pc,
                  transition: 'width 0.9s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">AI Confidence</span>
                <span className="text-[10px] font-bold text-slate-400">{confidence}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-slate-600"
                  style={{ width: `${confidence}%`, transition: 'width 0.9s ease' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Probability mini-sparkline */}
        {probabilityHistory.length >= 2 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold mb-1">Probability Trend</p>
            <div className="h-8 flex items-end gap-0.5">
              {probabilityHistory.slice(-20).map((snap, i) => {
                const max = Math.max(...probabilityHistory.slice(-20).map(s => s.value), 1);
                const hPct = Math.max(8, Math.round((snap.value / max) * 100));
                return (
                  <div key={i} className="flex-1 rounded-t-sm min-w-[3px]"
                    style={{ height: `${hPct}%`, background: probColor(snap.value), opacity: 0.7 }} />
                );
              })}
            </div>
          </div>
        )}

        {/* Next best action — gold card, always first */}
        {nextAction && (
          <div className="rounded-xl p-3"
            style={{ background: 'rgba(212,175,55,0.09)', border: '1px solid rgba(212,175,55,0.28)' }}>
            <p className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider mb-1.5">⚡ Next Best Action</p>
            <p className="text-[11px] text-slate-200 leading-relaxed font-medium">{nextAction}</p>
          </div>
        )}

        {/* Closing script */}
        {closingScript && (
          <div className="rounded-xl p-3"
            style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.22)' }}>
            <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5">📝 Closing Script</p>
            <p className="text-[11px] text-slate-200 italic leading-relaxed">&ldquo;{closingScript}&rdquo;</p>
          </div>
        )}

        {/* Danger signals */}
        {dangerSignals.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] text-red-400/80 uppercase tracking-wider font-semibold">⚠ Risk Signals</p>
            {dangerSignals.map((d, i) => (
              <div key={i} className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-[10px] font-semibold text-red-400">{d.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{d.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Reasons (why the score changed) */}
        {reasons.length > 0 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5">Why This Score</p>
            <div className="space-y-1">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-[10px] font-bold shrink-0 mt-px ${r.direction === '+' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.direction}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-300 leading-snug">{r.text}</p>
                    {r.evidence && (
                      <p className="text-[9px] text-slate-600 italic truncate mt-0.5">&ldquo;{r.evidence}&rdquo;</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing requirements checklist */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold">Pre-Close Requirements</p>
            <span className="text-[9px] font-bold" style={{ color: metCount === requirements.length ? '#4ade80' : '#D4AF37' }}>
              {metCount}/{requirements.length}
            </span>
          </div>
          <div className="space-y-1">
            {requirements.map(req => (
              <div key={req.id} className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 ${
                  req.met
                    ? 'bg-emerald-500/20 border border-emerald-500/40'
                    : 'bg-white/4 border border-white/10'
                }`}>
                  {req.met && <span className="text-[8px] text-emerald-400 font-bold">✓</span>}
                </div>
                <span className={`text-[10px] ${req.met ? 'text-emerald-400 line-through decoration-emerald-600' : 'text-slate-400'}`}>
                  {req.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Buying signals */}
        {buyingSignals.length > 0 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5">
              Buying Signals ({buyingSignals.length})
            </p>
            <div className="space-y-1.5">
              {buyingSignals.map((sig, i) => {
                const sc = STRENGTH_CONFIG[sig.strength];
                return (
                  <div key={i} className="rounded-lg px-2.5 py-2 flex items-start gap-2"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Strength dots */}
                    <div className="flex gap-0.5 mt-0.5 shrink-0">
                      {[1, 2, 3, 4].map(d => (
                        <div key={d} className="w-1 h-2.5 rounded-sm"
                          style={{ background: d <= sc.dots ? sc.color : 'rgba(255,255,255,0.08)' }} />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold" style={{ color: sc.color }}>{sc.label}</span>
                        <span className="text-[9px] text-slate-500">· {sig.label}</span>
                      </div>
                      <p className="text-[9px] text-slate-500 italic truncate mt-0.5">&ldquo;{sig.quote}&rdquo;</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {buyingSignals.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-white/2 px-3 py-2.5 text-center">
            <p className="text-[10px] text-slate-600">No buying signals detected yet.</p>
            <p className="text-[9px] text-slate-700 mt-0.5">Ask engaging questions to uncover interest.</p>
          </div>
        )}

        <p className="text-[9px] text-slate-700 text-center pt-1 border-t border-white/5 leading-relaxed">
          Probability updates every AI cycle.<br/>
          Evidence-based — derived from transcript signals only.
        </p>
      </div>
    </div>
  );
}
