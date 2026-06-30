'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { LiveTranscript } from '@/components/live-call/LiveTranscript';
import { AICoachPanel } from '@/components/live-call/AICoachPanel';
import { CallStagePanel } from '@/components/live-call/CallStagePanel';
import { MetricsPanel } from '@/components/live-call/MetricsPanel';
import { UnderwritingPanel } from '@/components/live-call/UnderwritingPanel';
import { LiveReminders } from '@/components/live-call/LiveReminders';
import { QuickObjectionBar } from '@/components/live-call/QuickObjectionBar';
import { CallMetricsBar } from '@/components/live-call/CallMetricsBar';
import { useRealtimeTranscription } from '@/hooks/useRealtimeTranscription';
import { useAICoach } from '@/hooks/useAICoach';
import type { CallMetrics } from '@/lib/types';
import { scoreColor } from '@/lib/score-color';

export default function LiveCallPage() {
  const { transcript, isListening, error, startListening, stopListening, clearTranscript } = useRealtimeTranscription();
  const { insight, stage, underwriting, carriers, checklist, isAnalyzing, scheduleAnalysis } = useAICoach(transcript);

  const [duration, setDuration] = useState(0);
  const [metrics, setMetrics] = useState<CallMetrics>({
    duration: 0, talkPct: 38, listenPct: 62,
    sentimentScore: 0, connectionScore: 0, energyScore: 0, confidenceScore: 0,
    avgResponseTime: 0, buyingSignalCount: 0, objectionCount: 0, callQuality: 0,
  });
  const [showPostCall, setShowPostCall] = useState(false);
  const [postCallReport, setPostCallReport] = useState<Record<string, unknown> | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [rightTab, setRightTab] = useState<'stage' | 'uw' | 'reminders'>('stage');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const metricsRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Run AI analysis whenever transcript updates
  useEffect(() => {
    if (transcript.length > 0) scheduleAnalysis(transcript);
  }, [transcript, scheduleAnalysis]);

  // Update derived metrics from insight
  useEffect(() => {
    setMetrics((prev) => ({
      ...prev,
      buyingSignalCount: insight.buyingSignals.length,
      callQuality: Math.max(prev.callQuality, insight.closeOpportunityPct > 50 ? 75 : 55),
    }));
  }, [insight]);

  const startCall = useCallback(async () => {
    clearTranscript();
    setDuration(0);
    setPostCallReport(null);
    setShowPostCall(false);
    setMetrics({
      duration: 0, talkPct: 38, listenPct: 62,
      sentimentScore: 60, connectionScore: 55, energyScore: 65, confidenceScore: 70,
      avgResponseTime: 2.5, buyingSignalCount: 0, objectionCount: 0, callQuality: 60,
    });

    await startListening();

    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    // Simulate slowly evolving metrics
    metricsRef.current = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        duration: prev.duration + 3,
        talkPct: clamp(prev.talkPct + (Math.random() - 0.55) * 2, 25, 65),
        listenPct: 100 - clamp(prev.talkPct + (Math.random() - 0.55) * 2, 25, 65),
        sentimentScore: clamp(prev.sentimentScore + (Math.random() - 0.4) * 3, 20, 100),
        connectionScore: clamp(prev.connectionScore + (Math.random() - 0.35) * 2, 20, 100),
        energyScore: clamp(prev.energyScore + (Math.random() - 0.5) * 2, 30, 100),
        confidenceScore: clamp(prev.confidenceScore + (Math.random() - 0.4) * 2, 30, 100),
        avgResponseTime: Math.max(1, prev.avgResponseTime + (Math.random() - 0.5) * 0.2),
        objectionCount: prev.objectionCount,
      }));
    }, 3000);
  }, [startListening, clearTranscript]);

  const endCall = useCallback(async () => {
    stopListening();
    if (timerRef.current) clearInterval(timerRef.current);
    if (metricsRef.current) clearInterval(metricsRef.current);

    if (transcript.length > 0) {
      setLoadingReport(true);
      setShowPostCall(true);
      try {
        const text = transcript.map((l) => `${l.speaker.toUpperCase()}: ${l.text}`).join('\n');
        const res = await fetch('/api/post-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: text }),
        });
        if (res.ok) setPostCallReport(await res.json());
      } catch {
        // keep null
      } finally {
        setLoadingReport(false);
      }
    }
  }, [stopListening, transcript]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (metricsRef.current) clearInterval(metricsRef.current);
  }, []);

  const talkPct = Math.round(metrics.talkPct);
  const listenPct = 100 - talkPct;

  if (showPostCall) {
    return <PostCallReport report={postCallReport} loading={loadingReport} onClose={() => setShowPostCall(false)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400 shrink-0">
          <span>⚠️</span>
          <span>{error} — Running in demo mode with simulated transcript.</span>
        </div>
      )}

      {/* Main 3-column workspace */}
      <div className="flex flex-1 min-h-0 divide-x divide-white/6">

        {/* LEFT — Transcript (35%) */}
        <div className="flex flex-col w-[35%] min-w-0">
          <LiveTranscript lines={transcript} isListening={isListening} />
        </div>

        {/* CENTER — AI Coach (32%) */}
        <div className="flex flex-col w-[32%] min-w-0 overflow-y-auto">
          <AICoachPanel insight={insight} isAnalyzing={isAnalyzing} />
        </div>

        {/* RIGHT — Stage / Metrics / Underwriting (33%) */}
        <div className="flex flex-col w-[33%] min-w-0">
          {/* Tab bar */}
          <div className="flex border-b border-white/6 shrink-0">
            {(['stage', 'uw', 'reminders'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  rightTab === tab
                    ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                {tab === 'stage' ? 'Call Stage' : tab === 'uw' ? 'Underwriting' : 'Checklist'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === 'stage' && (
              <div className="flex flex-col h-full divide-y divide-white/6">
                <div className="flex-shrink-0" style={{ minHeight: 0 }}>
                  <CallStagePanel currentStage={stage} />
                </div>
                <MetricsPanel
                  talkPct={talkPct}
                  listenPct={listenPct}
                  sentimentScore={Math.round(metrics.sentimentScore)}
                  connectionScore={Math.round(metrics.connectionScore)}
                  energyScore={Math.round(metrics.energyScore)}
                  confidenceScore={Math.round(metrics.confidenceScore)}
                />
              </div>
            )}
            {rightTab === 'uw' && (
              <UnderwritingPanel profile={underwriting} carriers={carriers} />
            )}
            {rightTab === 'reminders' && (
              <div className="p-3">
                <LiveReminders items={checklist} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Objection Bar */}
      <QuickObjectionBar />

      {/* Bottom Metrics Bar */}
      <CallMetricsBar
        duration={duration}
        buyingSignalCount={metrics.buyingSignalCount}
        objectionCount={metrics.objectionCount}
        callQuality={Math.round(metrics.callQuality)}
        avgResponseTime={metrics.avgResponseTime}
        isLive={isListening}
        onStartCall={startCall}
      />
    </div>
  );
}

// ── Post-Call Report ──────────────────────────────────────────────────────────

function PostCallReport({ report, loading, onClose }: {
  report: Record<string, unknown> | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
        <p className="text-slate-400 text-sm">Generating call report…</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-slate-400">No report available.</p>
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/8 text-slate-300 text-sm hover:bg-white/12 transition-colors">
          Back to Call
        </button>
      </div>
    );
  }

  const scores = report.scores as Record<string, number> | undefined;
  const overall = report.overallScore as number ?? 0;
  const overallColor = scoreColor(overall);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Post-Call Report</h2>
          <p className="text-sm text-slate-500 mt-1">{report.summary as string}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-3xl font-extrabold" style={{ color: overallColor }}>{overall}</p>
            <p className="text-[10px] text-slate-500">Overall Score</p>
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/8 text-slate-300 text-sm hover:bg-white/12 transition-colors">
            ← New Call
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Scores */}
        {scores && (
          <div className="glass-card rounded-2xl p-5 space-y-3 xl:col-span-1">
            <h3 className="text-sm font-semibold text-slate-200">Call Scores</h3>
            {Object.entries(scores).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="font-bold text-slate-300">{v}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${v}%`, background: scoreColor(v) }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Strengths & Opportunities */}
        <div className="space-y-4 xl:col-span-1">
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-green-400">✓ Strengths</h3>
            {(report.strengths as string[])?.map((s, i) => (
              <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-green-400">•</span>{s}</p>
            ))}
          </div>
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-amber-400">⚡ Missed Opportunities</h3>
            {(report.missedOpportunities as string[])?.map((s, i) => (
              <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-amber-400">•</span>{s}</p>
            ))}
          </div>
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#D4AF37]">🎯 Improvement Plan</h3>
            {(report.improvementPlan as string[])?.map((s, i) => (
              <p key={i} className="text-xs text-slate-300 flex gap-2">
                <span className="text-[#D4AF37] font-bold shrink-0">{i+1}.</span>{s}
              </p>
            ))}
          </div>
        </div>

        {/* Follow-ups */}
        <div className="space-y-4 xl:col-span-1">
          <div className="glass-card rounded-2xl p-5 space-y-2">
            <h3 className="text-sm font-semibold text-blue-400">📱 Follow-up Text</h3>
            <p className="text-xs text-slate-300 leading-relaxed bg-white/4 rounded-lg p-3 border border-white/6">
              {report.followUpText as string}
            </p>
          </div>
          <div className="glass-card rounded-2xl p-5 space-y-2">
            <h3 className="text-sm font-semibold text-violet-400">✉️ Follow-up Email</h3>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-white/4 rounded-lg p-3 border border-white/6">
              {report.followUpEmail as string}
            </p>
          </div>
          <div className="glass-card rounded-2xl p-5 space-y-2">
            <h3 className="text-sm font-semibold text-slate-300">📁 CRM Notes</h3>
            <p className="text-xs text-slate-400 leading-relaxed bg-white/4 rounded-lg p-3 border border-white/6">
              {report.crmNotes as string}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
