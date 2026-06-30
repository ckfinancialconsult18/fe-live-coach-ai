'use client';

import type { BuyingSignal, BuyingSignalCategory } from '@/lib/types';

interface Props {
  signals: BuyingSignal[];
}

const CATEGORY_META: Record<BuyingSignalCategory, { label: string; icon: string; color: string }> = {
  curiosity:         { label: 'Curiosity',         icon: '🔍', color: '#06b6d4' },
  urgency:           { label: 'Urgency',           icon: '⚡', color: '#f59e0b' },
  financial_concern: { label: 'Financial Concern', icon: '💰', color: '#ef4444' },
  trust:             { label: 'Trust',             icon: '🤝', color: '#22c55e' },
  hesitation:        { label: 'Hesitation',        icon: '⏸️', color: '#94a3b8' },
  agreement:         { label: 'Agreement',         icon: '✅', color: '#22c55e' },
  commitment:        { label: 'Commitment',        icon: '🎯', color: '#D4AF37' },
  confusion:         { label: 'Confusion',         icon: '❓', color: '#a855f7' },
};

export function BuyingSignalEnginePanel({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <div className="glass-card rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Buying Signals</p>
        <p className="text-xs text-slate-600 text-center py-2">None detected yet</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-3 space-y-2.5">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Buying Signals</p>
      <div className="space-y-2">
        {signals.map((s, i) => {
          const meta = CATEGORY_META[s.category];
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">{meta.icon}</span>
                <span className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                <span className="ml-auto text-[10px] font-bold text-slate-400">{s.confidence}%</span>
              </div>
              <p className="text-xs text-slate-400 italic pl-5">&quot;{s.quote}&quot;</p>
              <div className="h-1 rounded-full bg-white/5 ml-5">
                <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${s.confidence}%`, background: meta.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
