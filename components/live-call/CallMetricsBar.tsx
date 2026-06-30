'use client';

import { scoreColor } from '@/lib/score-color';

interface Props {
  duration: number;
  buyingSignalCount: number;
  objectionCount: number;
  callQuality: number;
  avgResponseTime: number;
  isLive: boolean;
  onStartCall: () => void;
  onEndCall: () => void;
}

export function CallMetricsBar({
  duration, buyingSignalCount, objectionCount, callQuality, avgResponseTime, isLive, onStartCall, onEndCall,
}: Props) {
  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  const metrics = [
    { label: 'Duration',     value: fmt(duration),               icon: '⏱️' },
    { label: 'Buying Signals', value: String(buyingSignalCount), icon: '🟢', color: buyingSignalCount > 0 ? '#22c55e' : undefined },
    { label: 'Objections',   value: String(objectionCount),      icon: '🔴', color: objectionCount > 2 ? '#ef4444' : undefined },
    { label: 'Call Quality', value: `${callQuality}%`,           icon: '📊', color: scoreColor(callQuality) },
    { label: 'Avg Response', value: `${avgResponseTime.toFixed(1)}s`, icon: '💬' },
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

      <div className="ml-auto">
        {!isLive ? (
          <button
            onClick={onStartCall}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-100"
            style={{
              background: 'linear-gradient(135deg, #D4AF37, #9a7a0a)',
              boxShadow: '0 4px 16px rgba(212,175,55,0.35)',
              color: '#090d18',
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/>
            </svg>
            Start Call
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-live" />
              <span className="text-xs font-semibold text-green-400">Call Active · {fmt(duration)}</span>
            </div>
            <button
              onClick={onEndCall}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(135deg)' }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/>
              </svg>
              End Call
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

