'use client';

import type { TimelineEvent, TimelineEventCategory } from '@/lib/types';

interface Props {
  events: TimelineEvent[];
  onJump?: (event: TimelineEvent) => void;
}

const CATEGORY_META: Record<TimelineEventCategory, { icon: string; color: string }> = {
  greeting: { icon: '👋', color: '#94a3b8' },
  rapport: { icon: '🤝', color: '#22c55e' },
  discovery: { icon: '🔍', color: '#06b6d4' },
  objection: { icon: '🔴', color: '#ef4444' },
  buying_signal: { icon: '🟢', color: '#22c55e' },
  health_qualification: { icon: '🩺', color: '#a855f7' },
  price_discussion: { icon: '💰', color: '#f59e0b' },
  application_attempt: { icon: '📝', color: '#D4AF37' },
  close: { icon: '🎯', color: '#D4AF37' },
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CallTimeline({ events, onJump }: Props) {
  if (events.length === 0) {
    return <p className="text-xs text-slate-600 text-center py-6">No timeline events recorded for this call.</p>;
  }

  return (
    <div className="space-y-0.5">
      {events.map((e, i) => {
        const meta = CATEGORY_META[e.category];
        return (
          <button
            key={e.id}
            onClick={() => onJump?.(e)}
            disabled={!onJump || !e.transcriptLineId}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent group"
          >
            <span className="text-[10px] font-mono text-slate-500 w-10 shrink-0">{fmtTime(e.timestampSec)}</span>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0" style={{ background: `${meta.color}1a` }}>
              {meta.icon}
            </span>
            <span className="text-xs text-slate-300 group-hover:text-slate-100 transition-colors truncate">{e.label}</span>
            {i < events.length - 1 && <span className="ml-auto" />}
          </button>
        );
      })}
    </div>
  );
}
