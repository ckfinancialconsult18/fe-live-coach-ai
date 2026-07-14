'use client';

import type { CallStage, ChecklistItem, CoachInsight } from '@/lib/types';
import type { CoachRagSource } from '@/hooks/useAICoach';
import { STAGES } from './CallStagePanel';

// One-line purpose shown under each stage header, mirroring the training guide.
const STAGE_PURPOSE: Partial<Record<CallStage, string>> = {
  introduction: 'Confirm identity — get past the first 30 seconds.',
  permission: 'Find out what made them send in the request.',
  discovery: 'Map their situation and any existing coverage.',
  health: 'Walk their health so you know what they qualify for.',
  budget: 'Run the process — verify info and check the background.',
  close: 'Present the options and secure the policy.',
};

interface Props {
  stage: CallStage;
  insight: CoachInsight;
  checklist: ChecklistItem[];
  isAnalyzing: boolean;
  isInterimCoaching?: boolean;
  ragSources?: CoachRagSource[];
}

const OBJECTION_CONFIDENCE_THRESHOLD = 55;

/** Rough word-overlap score used to spot which script track the AI's suggested
 *  next question corresponds to, so that track can be visually highlighted. */
function overlapScore(a: string, b: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const wa = new Set(norm(a));
  const wb = new Set(norm(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits++;
  return hits / Math.min(wa.size, wb.size);
}

export function ScriptFollowPanel({
  stage,
  insight,
  checklist,
  isAnalyzing,
  isInterimCoaching = false,
  ragSources = [],
}: Props) {
  const currentIdx = STAGES.findIndex((s) => s.key === stage);
  const currentStage = STAGES[currentIdx];
  const nextStage = STAGES[currentIdx + 1];
  const progress = ((currentIdx + 1) / STAGES.length) * 100;

  const activeObjection =
    insight.objectionAnalysis && insight.objectionAnalysis.confidence >= OBJECTION_CONFIDENCE_THRESHOLD
      ? insight.objectionAnalysis
      : null;

  const sayNow = activeObjection?.recommendedResponse || insight.recommendedResponse;
  const askNext = insight.nextBestAction?.nextQuestion || insight.nextBestQuestion;

  // Highlight the script track that best matches what the AI suggests next.
  const suggestedTrackIdx = (() => {
    if (!currentStage || !askNext) return -1;
    let best = -1;
    let bestScore = 0.45; // minimum overlap before we call it a match
    currentStage.required.forEach((track, i) => {
      const score = overlapScore(track, askNext);
      if (score > bestScore) { best = i; bestScore = score; }
    });
    return best;
  })();

  const checkedCount = checklist.filter((c) => c.checked).length;

  const namedSources = ragSources.filter((s) => s.title);
  const sourceDocs = [...new Map(namedSources.map((s) => [s.title, s])).values()];

  const gold = '#D4AF37';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center text-xs"
            style={{ background: 'rgba(212,175,55,0.15)' }}>
            🎯
          </div>
          <h2 className="text-sm font-semibold text-slate-200">Script Coach</h2>
        </div>
        <div className="flex items-center gap-2">
          {isInterimCoaching && !isAnalyzing && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-1 h-1 rounded-full bg-slate-500 animate-pulse" /> predicting
            </span>
          )}
          {isAnalyzing && (
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: gold }}>
              <span className="w-1.5 h-1.5 rounded-full animate-live" style={{ background: gold }} /> Analyzing
            </span>
          )}
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border"
            style={{
              color: insight.closeOpportunityPct >= 70 ? '#22c55e' : insight.closeOpportunityPct >= 40 ? gold : '#94a3b8',
              borderColor: 'rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.03)',
            }}
            title="Close opportunity"
          >
            {insight.closeOpportunityPct}%
          </span>
        </div>
      </div>

      {/* Stage stepper + progress */}
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-white/6">
        <div className="h-1 rounded-full bg-white/5 mb-2">
          <div className="h-1 rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, #9a7a0a, ${gold})` }} />
        </div>
        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <div key={s.key} className="flex-1 flex flex-col items-center gap-0.5" title={s.label}>
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                style={
                  i < currentIdx
                    ? { background: 'rgba(212,175,55,0.2)', color: gold }
                    : i === currentIdx
                      ? { background: `linear-gradient(135deg, ${gold}, #b8940f)`, color: '#090d18' }
                      : { background: 'rgba(255,255,255,0.05)', color: '#475569' }
                }
              >
                {i < currentIdx ? '✓' : i + 1}
              </div>
              <span className={`text-[8px] font-medium ${i === currentIdx ? 'text-[#D4AF37]' : 'text-slate-600'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable script body — dims during interim prediction like the coach panel */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{
          opacity: isInterimCoaching ? 0.72 : 1,
          filter: isInterimCoaching ? 'saturate(0.4)' : 'saturate(1)',
          transition: 'opacity 0.45s ease, filter 0.45s ease',
        }}
      >
        {/* Objection interrupt — takes over the top slot when one is live */}
        {activeObjection && (
          <div className="rounded-xl p-3 border space-y-1.5"
            style={{ background: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.3)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">
              ⛔ Objection — handle before returning to script
            </p>
            {activeObjection.quote && (
              <p className="text-[11px] text-slate-400 italic">&ldquo;{activeObjection.quote}&rdquo;</p>
            )}
            <p className="text-sm text-slate-200 leading-relaxed">{activeObjection.recommendedResponse}</p>
          </div>
        )}

        {/* SAY NOW — the AI's live line, styled like a key track */}
        {!activeObjection && (
          <div className="rounded-xl p-3 border space-y-1.5"
            style={{ background: 'rgba(212,175,55,0.08)', borderColor: 'rgba(212,175,55,0.35)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: gold }}>
              ▶ Say now
            </p>
            <p className="text-sm text-slate-100 leading-relaxed font-medium">{sayNow}</p>
            {askNext && askNext !== sayNow && (
              <p className="text-xs text-slate-400 pt-1 border-t border-white/6">
                Then ask: <span className="text-slate-300">&ldquo;{askNext}&rdquo;</span>
              </p>
            )}
          </div>
        )}

        {/* Current stage — guide-style header + word tracks */}
        {currentStage && (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 pt-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0"
                style={{ background: `linear-gradient(135deg, ${gold}, #b8940f)`, color: '#090d18' }}>
                {String(currentIdx + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase tracking-wide" style={{ color: gold }}>
                  The {currentStage.label}
                </p>
                <p className="text-[10px] text-slate-500 truncate">{STAGE_PURPOSE[currentStage.key] ?? ''}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              {currentStage.required.map((track, i) => {
                const isSuggested = i === suggestedTrackIdx;
                return (
                  <div
                    key={track}
                    className="rounded-xl px-3 py-2.5 border flex items-start gap-2.5 transition-all"
                    style={
                      isSuggested
                        ? { background: 'rgba(212,175,55,0.1)', borderColor: 'rgba(212,175,55,0.45)' }
                        : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }
                    }
                  >
                    <span className="mt-0.5 text-[10px] shrink-0" style={{ color: isSuggested ? gold : '#64748b' }}>
                      {isSuggested ? '▶' : '▸'}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs leading-snug ${isSuggested ? 'text-slate-100 font-medium' : 'text-slate-300'}`}>
                        {track}
                      </p>
                      {isSuggested && (
                        <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: gold }}>
                          ● AI suggests this next
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Checklist — compact chips */}
        {checklist.length > 0 && (
          <div className="rounded-xl p-3 border border-white/6 bg-white/[0.02] space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Checklist — {checkedCount}/{checklist.length} done
            </p>
            <div className="flex flex-wrap gap-1.5">
              {checklist.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border"
                  style={
                    item.checked
                      ? { background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)', color: '#4ade80' }
                      : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)', color: '#64748b' }
                  }
                >
                  {item.checked ? '✓' : '○'} {item.label.replace(/^Asked /, '')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Up next — preview of the following stage */}
        {nextStage && (
          <div className="rounded-xl p-3 border border-white/5 bg-white/[0.01] space-y-1.5" style={{ opacity: 0.65 }}>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
              Up next — {String(currentIdx + 2).padStart(2, '0')} The {nextStage.label}
            </p>
            {nextStage.required.slice(0, 2).map((track) => (
              <p key={track} className="text-[11px] text-slate-500 leading-snug">▸ {track}</p>
            ))}
            {nextStage.required.length > 2 && (
              <p className="text-[10px] text-slate-600">+{nextStage.required.length - 2} more</p>
            )}
          </div>
        )}

        {/* Knowledge base attribution */}
        {sourceDocs.length > 0 && (
          <div className="rounded-xl p-3 space-y-2 border border-white/6 bg-white/[0.02]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">📚 Knowledge Base Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {sourceDocs.map((s) => (
                <span
                  key={s.id}
                  title={`${Math.round(s.similarity * 100)}% relevant to this moment in the call`}
                  className="inline-flex items-center gap-1 max-w-full rounded-full px-2 py-0.5 text-[10px] border"
                  style={{ background: 'rgba(212,175,55,0.06)', borderColor: 'rgba(212,175,55,0.2)', color: '#c9b26a' }}
                >
                  <span className="truncate max-w-[160px]">{s.title}</span>
                  <span className="text-slate-500 shrink-0">{Math.round(s.similarity * 100)}%</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
