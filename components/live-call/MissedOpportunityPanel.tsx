'use client';

import type { MissedOpportunityState, DiscoveryItemState } from '@/lib/types';

interface Props {
  state: MissedOpportunityState;
  isAnalyzing: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  motivation:  'Motivation',
  beneficiary: 'Beneficiary',
  health:      'Health',
  financial:   'Financial',
  logistics:   'Logistics',
};

const CATEGORY_ORDER = ['motivation', 'beneficiary', 'health', 'financial', 'logistics'];

const STATE_CONFIG: Record<DiscoveryItemState, { label: string; dot: string; text: string }> = {
  not_started:   { label: 'Not Asked',     dot: 'bg-slate-700',  text: 'text-slate-600' },
  in_progress:   { label: 'In Progress',   dot: 'bg-blue-500/70', text: 'text-blue-400' },
  completed:     { label: 'Completed',     dot: 'bg-emerald-500', text: 'text-emerald-400' },
  needs_followup:{ label: 'Follow Up',     dot: 'bg-amber-400',  text: 'text-amber-400' },
};

const URGENCY_STYLE: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/8',
  high:     'border-amber-500/40 bg-amber-500/8',
  normal:   'border-[#D4AF37]/30 bg-[#D4AF37]/8',
};

const URGENCY_LABEL_STYLE: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-amber-400',
  normal:   'text-[#D4AF37]',
};

export function MissedOpportunityPanel({ state, isAnalyzing }: Props) {
  const { items, nextQuestion, progressPct, contradictions } = state;

  // Group items by category, preserving priority order within each group
  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: items.filter(i => i.category === cat),
  })).filter(g => g.items.length > 0);

  const completedCount = items.filter(i => i.state === 'completed').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center text-xs"
            style={{ background: 'rgba(212,175,55,0.15)' }}>
            🎯
          </div>
          <h2 className="text-sm font-semibold text-slate-200">Discovery Tracker</h2>
        </div>
        {isAnalyzing && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#D4AF37]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
            Scanning
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-400">Discovery Progress</span>
            <span className="text-[10px] font-bold text-slate-300">
              {completedCount} / {items.length} <span className="text-slate-600 font-normal">({progressPct}%)</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: progressPct >= 75 ? '#4ade80'
                           : progressPct >= 50 ? '#D4AF37'
                           : '#94a3b8',
                transition: 'width 0.8s cubic-bezier(.4,0,.2,1)',
              }}
            />
          </div>
        </div>

        {/* Contradiction warnings */}
        {contradictions.length > 0 && (
          <div className="space-y-1.5">
            {contradictions.map((c, i) => (
              <div key={i} className="rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="text-red-400 text-xs shrink-0 mt-0.5">⚠</span>
                  <div>
                    <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-0.5">Contradiction Detected</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{c}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Next best discovery question — always show if one exists */}
        {nextQuestion && (
          <div className={`rounded-xl border p-3 ${URGENCY_STYLE[nextQuestion.urgency]}`}>
            <div className="flex items-center justify-between mb-1.5">
              <p className={`text-[9px] font-bold uppercase tracking-wider ${URGENCY_LABEL_STYLE[nextQuestion.urgency]}`}>
                {nextQuestion.urgency === 'critical' ? '🔴 Ask Next' :
                 nextQuestion.urgency === 'high'     ? '🟡 Priority' : '💬 Suggested'}
                {' · '}{nextQuestion.label}
              </p>
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed font-medium">
              &ldquo;{nextQuestion.question}&rdquo;
            </p>
          </div>
        )}

        {!nextQuestion && progressPct === 100 && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3 text-center">
            <p className="text-[10px] font-semibold text-emerald-400">✓ Discovery Complete</p>
            <p className="text-[9px] text-slate-500 mt-0.5">All required information has been gathered.</p>
          </div>
        )}

        {/* Item list grouped by category */}
        {grouped.map(({ cat, items: catItems }) => (
          <div key={cat}>
            <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              {CATEGORY_LABELS[cat]}
            </p>
            <div className="space-y-1">
              {catItems.map(item => {
                const cfg = STATE_CONFIG[item.state];
                return (
                  <div key={item.id}
                    className={`flex items-start gap-2 py-1.5 px-2 rounded-lg transition-colors ${
                      item.state === 'needs_followup' ? 'bg-amber-500/6' :
                      item.state === 'completed'      ? 'bg-emerald-500/5' :
                      'bg-transparent'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[10px] font-medium ${
                          item.state === 'completed' ? 'text-slate-500 line-through' :
                          item.state === 'needs_followup' ? 'text-amber-300' :
                          item.state === 'in_progress' ? 'text-slate-300' :
                          'text-slate-500'
                        }`}>
                          {item.label}
                        </span>
                        <span className={`text-[8px] shrink-0 ${cfg.text}`}>{cfg.label}</span>
                      </div>
                      {item.note && item.state === 'needs_followup' && (
                        <p className="text-[9px] text-amber-600 leading-relaxed mt-0.5">{item.note}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <p className="text-[9px] text-slate-700 text-center pt-1 border-t border-white/5 leading-relaxed">
          Detected from transcript keywords + AI analysis.<br />
          Items auto-complete when the prospect answers naturally.
        </p>
      </div>
    </div>
  );
}
