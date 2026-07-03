'use client';

import type { LiveSalesScores } from '@/lib/types';
import { scoreColor } from '@/lib/score-color';

interface Props {
  scores: LiveSalesScores;
  isAnalyzing: boolean;
}

const SCORE_ROWS: { key: keyof Omit<LiveSalesScores, 'overall'>; label: string }[] = [
  { key: 'rapport',           label: 'Rapport' },
  { key: 'discovery',         label: 'Discovery' },
  { key: 'trust',             label: 'Trust' },
  { key: 'urgency',           label: 'Urgency' },
  { key: 'presentation',      label: 'Presentation' },
  { key: 'objectionHandling', label: 'Objection Handling' },
  { key: 'closingReadiness',  label: 'Closing Readiness' },
];

export function LiveSalesScorePanel({ scores, isAnalyzing }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center text-xs"
            style={{ background: 'rgba(212,175,55,0.15)' }}>
            📊
          </div>
          <h2 className="text-sm font-semibold text-slate-200">Live Sales Score</h2>
        </div>
        {isAnalyzing && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#D4AF37]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-live" />
            Updating
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Overall score circle */}
        <div className="flex items-center gap-4 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
              <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="27" fill="none"
                stroke={scoreColor(scores.overall)}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${Math.round(2 * Math.PI * 27 * scores.overall / 100)} 999`}
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-extrabold leading-none" style={{ color: scoreColor(scores.overall) }}>
                {scores.overall}
              </span>
              <span className="text-[8px] text-slate-500 mt-0.5">overall</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-300">Sales Probability</p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
              {scores.overall >= 80 ? 'Strong call — closing opportunity is high.' :
               scores.overall >= 65 ? 'Good progress — push discovery deeper.' :
               scores.overall >= 50 ? 'Building momentum — focus on rapport.' :
               'Early stages — keep listening, ask questions.'}
            </p>
          </div>
        </div>

        {/* 7 category bars */}
        <div className="space-y-2.5">
          {SCORE_ROWS.map(({ key, label }) => {
            const val = scores[key];
            const color = scoreColor(val);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400">{label}</span>
                  <span className="text-[10px] font-bold w-7 text-right" style={{ color }}>{val}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${val}%`,
                      background: color,
                      transition: 'width 0.8s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend note */}
        <p className="text-[9px] text-slate-700 leading-relaxed text-center pt-1">
          Scores derived from checklist, question count,<br />
          stage progress, and AI-interpreted signals.
        </p>
      </div>
    </div>
  );
}
