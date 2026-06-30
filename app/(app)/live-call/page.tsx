'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { LiveTranscript } from '@/components/live-call/LiveTranscript';
import { AICoachPanel } from '@/components/live-call/AICoachPanel';
import { CallStagePanel } from '@/components/live-call/CallStagePanel';
import { MetricsPanel } from '@/components/live-call/MetricsPanel';
import { UnderwritingPanel } from '@/components/live-call/UnderwritingPanel';
import { LiveReminders } from '@/components/live-call/LiveReminders';
import { QuickObjectionBar } from '@/components/live-call/QuickObjectionBar';
import { CallMetricsBar } from '@/components/live-call/CallMetricsBar';
import { MicrophoneControls } from '@/components/live-call/MicrophoneControls';
import { useMicrophone } from '@/hooks/useMicrophone';
import { useRealtimeTranscription } from '@/hooks/useRealtimeTranscription';
import { useAICoach } from '@/hooks/useAICoach';
import type { CallMetrics } from '@/lib/types';
import { scoreColor } from '@/lib/score-color';

export default function LiveCallPage() {
  const mic = useMicrophone();
  const {
    transcript, connectionState, isListening, error,
    startListening, stopListening, clearTranscript, correctSpeaker,
  } = useRealtimeTranscription(mic);
  const { insight, stage, underwriting, carriers, checklist, isAnalyzing, scheduleAnalysis } = useAICoach(transcript);

  const [duration, setDuration] = useState(0);
  const [showPostCall, setShowPostCall] = useState(false);
  const [postCallReport, setPostCallReport] = useState<Record<string, unknown> | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [rightTab, setRightTab] = useState<'stage' | 'uw' | 'reminders'>('stage');
  const [objectionCount, setObjectionCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef = useRef<number>(0);
  const seenObjectionsRef = useRef<Set<string>>(new Set());

  // Run AI analysis whenever transcript updates
  useEffect(() => {
    if (transcript.length > 0) scheduleAnalysis(transcript);
  }, [transcript, scheduleAnalysis]);

  // Track distinct objections as they're actually detected (real count, not a timer increment).
  // The ref is mutated only here, inside an effect — never during render.
  useEffect(() => {
    if (insight.detectedObjection && insight.objectType === 'objection') {
      seenObjectionsRef.current.add(insight.detectedObjection);
      setObjectionCount(seenObjectionsRef.current.size);
    }
  }, [insight]);

  // Real metrics — every value here is derived from an actual signal
  // (transcript content/timing, live mic level, connection/health state),
  // never simulated.
  const metrics: CallMetrics = useMemo(() => {
    const agentWords = transcript.filter((l) => l.speaker === 'agent').reduce((s, l) => s + l.text.split(/\s+/).length, 0);
    const prospectWords = transcript.filter((l) => l.speaker === 'prospect').reduce((s, l) => s + l.text.split(/\s+/).length, 0);
    const totalWords = agentWords + prospectWords;
    const talkPct = totalWords > 0 ? Math.round((agentWords / totalWords) * 100) : 0;

    // Response time: gap between a prospect line ending and the agent's next line starting.
    const responseTimes: number[] = [];
    for (let i = 1; i < transcript.length; i++) {
      if (transcript[i].speaker === 'agent' && transcript[i - 1].speaker === 'prospect') {
        const gapSec = (transcript[i].timestamp.getTime() - transcript[i - 1].timestamp.getTime()) / 1000;
        if (gapSec > 0 && gapSec < 30) responseTimes.push(gapSec);
      }
    }
    const avgResponseTime = responseTimes.length
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const confidenceSamples = transcript.map((l) => l.speakerConfidence).filter((c): c is number => c != null);
    const confidenceScore = confidenceSamples.length
      ? Math.round(confidenceSamples.reduce((a, b) => a + b, 0) / confidenceSamples.length)
      : 0;

    const connectionScore = connectionState === 'connected' && mic.health === 'healthy' ? 100
      : connectionState === 'reconnecting' || mic.health === 'silent' ? 45
      : connectionState === 'failed' || mic.health === 'disconnected' || mic.health === 'error' ? 10
      : 60;

    const energyScore = Math.round(Math.min(1, mic.level * 6) * 100);

    return {
      duration,
      talkPct,
      listenPct: 100 - talkPct,
      sentimentScore: insight.closeOpportunityPct,
      connectionScore,
      energyScore,
      confidenceScore,
      avgResponseTime: Math.round(avgResponseTime * 10) / 10,
      buyingSignalCount: insight.buyingSignals.length,
      objectionCount,
      callQuality: Math.round((connectionScore + confidenceScore + insight.closeOpportunityPct) / 3),
    };
  }, [transcript, duration, connectionState, mic.health, mic.level, insight, objectionCount]);

  const startCall = useCallback(async () => {
    clearTranscript();
    setDuration(0);
    setPostCallReport(null);
    setShowPostCall(false);
    seenObjectionsRef.current = new Set();
    setObjectionCount(0);

    const stream = await mic.start();
    if (!stream) return; // mic.error already surfaces a real error to the UI

    await startListening();

    callStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
  }, [mic, startListening, clearTranscript]);

  const endCall = useCallback(async () => {
    stopListening();
    mic.stop();
    if (timerRef.current) clearInterval(timerRef.current);

    if (transcript.length > 0) {
      setLoadingReport(true);
      setShowPostCall(true);
      try {
        const text = transcript.map((l) => `${l.speaker.toUpperCase()}: ${l.text}`).join('\n');
        const res = await fetch('/api/post-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: text, duration, metrics }),
        });
        if (res.ok) setPostCallReport(await res.json());
      } catch {
        // keep null
      } finally {
        setLoadingReport(false);
      }
    }
  }, [stopListening, mic, transcript, duration, metrics]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const talkPct = Math.round(metrics.talkPct);
  const listenPct = 100 - talkPct;

  if (showPostCall) {
    return <PostCallReport report={postCallReport} loading={loadingReport} onClose={() => setShowPostCall(false)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mic controls bar */}
      <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-white/6 shrink-0">
        <MicrophoneControls mic={mic} connectionState={connectionState} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400 shrink-0">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main 3-column workspace */}
      <div className="flex flex-1 min-h-0 divide-x divide-white/6">

        {/* LEFT — Transcript (35%) */}
        <div className="flex flex-col w-[35%] min-w-0">
          <LiveTranscript lines={transcript} isListening={isListening} onCorrectSpeaker={correctSpeaker} />
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
        onEndCall={endCall}
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
