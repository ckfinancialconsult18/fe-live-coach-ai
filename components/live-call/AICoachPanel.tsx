'use client';

import { useEffect, useRef } from 'react';
import type { CoachInsight } from '@/lib/types';

interface Props {
  insight: CoachInsight;
  isAnalyzing: boolean;
}

export function AICoachPanel({ insight, isAnalyzing }: Props) {
  const prevObjectionRef = useRef<string | null>(null);
  const key = insight.detectedObjection ?? 'idle';

  useEffect(() => {
    prevObjectionRef.current = insight.detectedObjection;
  }, [insight.detectedObjection]);

  const changed = insight.detectedObjection !== prevObjectionRef.current;

  const alertColor = insight.objectType === 'objection'
    ? { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: '#ef4444', icon: '🔴', label: 'Objection Detected' }
    : insight.objectType === 'buying_signal'
    ? { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', text: '#22c55e', icon: '🟢', label: 'Buying Signal Detected' }
    : insight.objectType === 'opportunity'
    ? { bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.25)', text: '#D4AF37', icon: '🟡', label: 'Opportunity' }
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center text-xs"
            style={{ background: 'rgba(212,175,55,0.15)' }}>
            🤖
          </div>
          <h2 className="text-sm font-semibold text-slate-200">AI Coach</h2>
        </div>
        {isAnalyzing && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#D4AF37]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-live" />
            Analyzing
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" key={key}>
        {/* Alert Banner */}
        {alertColor && insight.detectedObjection && (
          <div
            className={`rounded-xl p-3 border ${changed ? 'animate-alert' : ''}`}
            style={{ background: alertColor.bg, borderColor: alertColor.border }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span>{alertColor.icon}</span>
              <span className="text-xs font-bold" style={{ color: alertColor.text }}>{alertColor.label}</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: alertColor.bg, color: alertColor.text, border: `1px solid ${alertColor.border}` }}>
                {insight.confidence}% confidence
              </span>
            </div>
            <p className="text-sm text-slate-200 font-medium">"{insight.detectedObjection}"</p>
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

        {/* Recommended Response */}
        <div className="glass-card rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Recommended Response</p>
          <p className="text-sm text-slate-200 leading-relaxed">{insight.recommendedResponse}</p>
          {insight.whyThisWorks && (
            <div className="pt-1 border-t border-white/6">
              <p className="text-[10px] text-slate-500 italic">💡 {insight.whyThisWorks}</p>
            </div>
          )}
        </div>

        {/* Alternatives */}
        {insight.alternativeResponses.length > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Alternative Responses</p>
            <div className="space-y-2">
              {insight.alternativeResponses.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-[10px] font-bold text-[#D4AF37] mt-0.5 shrink-0">{i + 1}.</span>
                  <p className="text-xs text-slate-300 leading-relaxed">{r}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Best Question */}
        <div className="rounded-xl p-3 space-y-1.5 border"
          style={{ background: 'rgba(212,175,55,0.05)', borderColor: 'rgba(212,175,55,0.2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#D4AF37' }}>Next Best Question</p>
          <p className="text-sm text-slate-200">"{insight.nextBestQuestion}"</p>
        </div>

        {/* Buying Signals */}
        {insight.buyingSignals.length > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Buying Signals</p>
            <div className="space-y-1">
              {insight.buyingSignals.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-green-400 text-xs mt-0.5">✓</span>
                  <p className="text-xs text-slate-300">{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}

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
