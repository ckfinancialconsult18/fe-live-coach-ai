'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { LiveTranscript } from '@/components/live-call/LiveTranscript';
import { AICoachPanel } from '@/components/live-call/AICoachPanel';
import { CallStagePanel } from '@/components/live-call/CallStagePanel';
import { MetricsPanel } from '@/components/live-call/MetricsPanel';
import { UnderwritingPanel } from '@/components/live-call/UnderwritingPanel';
import { QuickObjectionBar } from '@/components/live-call/QuickObjectionBar';
import { CallMetricsBar } from '@/components/live-call/CallMetricsBar';
import { MicrophoneControls } from '@/components/live-call/MicrophoneControls';
import { MidCallMemoryPanel } from '@/components/live-call/MidCallMemoryPanel';
import { LiveSalesScorePanel } from '@/components/live-call/LiveSalesScorePanel';
import { MissedOpportunityPanel } from '@/components/live-call/MissedOpportunityPanel';
import { LiveObjectionPanel } from '@/components/live-call/LiveObjectionPanel';
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
    silenceWarning, audioWarning,
  } = useDeepgramTranscription(mic);
  const { insight, stage, underwriting, carriers, checklist, isAnalyzing, scheduleAnalysis, memory, liveScores, missedOpportunities, liveObjectionState } = useAICoach(transcript);

  const [duration, setDuration] = useState(0);
  const [showPostCall, setShowPostCall] = useState(false);
  const [postCallReport, setPostCallReport] = useState<PostCallReportType | null>(null);
  const [postCallError, setPostCallError] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [rightTab, setRightTab] = useState<'stage' | 'uw' | 'discovery' | 'memory' | 'score' | 'coach'>('stage');
  const [objectionCount, setObjectionCount] = useState(0);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [momentum, setMomentum] = useState(0);
  const [preflight, setPreflight] = useState<PreflightResult>(null);
  const [showPreflight, setShowPreflight] = useState(true);
  const [callStartMs, setCallStartMs] = useState(0);

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

  // Auto-switch to 'coach' tab when a new critical/high objection is first detected.
  const prevPrimaryTypeRef = useRef<string | null>(null);
  useEffect(() => {
    const currentType = liveObjectionState.primary?.type ?? null;
    if (currentType && currentType !== prevPrimaryTypeRef.current) {
      prevPrimaryTypeRef.current = currentType;
      const p = liveObjectionState.primary?.priority;
      if (p === 'critical' || p === 'high') setRightTab('coach');
    }
  }, [liveObjectionState.primary]);

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
    // Bug 2 fix: clear any existing timer before creating a new one.
    // If startCall is somehow invoked while a previous call is winding up,
    // this prevents two setIntervals running simultaneously and leaking.
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

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

    // Pass the stream directly — mic.stream React state may not have flushed yet.
    await startListening(stream);
    await autosave.startCall();

    callStartRef.current = Date.now();
    setCallStartMs(callStartRef.current);
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
    timelineEventId = 0;
    setTimeline([{ id: 'tl-greeting', timestampSec: 0, category: 'greeting', label: 'Call started', transcriptLineId: null }]);
  }, [mic, startListening, clearTranscript, autosave]);

  const endCall = useCallback(async () => {
    console.log('[endCall] button clicked');

    // ── 1. Capture callId before any cleanup nullifies it ─────────────────────
    const pendingCallId = autosave.callId;
    // Snapshot transcript/duration now — cleanup steps may trigger re-renders
    const transcriptSnapshot = transcript;
    const durationSnapshot = duration;
    const metricsSnapshot = metrics;
    const timelineSnapshot = timeline;

    console.log('[endCall] pendingCallId =', pendingCallId,
      '| transcriptLines =', transcriptSnapshot.length,
      '| duration =', durationSnapshot);

    // ── 2. Cleanup — each step is guarded so a throw never aborts the fetch ──
    // stopListening, mic.stop, autosave.stopCall are all synchronous cleanups.
    // Any of them can throw (e.g. speechRecognition.abort() in some browsers).
    // We catch individually so the fetch below always executes.
    try { stopListening(); console.log('[endCall] stopListening OK'); }
    catch (e) { console.error('[endCall] stopListening threw:', e); }

    try { mic.stop(); console.log('[endCall] mic.stop OK'); }
    catch (e) { console.error('[endCall] mic.stop threw:', e); }

    try { if (timerRef.current) clearInterval(timerRef.current); }
    catch (e) { console.error('[endCall] clearInterval threw:', e); }

    try { autosave.stopCall(); console.log('[endCall] autosave.stopCall OK'); }
    catch (e) { console.error('[endCall] autosave.stopCall threw:', e); }

    // ── 3. Show loading state ──────────────────────────────────────────────────
    setPostCallReport(null);
    setPostCallError(null);
    setShowPostCall(true);
    setLoadingReport(true);

    console.log('[endCall] sending POST /api/post-call — callId:', pendingCallId);

    // ── 4. Finalize: always runs regardless of what cleanup did ───────────────
    try {
      const text = transcriptSnapshot.map((l) => `${l.speaker.toUpperCase()}: ${l.text}`).join('\n');
      const bodyPayload = {
        transcript: text || ' ',
        transcriptLines: transcriptSnapshot,
        duration: durationSnapshot,
        metrics: metricsSnapshot,
        callId: pendingCallId,
        timeline: timelineSnapshot,
      };

      const res = await fetch('/api/post-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      console.log('[endCall] response status:', res.status);
      const data = await res.json().catch(() => null);
      console.log('[endCall] response body:', JSON.stringify(data).slice(0, 300));

      if (!res.ok) {
        console.error('[endCall] /api/post-call non-OK — status:', res.status, '| body:', JSON.stringify(data));
        setPostCallError(data?.error ?? `Server error ${res.status}`);
      } else if (data?._scoreError) {
        console.warn('[endCall] AI scoring failed (call saved) — error:', data._scoreError);
        setPostCallError(data._scoreError);
        // Build a safe partial report: all AI array/string fields defaulted so the
        // view renders without crashing even though OpenAI returned no data.
        const emptyQuality = { confidence: 0, authority: 0, empathy: 0, listening: 0, pacing: 0, control: 0, objectionHandling: 0, discovery: 0, closing: 0, compliance: 0, naturalness: 0, overallSalesEffectiveness: 0 };
        setPostCallReport({
          callId: data.callId ?? null,
          summary: '',
          overallScore: 0,
          rapportScore: 0,
          discoveryScore: 0,
          trustScore: 0,
          closingScore: 0,
          talkPct: metricsSnapshot.talkPct,
          listenPct: metricsSnapshot.listenPct,
          questionsAskedCount: 0,
          scores: {},
          qualityScores: emptyQuality,
          timeline: timelineSnapshot,
          strengths: [],
          missedOpportunities: [],
          buyingSignals: [],
          objections: [],
          objectionsHandling: [],
          mostEffectiveMoments: [],
          weakestMoments: [],
          whatShouldHaveBeenDifferent: [],
          aiCoachingSummary: '',
          threeBiggestImprovements: [],
          threeBiggestStrengths: [],
          overallGrade: 'N/A',
          followUpText: '',
          followUpEmail: '',
          crmNotes: '',
          improvementPlan: [],
        } as PostCallReportType);
      } else if (data?._persistError) {
        console.error('[endCall] persist error:', data._persistError);
        setPostCallError(data._persistError);
      } else {
        setPostCallReport(data as PostCallReportType);
        console.log('[endCall] navigate to report — score:', data?.overallScore);
      }
    } catch (err) {
      console.error('[endCall] POST /api/post-call threw:', err);
      setPostCallError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingReport(false);
    }
  }, [stopListening, mic, transcript, duration, metrics, autosave, timeline]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const talkPct = Math.round(metrics.talkPct);
  const listenPct = 100 - talkPct;

  if (showPostCall) {
    return <PostCallReportView report={postCallReport} transcript={transcript} loading={loadingReport} error={postCallError} onClose={() => setShowPostCall(false)} duration={duration} />;
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

      {/* Silence / audio device warning — shown when mic goes silent mid-call */}
      {(silenceWarning || audioWarning || mic.health === 'muted') && isListening && (
        <div className="shrink-0 mx-4 mb-1 rounded-xl border border-yellow-500/25 bg-yellow-500/8 px-4 py-2.5 text-xs text-yellow-300 leading-relaxed">
          <span className="font-semibold">Audio warning: </span>
          {silenceWarning ?? audioWarning ?? 'Microphone muted by OS — another app is using the audio device. Recording will resume when it is released.'}
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
            {(['stage', 'uw', 'discovery', 'memory', 'score', 'coach'] as const).map((tab) => {
              const hasActiveObjection = tab === 'coach' && (liveObjectionState.primary !== null || liveObjectionState.additional.length > 0);
              return (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={`relative flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    rightTab === tab
                      ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                      : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {tab === 'stage' ? 'Stage' : tab === 'uw' ? 'U/W' : tab === 'discovery' ? 'Discover' : tab === 'memory' ? 'Memory' : tab === 'score' ? 'Score' : 'Coach'}
                  {hasActiveObjection && (
                    <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === 'stage' && (
              <div className="flex flex-col h-full divide-y divide-white/6">
                <div className="flex-shrink-0" style={{ minHeight: 0 }}>
                  <CallStagePanel currentStage={stage} checklist={checklist} nextBestAction={insight.nextBestAction} />
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
            {rightTab === 'discovery' && (
              <MissedOpportunityPanel state={missedOpportunities} isAnalyzing={isAnalyzing} />
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
            {rightTab === 'score' && (
              <LiveSalesScorePanel scores={liveScores} isAnalyzing={isAnalyzing} />
            )}
            {rightTab === 'coach' && (
              <LiveObjectionPanel state={liveObjectionState} callStartMs={callStartMs} />
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

function PostCallReportView({ report, transcript, loading, error, onClose, duration }: {
  report: PostCallReportType | null;
  transcript: { id: string; speaker: string; text: string }[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  duration?: number;
}) {
  const [view, setView] = useState<'report' | 'timeline' | 'transcript'>('report');
  const [search, setSearch] = useState('');
  const [historicalAvg, setHistoricalAvg] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/calls')
      .then((r) => r.json())
      .then((data: { calls?: { score?: number; started_at?: string }[] }) => {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const scored = (data.calls ?? []).filter(
          (c) => (c.score ?? 0) > 0 && new Date(c.started_at ?? 0).getTime() > cutoff
        );
        if (scored.length > 0) {
          const avg = Math.round(scored.reduce((s, c) => s + (c.score ?? 0), 0) / scored.length);
          setHistoricalAvg(avg);
        }
      })
      .catch(() => {});
  }, []);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }

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
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
          </svg>
        </div>
        <div className="space-y-2">
          <p className="text-slate-300 font-semibold">Report generation failed</p>
          {error && (
            <p className="text-sm text-slate-500 max-w-lg leading-relaxed">{error}</p>
          )}
          <p className="text-xs text-slate-600">Your call has been saved. Check Past Calls to view it.</p>
        </div>
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/8 text-slate-300 text-sm hover:bg-white/12 transition-colors">
          ← Back to Call
        </button>
      </div>
    );
  }

  // Defensive defaults — OpenAI may return a partial or empty report (e.g. on 429).
  // Guard every array access so we never throw "X is not iterable".
  const objections = report.objections ?? [];
  const buyingSignals = report.buyingSignals ?? [];
  const objectionsHandling = report.objectionsHandling ?? [];
  const threeBiggestStrengths = report.threeBiggestStrengths ?? [];
  const threeBiggestImprovements = report.threeBiggestImprovements ?? [];
  const mostEffectiveMoments = report.mostEffectiveMoments ?? [];
  const weakestMoments = report.weakestMoments ?? [];
  const whatShouldHaveBeenDifferent = report.whatShouldHaveBeenDifferent ?? [];
  const missedOpportunities = report.missedOpportunities ?? [];
  const improvementPlan = report.improvementPlan ?? [];
  const aiUnavailable = !report.summary;

  const overallColor = scoreColor(report.overallScore ?? 0);
  const highlightTerms = [...objections, ...buyingSignals].filter(Boolean);

  const filteredTranscript = search
    ? transcript.filter((l) => l.text.toLowerCase().includes(search.toLowerCase()))
    : transcript;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* AI unavailable banner — shown when OpenAI returned an error (e.g. 429) */}
      {(error || aiUnavailable) && (
        <div className="shrink-0 mx-6 mt-4 px-4 py-3 rounded-xl border border-amber-500/25 bg-amber-500/8 text-xs text-amber-300 leading-relaxed">
          <span className="font-semibold">AI analysis unavailable</span>
          {error ? ` — ${error}` : ' because the AI provider returned an error.'}
          {' '}Your call has been saved. The transcript is available below.
        </div>
      )}
      {/* ── Executive Summary Hero ─────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 border-b border-white/6 shrink-0 space-y-4">
        <div className="flex items-start justify-between gap-4">
          {/* Score circle */}
          <div className="flex items-center gap-5">
            <div className="relative w-20 h-20 shrink-0">
              <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke={overallColor} strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.round(2 * Math.PI * 34 * (report.overallScore ?? 0) / 100)} 999`}
                  style={{ transition: 'stroke-dasharray 1s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold leading-none" style={{ color: overallColor }}>
                  {report.overallScore ?? 0}
                </span>
                <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                  {report.overallGrade || 'N/A'}
                </span>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Post-Call Report</h2>
              {report.summary && <p className="text-sm text-slate-400 mt-1 max-w-lg leading-relaxed">{report.summary}</p>}
              {/* Historical comparison */}
              {historicalAvg !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">30-day avg:</span>
                  <span className="text-[11px] font-semibold text-slate-300">{historicalAvg}</span>
                  {(report.overallScore ?? 0) > historicalAvg ? (
                    <span className="text-[10px] font-bold text-green-400">↑ +{(report.overallScore ?? 0) - historicalAvg} above avg</span>
                  ) : (report.overallScore ?? 0) < historicalAvg ? (
                    <span className="text-[10px] font-bold text-red-400">↓ {(report.overallScore ?? 0) - historicalAvg} below avg</span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500">= at avg</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-white/6 text-slate-400 text-xs hover:bg-white/10 hover:text-slate-200 transition-colors border border-white/8 no-print"
            >
              Print / PDF
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/8 text-slate-300 text-sm hover:bg-white/12 transition-colors no-print">
              ← New Call
            </button>
          </div>
        </div>
        {/* Metric chips */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Talk Ratio', value: `${report.talkPct ?? 0}%`, color: '#60a5fa' },
            { label: 'Questions', value: String(report.questionsAskedCount ?? 0), color: '#D4AF37' },
            { label: 'Objections', value: String(objections.length), color: objections.length > 3 ? '#ef4444' : '#94a3b8' },
            ...(duration ? [{ label: 'Duration', value: `${Math.floor(duration / 60)}m ${duration % 60}s`, color: '#94a3b8' }] : []),
            ...(report.weightedBreakdown ? [{ label: 'Confidence', value: `${report.weightedBreakdown.confidencePct}%`, color: '#a78bfa' }] : []),
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/8 bg-white/4 text-[11px]">
              <span className="text-slate-500">{label}:</span>
              <span className="font-semibold" style={{ color }}>{value}</span>
            </div>
          ))}
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
            {/* ── Weighted Score Breakdown ─────────────────────────────────────── */}
            {report.weightedBreakdown ? (
              <div className="glass-card rounded-2xl p-5 space-y-4" style={{ border: '1px solid rgba(212,175,55,0.2)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">Weighted Score Breakdown</h3>
                    {report.weightedBreakdown.scoreExplanation && (
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{report.weightedBreakdown.scoreExplanation}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-3xl font-extrabold" style={{ color: scoreColor(report.weightedBreakdown.overallWeighted) }}>
                      {report.weightedBreakdown.overallWeighted}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400">Grade {report.weightedBreakdown.grade}</p>
                    <p className="text-[10px] text-slate-600">{report.weightedBreakdown.confidencePct}% confidence</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {report.weightedBreakdown.categories.map((cat) => (
                    <div key={cat.key}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-300 w-40">{cat.label}</span>
                          <span className="text-[10px] text-slate-600">({Math.round(cat.weight * 100)}%)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{
                            color: scoreColor(cat.score),
                            background: `${scoreColor(cat.score)}18`,
                          }}>{cat.grade}</span>
                          <span className="text-xs font-bold w-7 text-right" style={{ color: scoreColor(cat.score) }}>{cat.score}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${cat.score}%`, background: scoreColor(cat.score) }}
                        />
                      </div>
                      {cat.explanation && (
                        <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{cat.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>

                {report.weightedBreakdown.reasoning && (
                  <p className="text-[11px] text-slate-500 leading-relaxed border-t border-white/6 pt-3">
                    {report.weightedBreakdown.reasoning}
                  </p>
                )}
              </div>
            ) : (
              /* Score summary row — fallback when weightedBreakdown not present */
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  ['Rapport', report.rapportScore ?? 0], ['Discovery', report.discoveryScore ?? 0],
                  ['Trust', report.trustScore ?? 0], ['Closing', report.closingScore ?? 0],
                ].map(([label, val]) => (
                  <div key={label as string} className="glass-card rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold" style={{ color: scoreColor(val as number) }}>{val}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{label} Score</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Conversation Analysis ────────────────────────────────────── */}
            {report.conversationAnalysis && (
              <div className="glass-card rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200">Conversation Analysis</h3>

                {/* Talk/Listen split bar */}
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>Agent <span className="text-blue-400 font-bold">{report.conversationAnalysis.agentTalkPct}%</span></span>
                    <span className={
                      report.conversationAnalysis.talkRatioAssessment === 'excellent' ? 'text-green-400' :
                      report.conversationAnalysis.talkRatioAssessment === 'good' ? 'text-amber-400' : 'text-red-400'
                    }>
                      {report.conversationAnalysis.talkRatioAssessment === 'excellent' ? '✓ Ideal ratio' :
                       report.conversationAnalysis.talkRatioAssessment === 'good' ? '~ Slightly high' :
                       report.conversationAnalysis.talkRatioAssessment === 'high' ? '⚠ Too much talking' : '⛔ Way too much talking'}
                    </span>
                    <span>Prospect <span className="text-purple-400 font-bold">{report.conversationAnalysis.prospectTalkPct}%</span></span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden flex">
                    <div className="h-full bg-blue-500/70" style={{ width: `${report.conversationAnalysis.agentTalkPct}%` }} />
                    <div className="h-full bg-purple-500/70 flex-1" />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Agent Words', value: report.conversationAnalysis.agentWords.toLocaleString(), color: '#60a5fa' },
                    { label: 'Prospect Words', value: report.conversationAnalysis.prospectWords.toLocaleString(), color: '#c084fc' },
                    { label: 'Agent Questions', value: String(report.conversationAnalysis.agentQuestionCount), color: '#D4AF37' },
                    { label: 'Agent Turns', value: String(report.conversationAnalysis.agentTurnCount), color: '#60a5fa' },
                    { label: 'Avg Words/Turn', value: String(report.conversationAnalysis.agentAvgWordsPerTurn), color: '#60a5fa' },
                    { label: 'Longest Monologue', value: `${report.conversationAnalysis.agentLongestTurn}w`, color: report.conversationAnalysis.agentLongestTurn > 100 ? '#ef4444' : '#94a3b8' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white/4 rounded-xl p-3 text-center">
                      <p className="text-sm font-bold" style={{ color }}>{value}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Turn-by-turn bar chart */}
                {report.conversationAnalysis.turns.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-600 mb-1.5">Turn-by-turn word count</p>
                    <div className="flex items-end gap-0.5 h-12">
                      {report.conversationAnalysis.turns.map((turn, i) => {
                        const maxWords = Math.max(...report.conversationAnalysis!.turns.map((t) => t.words), 1);
                        const heightPct = Math.max(8, Math.round((turn.words / maxWords) * 100));
                        return (
                          <div
                            key={i}
                            title={`${turn.speaker}: ${turn.words} words${turn.isQuestion ? ' (?)' : ''}`}
                            className="flex-1 rounded-t-sm min-w-[2px]"
                            style={{
                              height: `${heightPct}%`,
                              background: turn.speaker === 'agent' ? '#3b82f680' : '#a855f780',
                              outline: turn.isQuestion ? '1px solid #D4AF37' : 'none',
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-[10px] text-slate-600">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/70 inline-block" /> Agent</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-500/70 inline-block" /> Prospect</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm border border-[#D4AF37] inline-block" /> Question</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Quality Radar — guarded: qualityScores may be empty object when AI unavailable */}
              <div className="glass-card rounded-2xl p-5 flex flex-col items-center xl:col-span-1">
                <h3 className="text-sm font-semibold text-slate-200 self-start mb-2">AI Quality Score</h3>
                <RadarChart scores={report.qualityScores ?? {} as import('@/lib/types').QualityScores} size={260} />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full mt-2 text-[10px] text-slate-500">
                  <p>Talk/Listen: <span className="text-slate-300 font-medium">{report.talkPct ?? 0}% / {report.listenPct ?? 0}%</span></p>
                  <p>Questions Asked: <span className="text-slate-300 font-medium">{report.questionsAskedCount ?? 0}</span></p>
                </div>
              </div>

              {/* Strengths/Improvements */}
              <div className="space-y-4 xl:col-span-1">
                <div className="glass-card rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-green-400">✓ Three Biggest Strengths</h3>
                  {threeBiggestStrengths.length === 0
                    ? <p className="text-xs text-slate-600">Not available</p>
                    : threeBiggestStrengths.map((s, i) => (
                        <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-green-400 font-bold">{i + 1}.</span>{s}</p>
                      ))
                  }
                </div>
                <div className="glass-card rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-amber-400">⚡ Three Biggest Improvements</h3>
                  {threeBiggestImprovements.length === 0
                    ? <p className="text-xs text-slate-600">Not available</p>
                    : threeBiggestImprovements.map((s, i) => (
                        <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-amber-400 font-bold">{i + 1}.</span>{s}</p>
                      ))
                  }
                </div>
              </div>

              {/* AI Coaching Summary */}
              <div className="space-y-4 xl:col-span-1">
                <div className="glass-card rounded-2xl p-5 space-y-2" style={{ border: '1px solid rgba(212,175,55,0.25)' }}>
                  <h3 className="text-sm font-semibold text-[#D4AF37]">AI Coaching Summary</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {report.aiCoachingSummary || <span className="text-slate-600">Not available</span>}
                  </p>
                </div>
                <div className="glass-card rounded-2xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-300">CRM Notes</h3>
                    {report.crmNotes && (
                      <button
                        onClick={() => copyToClipboard(report.crmNotes!, 'crm')}
                        className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors no-print"
                      >
                        {copied === 'crm' ? '✓ Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {report.crmNotes || <span className="text-slate-600">Not available</span>}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">Most Effective Moments</h3>
                {mostEffectiveMoments.length === 0
                  ? <p className="text-xs text-slate-600">Not available</p>
                  : mostEffectiveMoments.map((m, i) => (
                      <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-green-400">•</span>{m}</p>
                    ))
                }
              </div>
              <div className="glass-card rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">Weakest Moments</h3>
                {weakestMoments.length === 0
                  ? <p className="text-xs text-slate-600">Not available</p>
                  : weakestMoments.map((m, i) => (
                      <p key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-red-400">•</span>{m}</p>
                    ))
                }
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">Objections Encountered &amp; How Handled</h3>
              {objectionsHandling.map((o, i) => (
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
              {objectionsHandling.length === 0 && <p className="text-xs text-slate-600">No objections encountered.</p>}
            </div>

            <div className="glass-card rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#D4AF37]">What Should Have Happened Differently</h3>
              {whatShouldHaveBeenDifferent.length === 0
                ? <p className="text-xs text-slate-600">Not available</p>
                : whatShouldHaveBeenDifferent.map((s, i) => (
                    <p key={i} className="text-xs text-slate-300 flex gap-2">
                      <span className="text-[#D4AF37] font-bold shrink-0">{i + 1}.</span>{s}
                    </p>
                  ))
              }
            </div>

            {/* Missed Opportunities */}
            {missedOpportunities.length > 0 && (
              <div className="glass-card rounded-2xl p-5 space-y-3" style={{ border: '1px solid rgba(239,68,68,0.15)' }}>
                <h3 className="text-sm font-semibold text-red-400">Missed Opportunities</h3>
                {missedOpportunities.map((o, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-red-400 font-bold text-[10px] mt-0.5 shrink-0">!</span>
                    <p className="text-xs text-slate-300 leading-relaxed">{o}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Buying Signals Detected */}
            {buyingSignals.length > 0 && (
              <div className="glass-card rounded-2xl p-5 space-y-3" style={{ border: '1px solid rgba(34,197,94,0.15)' }}>
                <h3 className="text-sm font-semibold text-green-400">Buying Signals Detected</h3>
                <div className="flex flex-wrap gap-2">
                  {buyingSignals.map((s, i) => (
                    <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-300">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Improvement Plan */}
            {improvementPlan.length > 0 && (
              <div className="glass-card rounded-2xl p-5 space-y-3" style={{ border: '1px solid rgba(212,175,55,0.15)' }}>
                <h3 className="text-sm font-semibold" style={{ color: '#D4AF37' }}>30-Day Improvement Plan</h3>
                {improvementPlan.map((item, i) => (
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

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-blue-400">Follow-up Text</h3>
                  {report.followUpText && (
                    <button
                      onClick={() => copyToClipboard(report.followUpText!, 'text')}
                      className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors no-print"
                    >
                      {copied === 'text' ? '✓ Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed bg-white/4 rounded-lg p-3 border border-white/6">
                  {report.followUpText || <span className="text-slate-600">Not available</span>}
                </p>
              </div>
              <div className="glass-card rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-violet-400">Follow-up Email</h3>
                  {report.followUpEmail && (
                    <button
                      onClick={() => copyToClipboard(report.followUpEmail!, 'email')}
                      className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors no-print"
                    >
                      {copied === 'email' ? '✓ Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-white/4 rounded-lg p-3 border border-white/6">
                  {report.followUpEmail || <span className="text-slate-600">Not available</span>}
                </p>
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
