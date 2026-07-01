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
import { MidCallMemoryPanel } from '@/components/live-call/MidCallMemoryPanel';
import { CallTimeline } from '@/components/live-call/CallTimeline';
import { RadarChart } from '@/components/live-call/RadarChart';
import { useMicrophone } from '@/hooks/useMicrophone';
import { useDeepgramTranscription } from '@/hooks/useDeepgramTranscription';
import { useAICoach } from '@/hooks/useAICoach';
import { useCallAutosave } from '@/hooks/useCallAutosave';
import type { CallMetrics, TimelineEvent, TimelineEventCategory, PostCallReport as PostCallReportType } from '@/lib/types';
import { scoreColor } from '@/lib/score-color';

let timelineEventId = 0;

// ── Pre-flight configuration check ────────────────────────────────────────────

type StatusCheck = { ok: boolean; message: string };
type PreflightResult = { ok: boolean; checks: Record<string, StatusCheck> } | null;

function PreflightPanel({ result, onDismiss }: { result: PreflightResult; onDismiss: () => void }) {
  if (!result || result.ok) return null;
  const failed = Object.entries(result.checks).filter(([, v]) => !v.ok);
  return (
    <div className="mx-4 mt-3 rounded-2xl border border-red-500/25 bg-red-500/8 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-red-400">Live Call cannot start — configuration required</p>
        <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 text-xs">Dismiss</button>
      </div>
      {failed.map(([key, check]) => (
        <div key={key} className="flex gap-2.5 text-xs">
          <span className="text-red-400 shrink-0 mt-0.5">✗</span>
          <div className="space-y-0.5">
            <p className="font-semibold text-red-300">{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
            <p className="text-slate-400 leading-relaxed">{check.message}</p>
          </div>
        </div>
      ))}
      <p className="text-[10px] text-slate-500 pt-1 border-t border-white/6">
        After fixing these, restart the dev server or redeploy on Vercel, then refresh this page.
      </p>
    </div>
  );
}

export default function LiveCallPage() {
  const mic = useMicrophone();
  const {
    transcript, partial, connectionState, transcriptionMode, isListening, error,
    startListening, stopListening, clearTranscript, correctSpeaker,
  } = useDeepgramTranscription(mic);
  const { insight, stage, underwriting, carriers, checklist, isAnalyzing, scheduleAnalysis, memory } = useAICoach(transcript);

  const [duration, setDuration] = useState(0);
  const [showPostCall, setShowPostCall] = useState(false);
  const [postCallReport, setPostCallReport] = useState<PostCallReportType | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [rightTab, setRightTab] = useState<'stage' | 'uw' | 'reminders' | 'memory'>('stage');
  const [objectionCount, setObjectionCount] = useState(0);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [momentum, setMomentum] = useState(0);
  const [preflight, setPreflight] = useState<PreflightResult>(null);
  const [showPreflight, setShowPreflight] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef = useRef<number>(0);
  const seenObjectionsRef = useRef<Set<string>>(new Set());
  const seenSignalCategoriesRef = useRef<Set<string>>(new Set());
  const seenStagesRef = useRef<Set<string>>(new Set());
  const readyForAppFiredRef = useRef(false);
  const closeOpportunityHistoryRef = useRef<{ value: number; atMs: number }[]>([]);

  // Pre-flight check: verify all requirements before the user clicks Start Call
  // so failures surface with exact, actionable messages rather than mid-call.
  useEffect(() => {
    fetch('/api/live-call-status')
      .then((r) => r.json())
      .then((data: PreflightResult) => setPreflight(data))
      .catch(() => {
        setPreflight({
          ok: false,
          checks: {
            server: {
              ok: false,
              message: 'Could not reach /api/live-call-status. The server may not be running, or you are not authenticated.',
            },
          },
        });
      });
  }, []);

  // Momentum: real rate-of-change of closeOpportunityPct over the last ~15s
  // of analysis history — never a fabricated value.
  useEffect(() => {
    const now = Date.now();
    const history = closeOpportunityHistoryRef.current;
    history.push({ value: insight.closeOpportunityPct, atMs: now });
    while (history.length > 0 && now - history[0].atMs > 15000) history.shift();
    if (history.length >= 2) {
      setMomentum(history[history.length - 1].value - history[0].value);
    }
  }, [insight.closeOpportunityPct]);

  const pushTimelineEvent = useCallback((category: TimelineEventCategory, label: string) => {
    setTimeline((prev) => [
      ...prev,
      {
        id: `tl-${++timelineEventId}`,
        timestampSec: Math.floor((Date.now() - callStartRef.current) / 1000),
        category,
        label,
        transcriptLineId: transcript[transcript.length - 1]?.id ?? null,
      },
    ]);
  }, [transcript]);

  // Run AI analysis whenever transcript updates
  useEffect(() => {
    if (transcript.length > 0) scheduleAnalysis(transcript);
  }, [transcript, scheduleAnalysis]);

  // Track distinct objections as they're actually detected (real count, not a timer increment).
  useEffect(() => {
    if (insight.detectedObjection && insight.objectType === 'objection') {
      if (!seenObjectionsRef.current.has(insight.detectedObjection)) {
        seenObjectionsRef.current.add(insight.detectedObjection);
        setObjectionCount(seenObjectionsRef.current.size);
        pushTimelineEvent('objection', insight.objectionAnalysis
          ? `Objection: ${insight.objectionAnalysis.type.replace(/_/g, ' ')}`
          : `Objection detected`);
      }
    }
  }, [insight, pushTimelineEvent]);

  // Timeline: first buying signal per category.
  useEffect(() => {
    for (const sig of insight.buyingSignalDetails) {
      if (!seenSignalCategoriesRef.current.has(sig.category)) {
        seenSignalCategoriesRef.current.add(sig.category);
        pushTimelineEvent('buying_signal', `Buying signal: ${sig.category.replace(/_/g, ' ')}`);
      }
    }
  }, [insight.buyingSignalDetails, pushTimelineEvent]);

  // Timeline: call stage transitions.
  useEffect(() => {
    if (!seenStagesRef.current.has(stage)) {
      seenStagesRef.current.add(stage);
      const stageCategory: TimelineEventCategory =
        stage === 'introduction' ? 'greeting'
        : stage === 'permission' ? 'rapport'
        : stage === 'discovery' || stage === 'existing_coverage' ? 'discovery'
        : stage === 'health' ? 'health_qualification'
        : stage === 'budget' || stage === 'presentation' ? 'price_discussion'
        : stage === 'close' ? 'close'
        : 'discovery';
      pushTimelineEvent(stageCategory, stage.replace(/_/g, ' '));
    }
  }, [stage, pushTimelineEvent]);

  // Timeline: application-ready moment.
  useEffect(() => {
    if (insight.nextBestAction?.readyForApplication && !readyForAppFiredRef.current) {
      readyForAppFiredRef.current = true;
      pushTimelineEvent('application_attempt', 'Ready to ask for the application');
    }
  }, [insight.nextBestAction, pushTimelineEvent]);

  // Real metrics — every value here is derived from an actual signal
  // (transcript content/timing, live mic level, connection/health state),
  // never simulated.
  const metrics: CallMetrics = useMemo(() => {
    const agentWords = transcript.filter((l) => l.speaker === 'agent').reduce((s, l) => s + l.text.split(/\s+/).length, 0);
    const prospectWords = transcript.filter((l) => l.speaker === 'prospect').reduce((s, l) => s + l.text.split(/\s+/).length, 0);
    const totalWords = agentWords + prospectWords;
    const talkPct = totalWords > 0 ? Math.round((agentWords / totalWords) * 100) : 0;

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

  // Phase 3 Part 8: autosave — periodic snapshot of everything to Supabase
  // while the call is live, so a closed browser loses at most a few seconds.
  const getAutosavePayload = useCallback(() => ({
    transcript,
    underwriting,
    metrics,
    durationSeconds: duration,
    liveState: { insight, memory, timeline, stage },
  }), [transcript, underwriting, metrics, duration, insight, memory, timeline, stage]);

  const autosave = useCallAutosave(getAutosavePayload);

  const startCall = useCallback(async () => {
    clearTranscript();
    setDuration(0);
    setPostCallReport(null);
    setShowPostCall(false);
    seenObjectionsRef.current = new Set();
    seenSignalCategoriesRef.current = new Set();
    seenStagesRef.current = new Set();
    readyForAppFiredRef.current = false;
    closeOpportunityHistoryRef.current = [];
    setObjectionCount(0);
    setTimeline([]);
    setMomentum(0);

    const stream = await mic.start();
    if (!stream) return; // mic.error already surfaces a real error to the UI

    await startListening();
    await autosave.startCall();

    callStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
    timelineEventId = 0;
    setTimeline([{ id: 'tl-greeting', timestampSec: 0, category: 'greeting', label: 'Call started', transcriptLineId: null }]);
  }, [mic, startListening, clearTranscript, autosave]);

  const endCall = useCallback(async () => {
    stopListening();
    mic.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    autosave.stopCall();

    if (transcript.length > 0) {
      setLoadingReport(true);
      setShowPostCall(true);
      try {
        const text = transcript.map((l) => `${l.speaker.toUpperCase()}: ${l.text}`).join('\n');
        const res = await fetch('/api/post-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: text,
            transcriptLines: transcript,
            duration,
            metrics,
            callId: autosave.callId,
            timeline,
          }),
        });
        if (res.ok) setPostCallReport(await res.json());
      } catch {
        // keep null
      } finally {
        setLoadingReport(false);
      }
    }
  }, [stopListening, mic, transcript, duration, metrics, autosave, timeline]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const talkPct = Math.round(metrics.talkPct);
  const listenPct = 100 - talkPct;

  if (showPostCall) {
    return <PostCallReportView report={postCallReport} transcript={transcript} loading={loadingReport} onClose={() => setShowPostCall(false)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mic controls bar */}
      <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-white/6 shrink-0">
        <MicrophoneControls mic={mic} connectionState={connectionState} transcriptionMode={transcriptionMode} />
        {autosave.callId && (
          <span className="text-[10px] text-slate-600 shrink-0">
            {autosave.lastSavedAt ? `Autosaved ${autosave.lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Autosave starting…'}
          </span>
        )}
      </div>

      {/* Pre-flight configuration errors — shown before call starts */}
      {showPreflight && preflight && !preflight.ok && !isListening && (
        <div className="shrink-0 overflow-y-auto max-h-60">
          <PreflightPanel result={preflight} onDismiss={() => setShowPreflight(false)} />
        </div>
      )}

      {/* Session / connection error — shown during or after call attempt */}
      {error && connectionState !== 'idle' && (
        <div className="shrink-0 mx-4 my-2 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-xs space-y-1">
          <div className="flex items-center gap-2 text-red-400 font-semibold">
            <span>✗</span>
            <span>Connection failed — real error (no fallback or demo mode)</span>
          </div>
          <p className="text-slate-400 leading-relaxed">{error}</p>
          <p className="text-slate-600">
            Check <a href="/api/live-call-status" target="_blank" className="text-[#D4AF37] underline">/api/live-call-status</a> for a full diagnostic, or see the browser console for details.
          </p>
        </div>
      )}

      {/* Main 3-column workspace */}
      <div className="flex flex-1 min-h-0 divide-x divide-white/6">

        {/* LEFT — Transcript (35%) */}
        <div className="flex flex-col w-[35%] min-w-0">
          <LiveTranscript lines={transcript} partial={partial} isListening={isListening} onCorrectSpeaker={correctSpeaker} />
        </div>

        {/* CENTER — AI Coach (32%) */}
        <div className="flex flex-col w-[32%] min-w-0 overflow-y-auto">
          <AICoachPanel insight={insight} isAnalyzing={isAnalyzing} />
        </div>

        {/* RIGHT — Stage / Metrics / Underwriting / Memory (33%) */}
        <div className="flex flex-col w-[33%] min-w-0">
          {/* Tab bar */}
          <div className="flex border-b border-white/6 shrink-0">
            {(['stage', 'uw', 'reminders', 'memory'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  rightTab === tab
                    ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                {tab === 'stage' ? 'Call Stage' : tab === 'uw' ? 'Underwriting' : tab === 'reminders' ? 'Checklist' : 'Memory'}
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
                  momentumScore={Math.round(momentum)}
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
            {rightTab === 'memory' && (
              <div className="p-3 space-y-3">
                <MidCallMemoryPanel memory={memory} />
                <div className="glass-card rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Call Timeline</p>
                  <CallTimeline events={timeline} />
                </div>
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

function PostCallReportView({ report, transcript, loading, onClose }: {
  report: PostCallReportType | null;
  transcript: { id: string; speaker: string; text: string }[];
  loading: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<'report' | 'timeline' | 'transcript'>('report');
  const [search, setSearch] = useState('');

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

  const overallColor = scoreColor(report.overallScore);
  const highlightTerms = [
    ...report.objections,
    ...report.buyingSignals,
  ].filter(Boolean);

  const filteredTranscript = search
    ? transcript.filter((l) => l.text.toLowerCase().includes(search.toLowerCase()))
    : transcript;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/6 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Post-Call Report</h2>
          <p className="text-sm text-slate-500 mt-1">{report.summary}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-3xl font-extrabold" style={{ color: overallColor }}>{report.overallScore}</p>
            <p className="text-[10px] text-slate-500">Overall · Grade {report.overallGrade}</p>
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/8 text-slate-300 text-sm hover:bg-white/12 transition-colors">
            ← New Call
          </button>
        </div>
      </div>

      <div className="flex border-b border-white/6 px-6 shrink-0">
        {(['report', 'timeline', 'transcript'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              view === v ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {v === 'report' ? 'Report' : v === 'timeline' ? 'Timeline' : 'Transcript'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {view === 'report' && (
          <div className="space-y-6">
            {/* Score summary row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ['Rapport', report.rapportScore], ['Discovery', report.discoveryScore],
                ['Trust', report.trustScore], ['Closing', report.closingScore],
              ].map(([label, val]) => (
                <div key={label as string} className="glass-card rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold" style={{ color: scoreColor(val as number) }}>{val}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{label} Score</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Quality Radar */}
              <div className="glass-card rounded-2xl p-5 flex flex-col items-center xl:col-span-1">
                <h3 className="text-sm font-semibold text-slate-200 self-start mb-2">AI Quality Score</h3>
                <RadarChart scores={report.qualityScores} size={260} />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full mt-2 text-[10px] text-slate-500">
                  <p>Talk/Listen: <span className="text-slate-300 font-medium">{report.talkPct}% / {report.listenPct}%</span></p>
                  <p>Questions Asked: <span className="text-slate-300 font-medium">{report.questionsAskedCount}</span></p>
                </div>
              </div>

              {/* Strengths/Improvements */}
              <div className="space-y-4 xl:col-span-1">
                <div className="glass-card rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-green-400">✓ Three Biggest Strengths</h3>
                  {report.threeBiggestStrengths.map((s, i) => (
                    <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-green-400 font-bold">{i + 1}.</span>{s}</p>
                  ))}
                </div>
                <div className="glass-card rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-amber-400">⚡ Three Biggest Improvements</h3>
                  {report.threeBiggestImprovements.map((s, i) => (
                    <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-amber-400 font-bold">{i + 1}.</span>{s}</p>
                  ))}
                </div>
              </div>

              {/* AI Coaching Summary */}
              <div className="space-y-4 xl:col-span-1">
                <div className="glass-card rounded-2xl p-5 space-y-2" style={{ border: '1px solid rgba(212,175,55,0.25)' }}>
                  <h3 className="text-sm font-semibold text-[#D4AF37]">🤖 AI Coaching Summary</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{report.aiCoachingSummary}</p>
                </div>
                <div className="glass-card rounded-2xl p-5 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-300">📁 CRM Notes</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{report.crmNotes}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">Most Effective Moments</h3>
                {report.mostEffectiveMoments.map((m, i) => (
                  <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-green-400">•</span>{m}</p>
                ))}
              </div>
              <div className="glass-card rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">Weakest Moments</h3>
                {report.weakestMoments.map((m, i) => (
                  <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-red-400">•</span>{m}</p>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">Objections Encountered &amp; How Handled</h3>
              {report.objectionsHandling.map((o, i) => (
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
              {report.objectionsHandling.length === 0 && <p className="text-xs text-slate-600">No objections encountered.</p>}
            </div>

            <div className="glass-card rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#D4AF37]">What Should Have Happened Differently</h3>
              {report.whatShouldHaveBeenDifferent.map((s, i) => (
                <p key={i} className="text-xs text-slate-300 flex gap-2">
                  <span className="text-[#D4AF37] font-bold shrink-0">{i + 1}.</span>{s}
                </p>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-semibold text-blue-400">📱 Follow-up Text</h3>
                <p className="text-xs text-slate-300 leading-relaxed bg-white/4 rounded-lg p-3 border border-white/6">{report.followUpText}</p>
              </div>
              <div className="glass-card rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-semibold text-violet-400">✉️ Follow-up Email</h3>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-white/4 rounded-lg p-3 border border-white/6">{report.followUpEmail}</p>
              </div>
            </div>
          </div>
        )}

        {view === 'timeline' && (
          <div className="glass-card rounded-2xl p-5 max-w-2xl">
            <CallTimeline events={report.timeline} />
          </div>
        )}

        {view === 'transcript' && (
          <div className="max-w-3xl space-y-3">
            <input
              placeholder="Search transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-72 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
            />
            <div className="space-y-2">
              {filteredTranscript.map((line) => (
                <div key={line.id} className={`p-3 rounded-xl text-sm ${line.speaker === 'agent' ? 'bg-[rgba(212,175,55,0.06)] border border-[rgba(212,175,55,0.12)]' : 'bg-blue-500/8 border border-blue-500/12'}`}>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase mr-2">{line.speaker}</span>
                  <HighlightedText text={line.text} terms={highlightTerms} />
                </div>
              ))}
              {filteredTranscript.length === 0 && <p className="text-sm text-slate-600 text-center py-8">No matching lines</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <span className="text-slate-200">{text}</span>;
  // Highlight any term whose words substantially overlap this line (real
  // detected objections/signals only — never an invented pattern).
  const matches = terms.some((t) => {
    const key = t.toLowerCase().replace(/^['"]|['"]$/g, '');
    return key.length > 4 && text.toLowerCase().includes(key.slice(0, Math.min(key.length, 30)));
  });
  return (
    <span className={matches ? 'text-slate-100 bg-[rgba(212,175,55,0.15)] px-0.5 rounded' : 'text-slate-200'}>
      {text}
    </span>
  );
}
