'use client';

import type { ChecklistItem } from '@/lib/types';

interface Props {
  items: ChecklistItem[];
}

export function LiveReminders({ items }: Props) {
  const checked = items.filter((i) => i.checked).length;
  const pct = Math.round((checked / items.length) * 100);

  return (
    <div className="glass-card rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Checklist</p>
        <span className="text-[10px] font-bold" style={{ color: pct === 100 ? '#22c55e' : '#D4AF37' }}>
          {checked}/{items.length}
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/5">
        <div
          className="h-1 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #9a7a0a, #D4AF37)' }}
        />
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
            item.checked ? 'bg-green-500/5' : 'bg-red-500/5'
          }`}>
            <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
              item.checked ? 'bg-green-500/20 text-green-400' : 'border border-red-500/30 text-transparent'
            }`}>
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <span className={`text-[10px] font-medium ${item.checked ? 'text-slate-400 line-through' : 'text-slate-300'}`}>
              {item.label}
            </span>
            {!item.checked && (
              <span className="ml-auto text-[9px] font-bold text-red-400 bg-red-500/10 px-1 rounded">Missing</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
