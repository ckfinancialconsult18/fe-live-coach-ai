'use client';

import type { NextBestAction } from '@/lib/types';

interface Props {
  action: NextBestAction;
}

const GUIDANCE_META: Record<NextBestAction['talkListenGuidance'], { label: string; icon: string; color: string }> = {
  speak:  { label: 'Speak Now',  icon: '🗣️', color: '#D4AF37' },
  listen: { label: 'Listen',     icon: '👂', color: '#22c55e' },
  pause:  { label: 'Pause',      icon: '⏸️', color: '#94a3b8' },
};

const ACTION_TYPE_LABELS: Record<NextBestAction['actionType'], string> = {
  ask_question: 'Ask Another Question',
  handle_objection: 'Handle Objection',
  build_rapport: 'Build Rapport',
  transition: 'Transition',
  trial_close: 'Trial Close',
  close_now: 'Close Now',
  present_product: 'Present Product',
  stop_talking: 'Stop Talking',
};

export function NextBestActionPanel({ action }: Props) {
  const guidance = GUIDANCE_META[action.talkListenGuidance];

  return (
    <div className="rounded-xl p-3 space-y-3 border" style={{ background: 'rgba(212,175,55,0.05)', borderColor: 'rgba(212,175,55,0.2)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#D4AF37' }}>Next Best Action</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/8 text-slate-200">
            {ACTION_TYPE_LABELS[action.actionType]}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${guidance.color}1a`, color: guidance.color }}>
            {guidance.icon} {guidance.label}
          </span>
        </div>
      </div>

      {action.nextQuestion && (
        <div>
          <p className="text-[10px] text-slate-500 mb-0.5">Next Question</p>
          <p className="text-sm text-slate-200">&quot;{action.nextQuestion}&quot;</p>
        </div>
      )}

      {action.nextResponse && (
        <div>
          <p className="text-[10px] text-slate-500 mb-0.5">Next Response</p>
          <p className="text-sm text-slate-200">{action.nextResponse}</p>
        </div>
      )}

      {action.nextClose && (
        <div>
          <p className="text-[10px] text-green-400 mb-0.5">Suggested Close</p>
          <p className="text-sm text-slate-200">&quot;{action.nextClose}&quot;</p>
        </div>
      )}

      <div className={`flex items-center gap-2 rounded-lg p-2 border ${
        action.readyForApplication ? 'bg-green-500/10 border-green-500/25' : 'bg-white/4 border-white/8'
      }`}>
        <span>{action.readyForApplication ? '📝' : '⏳'}</span>
        <div className="min-w-0">
          <p className={`text-[10px] font-bold ${action.readyForApplication ? 'text-green-400' : 'text-slate-500'}`}>
            {action.readyForApplication ? 'Ready to ask for the application' : 'Not yet ready for the application'}
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">{action.readyForApplicationReason}</p>
        </div>
      </div>
    </div>
  );
}
