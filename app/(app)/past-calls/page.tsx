'use client';

import { useState, useEffect } from 'react';
import { formatDuration } from '@/lib/format-duration';
import type { CallRecord } from '@/lib/types';

interface CoachingReport {
  overallScore: number;
  summary: string;
  aiCoachingSummary: string;
  threeBiggestStrengths: string[];
  threeBiggestImprovements: string[];
  improvementPlan: string[];
  missedOpportunities: string[];
  objectionsHandling: { objection: string; howHandled: string; handled: boolean }[];
  whatShouldHaveBeenDifferent: string[];
  weightedBreakdown: { categories: { key: string; label: string; score: number; weight: number; grade: string }[]; overallWeighted: number; grade: string } | null;
  followUpText: string;
  followUpEmail: string;
  crmNotes: string;
}

const OUTCOME_LABELS: Record<string, { label: string; cls: string }> = {
  policy_written: { label: 'Policy Written', cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
  follow_up:      { label: 'Follow Up',      cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  not_interested: { label: 'Not Interested', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  no_answer:      { label: 'No Answer',      cls: 'text-slate-400 bg-white/5 border-white/10' },
};

function scoreColor(s: number) {
  return s >= 80 ? '#22c55e' : s >= 60 ? '#D4AF37' : '#ef4444';
}

export default function PastCallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [coaching, setCoaching] = useState<CoachingReport | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'metrics' | 'coaching'>('metrics');
  const [copied, setCopied] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const call = calls.find((c) => c.id === selected);

  async function deleteCall(id: string) {
    setDeleting(id);
    await fetch(`/api/calls/${id}`, { method: 'DELETE' });
    setCalls((prev) => prev.filter((c) => c.id !== id));
    if (selected === id) { setSelected(null); setCoaching(null); }
    setDeleting(null);
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }

  useEffect(() => {
    fetch('/api/calls')
      .then((r) => r.json())
      .then((d) => setCalls((d.calls ?? []).map((c: Omit<CallRecord, 'date'> & { date: string }) => ({ ...c, date: new Date(c.date) }))));
  }, []);

  useEffect(() => {
    if (!selected) { setCoaching(null); return; }
    setCoachingLoading(true);
    setCoaching(null);
    fetch(`/api/calls/${selected}`)
      .then((r) => r.json())
      .then((d) => setCoaching(d))
      .catch(() => {})
      .finally(() => setCoachingLoading(false));
  }, [selected]);

  return (
    <div className="flex h-full gap-5 min-h-0">
      {/* List */}
      <div className={`flex-col space-y-2 overflow-y-auto shrink-0 w-full md:w-80 ${mobileView === 'detail' ? 'hidden md:flex' : 'flex'}`}>
        <div className="mb-1">
          <h2 className="text-lg font-bold text-slate-100">Past Calls</h2>
          <p className="text-xs text-slate-500">{calls.length} calls</p>
        </div>
        {calls.map((c) => {
          const oc = OUTCOME_LABELS[c.outcome];
          return (
            <div key={c.id} className="relative group">
              <button
                onClick={() => { setSelected(c.id); setMobileView('detail'); }}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  selected === c.id
                    ? 'border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.06)]'
                    : 'border-white/6 bg-white/3 hover:bg-white/6'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{c.contactName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {c.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {formatDuration(c.duration)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold" style={{ color: scoreColor(c.score) }}>{c.score}</p>
                    <p className="text-[9px] text-slate-600">score</p>
                  </div>
                </div>
                <span className={`inline-flex mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${oc.cls}`}>
                  {oc.label}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteCall(c.id); }}
                disabled={deleting === c.id}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/20"
                title="Delete call"
              >
                {deleting === c.id
                  ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                  : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                }
              </button>
            </div>
          );
        })}
      </div>

      {/* Detail */}
      <div className={`flex-col flex-1 min-w-0 overflow-y-auto ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        {!call ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/>
              </svg>
            </div>
            <p className="text-slate-400 text-sm">Select a call to view details</p>
          </div>
        ) : (
          <div className="space-y-0">
            {/* Mobile back button */}
            <button
              onClick={() => setMobileView('list')}
              className="md:hidden flex items-center gap-1.5 text-sm text-[#D4AF37] mb-4"
            >
              ← Back to calls
            </button>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-100">{call.contactName}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {call.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {formatDuration(call.duration)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold" style={{ color: scoreColor(call.score) }}>{call.score || '—'}</p>
                <p className="text-xs text-slate-500">Overall Score</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/6 mb-5">
              {(['metrics', 'coaching'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDetailTab(t)}
                  className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    detailTab === t ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]' : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {t === 'metrics' ? 'Call Metrics' : 'AI Coaching'}
                </button>
              ))}
            </div>

            {detailTab === 'metrics' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {/* Metrics */}
                <div className="glass-card rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200">Call Metrics</h3>
                  {[
                    ['Talk / Listen', `${call.metrics.talkPct}% / ${call.metrics.listenPct}%`],
                    ['Sentiment Score', call.metrics.sentimentScore],
                    ['Connection Score', call.metrics.connectionScore],
                    ['Energy Score', call.metrics.energyScore],
                    ['Confidence Score', call.metrics.confidenceScore],
                    ['Buying Signals', call.metrics.buyingSignalCount],
                    ['Objections', call.metrics.objectionCount],
                    ['Call Quality', call.metrics.callQuality + '%'],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{label}</span>
                      <span className="text-xs font-semibold text-slate-200">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Underwriting */}
                <div className="glass-card rounded-2xl p-5 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-200">Underwriting Profile</h3>
                  {[
                    ['Age', call.underwriting.age],
                    ['Gender', call.underwriting.gender],
                    ['Height', call.underwriting.heightFt ? `${call.underwriting.heightFt}'${call.underwriting.heightIn}"` : ''],
                    ['Weight', call.underwriting.weight ? `${call.underwriting.weight} lbs` : ''],
                    ['Tobacco', call.underwriting.tobacco === null ? '?' : call.underwriting.tobacco ? 'Yes' : 'No'],
                    ['Diabetes', call.underwriting.diabetes === null ? '?' : call.underwriting.diabetes ? 'Yes' : 'No'],
                    ['Medications', call.underwriting.currentMedications],
                    ['Hospitalizations', call.underwriting.hospitalizations],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex items-start justify-between gap-2">
                      <span className="text-xs text-slate-500 shrink-0">{label}</span>
                      <span className="text-xs font-medium text-slate-300 text-right">{String(val) || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailTab === 'coaching' && (
              <div className="space-y-4">
                {coachingLoading && (
                  <div className="flex items-center gap-3 p-5">
                    <div className="w-5 h-5 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin shrink-0" />
                    <p className="text-sm text-slate-500">Loading coaching report…</p>
                  </div>
                )}
                {!coachingLoading && coaching && (
                  <>
                    {/* #1 Focus */}
                    {(coaching.threeBiggestImprovements[0] || coaching.whatShouldHaveBeenDifferent[0]) && (
                      <div className="rounded-2xl p-5" style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.3)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] mb-1.5">Focus for Your Next Call</p>
                        <p className="text-sm text-slate-100 leading-relaxed font-medium">
                          {coaching.threeBiggestImprovements[0] || coaching.whatShouldHaveBeenDifferent[0]}
                        </p>
                      </div>
                    )}

                    {/* AI Summary */}
                    {coaching.aiCoachingSummary && (
                      <div className="glass-card rounded-2xl p-5 space-y-2">
                        <h3 className="text-sm font-semibold text-[#D4AF37]">AI Coaching Summary</h3>
                        <p className="text-xs text-slate-300 leading-relaxed">{coaching.aiCoachingSummary}</p>
                      </div>
                    )}

                    {/* Strengths + Improvements */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {coaching.threeBiggestStrengths.length > 0 && (
                        <div className="glass-card rounded-2xl p-5 space-y-3">
                          <h3 className="text-sm font-semibold text-green-400">✓ Three Biggest Strengths</h3>
                          {coaching.threeBiggestStrengths.map((s, i) => (
                            <p key={i} className="text-xs text-slate-300 flex gap-2">
                              <span className="text-green-400 font-bold shrink-0">{i + 1}.</span>{s}
                            </p>
                          ))}
                        </div>
                      )}
                      {coaching.threeBiggestImprovements.length > 0 && (
                        <div className="glass-card rounded-2xl p-5 space-y-3">
                          <h3 className="text-sm font-semibold text-amber-400">⚡ Three Biggest Improvements</h3>
                          {coaching.threeBiggestImprovements.map((s, i) => (
                            <p key={i} className="text-xs text-slate-300 flex gap-2">
                              <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span>{s}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Score Breakdown */}
                    {coaching.weightedBreakdown && (
                      <div className="glass-card rounded-2xl p-5 space-y-3" style={{ border: '1px solid rgba(212,175,55,0.15)' }}>
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-200">Score Breakdown</h3>
                          <span className="text-2xl font-extrabold" style={{ color: scoreColor(coaching.weightedBreakdown.overallWeighted) }}>
                            {coaching.weightedBreakdown.overallWeighted} <span className="text-sm text-slate-400">({coaching.weightedBreakdown.grade})</span>
                          </span>
                        </div>
                        <div className="space-y-2">
                          {coaching.weightedBreakdown.categories.map((cat) => (
                            <div key={cat.key}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs text-slate-400">{cat.label}</span>
                                <span className="text-xs font-bold" style={{ color: scoreColor(cat.score) }}>{cat.score}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${cat.score}%`, background: scoreColor(cat.score) }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Improvement Plan */}
                    {coaching.improvementPlan.length > 0 && (
                      <div className="glass-card rounded-2xl p-5 space-y-3" style={{ border: '1px solid rgba(212,175,55,0.15)' }}>
                        <h3 className="text-sm font-semibold" style={{ color: '#D4AF37' }}>30-Day Improvement Plan</h3>
                        {coaching.improvementPlan.map((item, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 text-[#090d18]"
                              style={{ background: 'linear-gradient(135deg, #D4AF37, #b8940f)' }}>
                              {i + 1}
                            </span>
                            <p className="text-xs text-slate-300 leading-relaxed">{item}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Objections */}
                    {coaching.objectionsHandling.length > 0 && (
                      <div className="glass-card rounded-2xl p-5 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-200">Objections &amp; How Handled</h3>
                        {coaching.objectionsHandling.map((o, i) => (
                          <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/4">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${o.handled ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                              {o.handled ? 'Handled' : 'Unresolved'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs text-slate-200">&quot;{o.objection}&quot;</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{o.howHandled}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Follow-up copy tools */}
                    {(coaching.followUpText || coaching.followUpEmail) && (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {coaching.followUpText && (
                          <div className="glass-card rounded-2xl p-5 space-y-2">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-blue-400">Follow-up Text</h3>
                              <button onClick={() => copyToClipboard(coaching.followUpText, 'text')}
                                className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors">
                                {copied === 'text' ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed bg-white/4 rounded-lg p-3 border border-white/6">{coaching.followUpText}</p>
                          </div>
                        )}
                        {coaching.followUpEmail && (
                          <div className="glass-card rounded-2xl p-5 space-y-2">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-violet-400">Follow-up Email</h3>
                              <button onClick={() => copyToClipboard(coaching.followUpEmail, 'email')}
                                className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors">
                                {copied === 'email' ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-white/4 rounded-lg p-3 border border-white/6">{coaching.followUpEmail}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {!coaching.aiCoachingSummary && coaching.threeBiggestStrengths.length === 0 && (
                      <p className="text-sm text-slate-600 text-center py-8">No AI coaching report available for this call.</p>
                    )}
                  </>
                )}
                {!coachingLoading && !coaching && (
                  <p className="text-sm text-slate-600 text-center py-8">No coaching report available for this call.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
