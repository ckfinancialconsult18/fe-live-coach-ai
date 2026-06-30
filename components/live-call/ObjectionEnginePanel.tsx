'use client';

import type { ObjectionAnalysis } from '@/lib/types';

interface Props {
  objection: ObjectionAnalysis;
  isNew: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  already_insured: 'Already Insured',
  think_about_it: 'Need to Think About It',
  too_expensive: 'Too Expensive',
  call_later: 'Call Me Later',
  need_spouse: 'Need to Ask Spouse',
  need_children: 'Need to Ask Children',
  not_interested: 'Not Interested',
};

export function ObjectionEnginePanel({ objection, isNew }: Props) {
  const label = TYPE_LABELS[objection.type] ?? objection.type.replace(/_/g, ' ');

  return (
    <div
      className={`rounded-xl p-3 border space-y-3 ${isNew ? 'animate-alert' : ''}`}
      style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
    >
      <div className="flex items-center gap-2">
        <span>🔴</span>
        <span className="text-xs font-bold text-red-400 capitalize">{label}</span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
          {objection.confidence}% confidence
        </span>
      </div>

      <p className="text-sm text-slate-200 font-medium">&quot;{objection.quote}&quot;</p>

      <div className="space-y-1.5 pt-1 border-t border-white/6">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Why This Happened</p>
        <p className="text-xs text-slate-300 leading-relaxed">{objection.whyItOccurred}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-red-300/80 uppercase tracking-wider">Emotional Context</p>
        <p className="text-xs text-slate-300 leading-relaxed">{objection.emotionalContext}</p>
      </div>

      <div className="space-y-1.5 pt-1 border-t border-white/6">
        <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider">Recommended Response</p>
        <p className="text-sm text-slate-200 leading-relaxed">{objection.recommendedResponse}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Alternate Response</p>
        <p className="text-xs text-slate-300 leading-relaxed">{objection.alternateResponse}</p>
      </div>

      <div className="rounded-lg p-2.5 border" style={{ background: 'rgba(212,175,55,0.05)', borderColor: 'rgba(212,175,55,0.2)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#D4AF37' }}>Follow-up Question</p>
        <p className="text-xs text-slate-200 mt-1">&quot;{objection.followUpQuestion}&quot;</p>
      </div>
    </div>
  );
}
