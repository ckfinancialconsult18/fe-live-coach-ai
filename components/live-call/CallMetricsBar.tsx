'use client';

import { scoreColor } from '@/lib/score-color';

interface Props {
  duration: number;
  buyingSignalCount: number;
  objectionCount: number;
  callQuality: number;
  avgResponseTime: number;
}

export function CallMetricsBar({
  duration, buyingSignalCount, objectionCount, callQuality, avgResponseTime,
}: Props) {
  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  const metrics = [
    { label: 'Duration',       value: fmt(duration),                    icon: '⏱️' },
    { label: 'Buying Signals', value: String(buyingSignalCount),         icon: '🟢', color: buyingSignalCount > 0 ? '#22c55e' : undefined },
    { label: 'Objections',     value: String(objectionCount),            icon: '🔴', color: objectionCount > 2 ? '#ef4444' : undefined },
    { label: 'Call Quality',   value: `${callQuality}%`,                 icon: '📊', color: scoreColor(callQuality) },
    { label: 'Avg Response',   value: `${avgResponseTime.toFixed(1)}s`,  icon: '💬' },
  ];

  return (
    <div className="h-12 flex items-center gap-4 px-5 border-t border-white/6 bg-[#090d18]/60 backdrop-blur-md shrink-0">
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center gap-2">
          <span className="text-sm">{m.icon}</span>
          <div>
            <p className="text-[9px] text-slate-600 leading-none">{m.label}</p>
            <p className="text-xs font-bold leading-tight" style={{ color: m.color ?? '#e2e8f0' }}>{m.value}</p>
          </div>
          <div className="w-px h-5 bg-white/6 ml-2" />
        </div>
      ))}
    </div>
  );
}

