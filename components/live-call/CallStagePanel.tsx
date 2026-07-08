'use client';

import type { CallStage, ChecklistItem, NextBestAction } from '@/lib/types';

const STAGES: { key: CallStage; label: string; icon: string; required: string[] }[] = [
  { key: 'introduction', label: 'Open',      icon: '👋', required: ['Introduce yourself and company', 'Confirm who you are speaking with', 'Build rapport and set a friendly tone'] },
  { key: 'permission',   label: 'Reason',    icon: '🎯', required: ['Explain why you are calling', 'Reference their inquiry or lead source', 'Get verbal confirmation they are still interested'] },
  { key: 'discovery',    label: 'Situation', icon: '🔍', required: ['Find out who they want to protect', 'Ask about existing coverage', 'Uncover beneficiary and family situation', 'Establish the need and urgency'] },
  { key: 'health',       label: 'Health',    icon: '❤️', required: ['Age and date of birth', 'Tobacco use in last 12 months', 'Major conditions (diabetes, cancer, COPD, CHF, stroke, kidney)', 'Current medications', 'Height and weight'] },
  { key: 'budget',       label: 'Process',   icon: '📋', required: ['Explain how the process works', 'Present benefit amount matched to budget', 'Name the carrier and plan type', 'Handle any objections', 'Confirm monthly budget comfort'] },
  { key: 'close',        label: 'Close',     icon: '✅', required: ['Ask for the business directly', 'Collect application information', 'Confirm payment details', 'Set expectations for next steps'] },
];

interface Props {
  currentStage: CallStage;
  checklist?: ChecklistItem[];
  nextBestAction?: NextBestAction | null;
}

export function CallStagePanel({ currentStage, checklist = [], nextBestAction }: Props) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);
  const progress = ((currentIdx + 1) / STAGES.length) * 100;
  const currentStageData = STAGES[currentIdx];

  const checkedIds = new Set(checklist.filter((c) => c.checked).map((c) => c.id));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Call Stage</h2>
        <span className="text-[10px] text-slate-500">{currentIdx + 1} of {STAGES.length}</span>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="h-1.5 rounded-full bg-white/5">
          <div
            className="h-1.5 rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #9a7a0a, #D4AF37)' }}
          />
        </div>
        <p className="text-[10px] text-[#D4AF37] mt-1">{Math.round(progress)}% through call</p>
      </div>

      {/* Current stage required questions */}
      {currentStageData && (
        <div className="px-4 pb-3 shrink-0 space-y-1.5 border-b border-white/6">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Required — {currentStageData.label}</p>
          {currentStageData.required.map((q) => (
            <div key={q} className="flex items-start gap-2">
              <span className="mt-0.5 text-[10px] text-green-400 shrink-0">○</span>
              <span className="text-[10px] text-slate-400 leading-tight">{q}</span>
            </div>
          ))}
        </div>
      )}

      {/* Checklist completion from AI */}
      {checklist.length > 0 && (
        <div className="px-4 py-2.5 shrink-0 space-y-1 border-b border-white/6">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Checklist — {checkedIds.size}/{checklist.length} done
          </p>
          {checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className={`text-[10px] font-bold ${item.checked ? 'text-green-400' : 'text-slate-600'}`}>
                {item.checked ? '✓' : '○'}
              </span>
              <span className={`text-[10px] ${item.checked ? 'text-slate-400 line-through' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Next best action */}
      {nextBestAction && (
        <div className="px-4 py-2.5 shrink-0 border-b border-white/6">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#D4AF37' }}>Recommended Next</p>
          <p className="text-[11px] text-slate-200 leading-snug">{nextBestAction.nextQuestion || nextBestAction.nextResponse}</p>
          <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-[rgba(212,175,55,0.12)] border border-[rgba(212,175,55,0.25)]" style={{ color: '#D4AF37' }}>
            {nextBestAction.actionType?.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* Stages list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1 pt-2">
        {STAGES.map((stage, idx) => {
          const isActive = stage.key === currentStage;
          const isDone = idx < currentIdx;
          return (
            <div
              key={stage.key}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all ${
                isActive
                  ? 'border-[rgba(212,175,55,0.35)] bg-[rgba(212,175,55,0.08)]'
                  : isDone
                  ? 'border-white/5 bg-white/3'
                  : 'border-transparent'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                isDone ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : isActive ? 'text-[#090d18]' : 'bg-white/5 text-slate-600'
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
