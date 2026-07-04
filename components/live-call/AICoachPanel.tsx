'use client';

import { useState } from 'react';
import type { CoachInsight } from '@/lib/types';
import { ObjectionEnginePanel } from './ObjectionEnginePanel';
import { BuyingSignalEnginePanel } from './BuyingSignalEnginePanel';
import { NextBestActionPanel } from './NextBestActionPanel';

interface Props {
  insight: CoachInsight;
  isAnalyzing: boolean;
  /** True while coaching is based on a Web Speech interim (partial) transcript.
   *  Content dims to gray and shows a "live" indicator; transitions to gold when
   *  the confirmed Deepgram transcript lands and analysis completes. */
  isInterimCoaching?: boolean;
}

const OBJECTION_CONFIDENCE_THRESHOLD = 55;

export function AICoachPanel({ insight, isAnalyzing, isInterimCoaching = false }: Props) {
  // Filter out low-confidence objections to avoid false positives
  const activeObjection = insight.objectionAnalysis && insight.objectionAnalysis.confidence >= OBJECTION_CONFIDENCE_THRESHOLD
    ? insight.objectionAnalysis
    : null;
  const objectionQuote = activeObjection?.quote ?? insight.detectedObjection;

  // Track the previously-rendered objection quote to detect a change, using
  // React's documented "adjust state during render" pattern rather than an
  // effect (avoids an extra render pass on every update).
  const [renderedQuote, setRenderedQuote] = useState(objectionQuote);
  const [objectionIsNew, setObjectionIsNew] = useState(false);
  if (objectionQuote !== renderedQuote) {
    setRenderedQuote(objectionQuote);
    setObjectionIsNew(true);
  } else if (objectionIsNew) {
    setObjectionIsNew(false);
  }

  // Fallback alert (used only when the model returns a buying_signal /
  // opportunity flag without a full structured objectionAnalysis).
  const simpleAlert = !activeObjection && insight.detectedObjection
    ? insight.objectType === 'buying_signal'
      ? { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', text: '#22c55e', icon: '🟢', label: 'Buying Signal Detected' }
      : insight.objectType === 'opportunity'
      ? { bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.25)', text: '#D4AF37', icon: '🟡', label: 'Opportunity' }
      : null
    : null;

  // Derive accent color: gray during interim, gold when confirmed
  const accent = isInterimCoaching ? '#64748b' : '#D4AF37';
  const accentBg = isInterimCoaching ? 'rgba(100,116,139,0.08)' : 'rgba(212,175,55,0.08)';
  const accentBorder = isInterimCoaching ? 'rgba(100,116,139,0.2)' : 'rgba(212,175,55,0.2)';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-xs transition-colors duration-500"
            style={{ background: isInterimCoaching ? 'rgba(100,116,139,0.15)' : 'rgba(212,175,55,0.15)' }}
          >
            🤖
          </div>
          <h2 className="text-sm font-semibold text-slate-200">AI Coach</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Interim badge — shown while predicting from partial transcript */}
          {isInterimCoaching && !isAnalyzing && (
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-1 h-1 rounded-full bg-slate-500 animate-pulse" />
              predicting
            </div>
          )}
          {/* Analyzing badge — shown during confirmed analysis */}
          {isAnalyzing && (
            <div className="flex items-center gap-1.5 text-[10px] text-[#D4AF37]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-live" />
              Analyzing
            </div>
          )}
        </div>
      </div>

      {/* Content — dims and desaturates during interim, transitions to gold when confirmed */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{
          opacity: isInterimCoaching ? 0.72 : 1,
          filter: isInterimCoaching ? 'saturate(0.4)' : 'saturate(1)',
          transition: 'opacity 0.45s ease, filter 0.45s ease',
        }}
      >
        {/* Interim hint — visible only when coaching is based on partial text */}
        {isInterimCoaching && (
          <div className="flex items-center gap-1.5 -mt-0.5 mb-0.5 text-[9px] text-slate-600 border-b border-white/4 pb-2">
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v2.75l1.5 1" strokeLinecap="round" />
            </svg>
            Live — updating as you speak · will confirm when sentence ends
          </div>
        )}
        {/* Objection Engine — only shown when confidence >= threshold */}
        {activeObjection && (
          <ObjectionEnginePanel objection={activeObjection} isNew={objectionIsNew} />
        )}

        {/* Fallback simple alert (buying_signal / opportunity flag with no structured objection) */}
        {simpleAlert && insight.detectedObjection && (
          <div
            className={`rounded-xl p-3 border ${objectionIsNew ? 'animate-alert' : ''}`}
            style={{ background: simpleAlert.bg, borderColor: simpleAlert.border }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span>{simpleAlert.icon}</span>
              <span className="text-xs font-bold" style={{ color: simpleAlert.text }}>{simpleAlert.label}</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: simpleAlert.bg, color: simpleAlert.text, border: `1px solid ${simpleAlert.border}` }}>
                {insight.confidence}% confidence
              </span>
            </div>
            <p className="text-sm text-slate-200 font-medium">&quot;{insight.detectedObjection}&quot;</p>
          </div>
        )}

        {/* Close Opportunity Meter */}
        <div className="glass-card rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Close Opportunity</span>
            <span className="text-sm font-bold" style={{ color: closeColor(insight.closeOpportunityPct) }}>
              {insight.closeOpportunityPct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5">
            <div
              className="h-1.5 rounded-full transition-all duration-700"
              style={{
                width: `${insight.closeOpportunityPct}%`,
                background: closeGradient(insight.closeOpportunityPct),
              }}
            />
          </div>
        </div>

        {/* Next Best Action Engine */}
        {insight.nextBestAction ? (
          <NextBestActionPanel
            action={insight.nextBestAction}
            stallDetected={insight.stallDetected}
            likelyCominObjection={insight.likelyCominObjection}
            rapportBuilt={insight.rapportBuilt}
            discoveryComplete={insight.discoveryComplete}
          />
        ) : (
          <div className="rounded-xl p-3 space-y-1.5 border transition-colors duration-500"
            style={{ background: accentBg, borderColor: accentBorder }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider transition-colors duration-500" style={{ color: accent }}>Next Best Question</p>
            <p className="text-sm text-slate-200">&quot;{insight.nextBestQuestion}&quot;</p>
          </div>
        )}

        {/* Recommended Response (only when no structured objection already shows one) */}
        {!activeObjection && (
          <div className="glass-card rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Recommended Response</p>
            <p className="text-sm text-slate-200 leading-relaxed">{insight.recommendedResponse}</p>
            {insight.whyThisWorks && (
              <div className="pt-1 border-t border-white/6">
                <p className="text-[10px] text-slate-500 italic">💡 {insight.whyThisWorks}</p>
              </div>
            )}
          </div>
        )}

        {/* Alternatives */}
        {!activeObjection && insight.alternativeResponses.length > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Alternative Responses</p>
            <div className="space-y-2">
              {insight.alternativeResponses.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-[10px] font-bold mt-0.5 shrink-0 transition-colors duration-500" style={{ color: accent }}>{i + 1}.</span>
                  <p className="text-xs text-slate-300 leading-relaxed">{r}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missed Questions — overdue items the agent hasn't asked yet */}
        {insight.missedQuestions.length > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-2" style={{ border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">⚠ Missed Questions</p>
            <div className="space-y-1">
              {insight.missedQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-red-400 mt-0.5 shrink-0">!</span>
                  <p className="text-[11px] text-slate-300 leading-snug">{q}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Family References — prospect mentioned family this turn */}
        {insight.familyReferences.length > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-1.5" style={{ border: '1px solid rgba(34,197,94,0.15)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-green-400">Family Mentioned</p>
            {insight.familyReferences.map((ref, i) => (
              <p key={i} className="text-[11px] text-slate-200 italic">&ldquo;{ref}&rdquo;</p>
            ))}
          </div>
        )}

        {/* Buying Signal Engine */}
        <BuyingSignalEnginePanel signals={insight.buyingSignalDetails} />

        {/* Emotional Opportunities */}
        {insight.emotionalOpportunities.length > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Emotional Opportunities</p>
            <div className="space-y-1">
              {insight.emotionalOpportunities.map((e, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5">💛</span>
                  <p className="text-xs text-slate-300">{e}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function closeColor(pct: number) {
  if (pct >= 70) return '#22c55e';
  if (pct >= 40) return '#D4AF37';
  return '#ef4444';
}

function closeGradient(pct: number) {
  if (pct >= 70) return 'linear-gradient(90deg, #16a34a, #22c55e)';
  if (pct >= 40) return 'linear-gradient(90deg, #9a7a0a, #D4AF37)';
  return 'linear-gradient(90deg, #dc2626, #ef4444)';
}
