'use client';

import type { CallStage } from '@/lib/types';

const STAGES: { key: CallStage; label: string; icon: string }[] = [
  { key: 'introduction',    label: 'Introduction',     icon: '👋' },
  { key: 'permission',      label: 'Permission',       icon: '🤝' },
  { key: 'discovery',       label: 'Discovery',        icon: '🔍' },
  { key: 'existing_coverage', label: 'Existing Coverage', icon: '📋' },
  { key: 'health',          label: 'Health',           icon: '❤️' },
  { key: 'budget',          label: 'Budget',           icon: '💰' },
  { key: 'presentation',    label: 'Presentation',     icon: '📊' },
  { key: 'objections',      label: 'Objections',       icon: '🛡️' },
  { key: 'close',           label: 'Close',            icon: '✅' },
];

interface Props {
  currentStage: CallStage;
}

export function CallStagePanel({ currentStage }: Props) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);
  const progress = ((currentIdx + 1) / STAGES.length) * 100;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Call Stage</h2>
        <span className="text-[10px] text-slate-500">{currentIdx + 1} of {STAGES.length}</span>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="h-1 rounded-full bg-white/5">
          <div
            className="h-1 rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #9a7a0a, #D4AF37)' }}
          />
        </div>
        <p className="text-[10px] text-[#D4AF37] mt-1">{Math.round(progress)}% complete</p>
      </div>

      {/* Stages */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {STAGES.map((stage, idx) => {
          const isActive = stage.key === currentStage;
          const isDone = idx < currentIdx;
          return (
            <div
              key={stage.key}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                isActive
                  ? 'border-[rgba(212,175,55,0.35)] bg-[rgba(212,175,55,0.08)]'
                  : isDone
                  ? 'border-white/5 bg-white/3'
                  : 'border-transparent'
              }`}
            >
              {/* Number / check */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                isDone
                  ? 'bg-[#D4AF37]/20 text-[#D4AF37]'
                  : isActive
                  ? 'text-[#090d18]'
                  : 'bg-white/5 text-slate-600'
              }`}
                style={isActive ? { background: 'linear-gradient(135deg, #D4AF37, #b8940f)' } : {}}>
                {isDone ? '✓' : idx + 1}
              </div>

              <span className={`text-xs font-medium flex-1 ${
                isActive ? 'text-[#D4AF37]' : isDone ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {stage.label}
              </span>

              {isActive && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-[#D4AF37]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-live" />
                  NOW
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
