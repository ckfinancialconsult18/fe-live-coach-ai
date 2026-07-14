'use client';

import type { CallStage, ChecklistItem, NextBestAction } from '@/lib/types';

export const STAGES: { key: CallStage; label: string; icon: string; required: string[] }[] = [
  {
    key: 'introduction',
    label: 'Open',
    icon: '👋',
    required: [
      'Say their name — no pause, no question mark',
      '"Hey, it\'s [Name] getting back to you. How are you today?"',
      'Drop 1-2 pieces of info you know about them — "Is that you?"',
      '"I\'m the guy they put in charge of getting you all the info. Is that okay?"',
    ],
  },
  {
    key: 'permission',
    label: 'Reason',
    icon: '🎯',
    required: [
      '"Did something happen in life to trigger you looking now?"',
      '"Do you have anything in place currently, or nothing at all?"',
      'If nothing: "Is it health reasons, or just haven\'t got around to it?"',
      'If has some: "Did you get it recently, or have you had it a while?"',
      '"Who\'s in charge if you drop dead — who\'s picking up the pieces?"',
    ],
  },
  {
    key: 'discovery',
    label: 'Situation',
    icon: '🔍',
    required: [
      '"So if you were to drop dead this afternoon — who\'s in charge?"',
      '"Are you looking for cremation or burial? Any extra money to leave behind?"',
      'If has coverage: "Who is it through? Whole life, term, or accidental?"',
      '"How much coverage is it supposed to be? Read me what it says there."',
      '"What are you paying for that each month?"',
      '"Do you know if there is a waiting period on it?"',
      '"When you reached out — add coverage, better deal, or both?"',
    ],
  },
  {
    key: 'health',
    label: 'Health',
    icon: '❤️',
    required: [
      '"Tell me a little bit about what you got going on health-wise. Anything major?"',
      '"What other things are you taking prescriptions for?"',
      '"So just the one pill a day? That\'s it?" — reconfirm if only 1-2 things',
      '"No history of heart issues, cancer, diabetes, kidney stuff?"',
      '"Are you a smoker or no?"',
      'Flag: Dialysis, Oxygen, active Cancer, Alzheimer\'s = GI only',
    ],
  },
  {
    key: 'budget',
    label: 'Process',
    icon: '📋',
    required: [
      '"I\'m gonna run a quick medical background check — find what we can actually get you approved for."',
      '"All your medical stuff is tracked by name, address, DOB, and social."',
      '"Once I know who will cover you, I can shop around and find the best deal."',
      '"Can you verify your social for me?"',
      '"I\'m gonna send you a text from the company — read me back that code."',
    ],
  },
  {
    key: 'close',
    label: 'Close',
    icon: '✅',
    required: [
      '"Alright, good news — we got you approved. Let me explain how this plan works."',
      'Show max first: "They\'ve approved you up to $X — I\'m not suggesting you get this amount."',
      'Present 3 options and let them pick',
      '"Do you prefer this to come out of checking or savings?"',
      '"First payment usually comes out in 2-3 days, or we can line it up with your Social Security date."',
      '"I\'m going to send all of this to you by text and email. Any questions at all for me?"',
    ],
  },
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
        <p className="text-xs text-[#D4AF37] mt-1">{Math.round(progress)}% through call</p>
      </div>

      {/* Current stage required questions */}
      {currentStageData && (
        <div className="px-4 pb-3 shrink-0 space-y-1.5 border-b border-white/6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Required — {currentStageData.label}</p>
          {currentStageData.required.map((q) => (
            <div key={q} className="flex items-start gap-2">
              <span className="mt-0.5 text-xs text-green-400 shrink-0">○</span>
              <span className="text-xs text-slate-400 leading-tight">{q}</span>
            </div>
          ))}
        </div>
      )}

      {/* Checklist completion from AI */}
      {checklist.length > 0 && (
        <div className="px-4 py-2.5 shrink-0 space-y-1 border-b border-white/6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Checklist — {checkedIds.size}/{checklist.length} done
          </p>
          {checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className={`text-xs font-bold ${item.checked ? 'text-green-400' : 'text-slate-600'}`}>
                {item.checked ? '✓' : '○'}
              </span>
              <span className={`text-xs ${item.checked ? 'text-slate-400 line-through' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Next best action */}
      {nextBestAction && (
        <div className="px-4 py-2.5 shrink-0 border-b border-white/6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#D4AF37' }}>Recommended Next</p>
          <p className="text-sm text-slate-200 leading-snug">{nextBestAction.nextQuestion || nextBestAction.nextResponse}</p>
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-[rgba(212,175,55,0.12)] border border-[rgba(212,175,55,0.25)]" style={{ color: '#D4AF37' }}>
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
                <span className="flex items-center gap-1 text-[10px] font-bold text-[#D4AF37]">
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
