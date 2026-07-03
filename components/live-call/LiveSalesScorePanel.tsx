'use client';

import type { LiveSalesScores } from '@/lib/types';
import { scoreColor } from '@/lib/score-color';

interface Props {
  scores: LiveSalesScores;
  isAnalyzing: boolean;
}

// Each row shows the label + the specific signals driving that score
const SCORE_ROWS: {
  key: keyof Omit<LiveSalesScores, 'overall'>;
  label: string;
  signals: string;
}[] = [
  {
    key: 'rapport',
    label: 'Rapport',
    signals: 'Greeting · Empathy · Listening ratio · Prospect engagement',
  },
  {
    key: 'discovery',
    label: 'Discovery',
    signals: 'Checklist · Health/Budget/Coverage/Beneficiary/Family questions',
  },
  {
    key: 'trust',
    label: 'Trust',
    signals: 'Filler-word rate · Confidence · Clarity · Stall detection',
  },
  {
    key: 'urgency',
    label: 'Urgency',
    signals: 'AI urgency signal · Prospect buying-signal language',
  },
  {
    key: 'presentation',
    label: 'Presentation',
    signals: 'Stage progress · Discovery depth · Product clarity',
  },
  {
    key: 'objectionHandling',
    label: 'Objection Handling',
    signals: 'Active objections · Stall · Incoming objection detection',
  },
  {
    key: 'closingReadiness',
    label: 'Closing Readiness',
    signals: 'Buying signals · Objections resolved · Discovery · NBA readiness',
  },
];

const OVERALL_LABEL: Record<string, string> = {
  strong: 'Strong — closing opportunity is high.',
  good:   'Good progress — deepen discovery.',
  build:  'Building momentum — focus on rapport.',
  early:  'Early stages — listen, ask questions.',
};

function overallLabel(score: number): string {
  if (score >= 78) return OVERALL_LABEL.strong;
  if (score >= 62) return OVERALL_LABEL.good;
  if (score >= 48) return OVERALL_LABEL.build;
  return OVERALL_LABEL.early;
}

export function LiveSalesScorePanel({ scores, isAnalyzing }: Props) {
  const circumference = 2 * Math.PI * 27;
  const dashArray = `${Math.round(circumference * scores.overall / 100)} ${circumference}`;

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
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
            Updating
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Overall score ring */}
        <div className="flex items-center gap-4 p-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
              <circle cx="32" cy="32" r="27" fill="none"
                stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="27" fill="none"
                stroke={scoreColor(scores.overall)}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={dashArray}
                style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(.4,0,.2,1)' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-extrabold leading-none"
                style={{ color: scoreColor(scores.overall) }}>
                {scores.overall}
              </span>
              <span className="text-[8px] text-slate-500 mt-0.5">/ 100</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-300">Overall Sales Probability</p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
              {overallLabel(scores.overall)}
            </p>
          </div>
        </div>

        {/* 7 category bars */}
        <div className="space-y-3">
          {SCORE_ROWS.map(({ key, label, signals }) => {
            const val = scores[key];
            const color = scoreColor(val);

            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-300 font-medium truncate">{label}</span>
                  <span className="text-[10px] font-bold w-7 text-right shrink-0"
                    style={{ color }}>
                    {val}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${val}%`,
                      background: color,
                      transition: 'width 0.9s cubic-bezier(.4,0,.2,1)',
                    }}
                  />
                </div>
                <p className="text-[8px] text-slate-700 mt-0.5 leading-relaxed truncate" title={signals}>
                  {signals}
                </p>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <p className="text-[9px] text-slate-700 leading-relaxed text-center pt-1 border-t border-white/5">
          Scores update each time new speech is analyzed.<br />
          Based on transcript signals — not AI estimates.
        </p>
      </div>
    </div>
  );
}
