'use client';

import { useState, useEffect } from 'react';
import { formatDuration } from '@/lib/mock-calls';
import type { CallRecord } from '@/lib/types';

const OUTCOME_LABELS: Record<string, { label: string; cls: string }> = {
  policy_written: { label: 'Policy Written', cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
  follow_up:      { label: 'Follow Up',      cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  not_interested: { label: 'Not Interested', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  no_answer:      { label: 'No Answer',      cls: 'text-slate-400 bg-white/5 border-white/10' },
};

export default function PastCallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const call = calls.find((c) => c.id === selected);

  useEffect(() => {
    fetch('/api/calls')
      .then((r) => r.json())
      .then((d) => setCalls((d.calls ?? []).map((c: Omit<CallRecord, 'date'> & { date: string }) => ({ ...c, date: new Date(c.date) }))));
  }, []);

  function scoreColor(s: number) {
    return s >= 80 ? '#22c55e' : s >= 60 ? '#D4AF37' : '#ef4444';
  }

  return (
    <div className="flex h-full gap-5 min-h-0">
      {/* List */}
      <div className="flex flex-col w-96 shrink-0 space-y-2 overflow-y-auto">
        <div className="mb-1">
          <h2 className="text-lg font-bold text-slate-100">Past Calls</h2>
          <p className="text-xs text-slate-500">{calls.length} calls</p>
        </div>
        {calls.map((c) => {
          const oc = OUTCOME_LABELS[c.outcome];
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
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
          );
        })}
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!call ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12"/>
              </svg>
            </div>
            <p className="text-slate-400 text-sm">Select a call to view details</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">{call.contactName}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {call.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {formatDuration(call.duration)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold" style={{ color: scoreColor(call.score) }}>{call.score}</p>
                <p className="text-xs text-slate-500">Overall Score</p>
              </div>
            </div>

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
          </div>
        )}
      </div>
    </div>
  );
}
