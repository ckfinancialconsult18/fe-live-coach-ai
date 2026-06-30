'use client';

import type { CallMemory } from '@/lib/types';

interface Props {
  memory: CallMemory;
}

/** Phase 3 Part 7 — what the AI currently remembers about this call, so the agent can see at a glance what's already been established (and trust the AI won't re-ask it). */
export function MidCallMemoryPanel({ memory }: Props) {
  const hasAnything = memory.clientName || memory.spouseName || memory.childrenMentioned.length > 0
    || memory.healthConditionsMentioned.length > 0 || memory.budget || memory.carrierDiscussed || memory.premiumMentioned;

  if (!hasAnything) {
    return (
      <div className="glass-card rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Call Memory</p>
        <p className="text-xs text-slate-600 text-center py-2">Nothing established yet</p>
      </div>
    );
  }

  const rows: [string, string][] = [
    ...(memory.clientName ? [['Client', memory.clientName] as [string, string]] : []),
    ...(memory.spouseName ? [['Spouse', memory.spouseName] as [string, string]] : []),
    ...(memory.childrenMentioned.length ? [['Children', memory.childrenMentioned.join(', ')] as [string, string]] : []),
    ...(memory.budget ? [['Budget', memory.budget] as [string, string]] : []),
    ...(memory.carrierDiscussed ? [['Carrier', memory.carrierDiscussed] as [string, string]] : []),
    ...(memory.premiumMentioned ? [['Premium', memory.premiumMentioned] as [string, string]] : []),
  ];

  return (
    <div className="glass-card rounded-xl p-3 space-y-2">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Call Memory</p>
      <div className="grid grid-cols-2 gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg px-2 py-1.5 bg-white/4 border border-white/6">
            <p className="text-[9px] text-slate-600">{label}</p>
            <p className="text-xs font-semibold text-slate-200 truncate">{value}</p>
          </div>
        ))}
      </div>
      {memory.healthConditionsMentioned.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {memory.healthConditionsMentioned.map((c) => (
            <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">{c}</span>
          ))}
        </div>
      )}
      {memory.questionsAsked.length > 0 && (
        <div className="pt-1.5 border-t border-white/6">
          <p className="text-[9px] text-slate-600 mb-1">Already asked ({memory.questionsAsked.length})</p>
        </div>
      )}
    </div>
  );
}
