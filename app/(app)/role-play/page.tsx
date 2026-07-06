'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { SubscriptionGate } from '@/components/billing/SubscriptionGate';
import { useRolePlay } from '@/hooks/useRolePlay';
import { useAICoach } from '@/hooks/useAICoach';
import { PERSONAS, DIFFICULTY_CONFIG, type PersonaDifficulty } from '@/lib/roleplay-personas';
import { AICoachPanel } from '@/components/live-call/AICoachPanel';
import { LiveSalesScorePanel } from '@/components/live-call/LiveSalesScorePanel';
import { LiveClosingPanel } from '@/components/live-call/LiveClosingPanel';
import { LiveCarrierPanel } from '@/components/live-call/LiveCarrierPanel';
import { scoreColor } from '@/lib/score-color';

// ── Practice stats stored in localStorage ─────────────────────────────────────
interface StoredSession {
  id: string;
  personaId: string;
  personaLabel: string;
  timestamp: number;
  overallScore: number;
  grade: string;
  durationSeconds: number;
  categoryScores: Record<string, number>;
}

function loadStats(): StoredSession[] {
  try {
    return JSON.parse(localStorage.getItem('rp_sessions') ?? '[]') as StoredSession[];
  } catch { return []; }
}

function saveSession(s: StoredSession) {
  try {
    const existing = loadStats();
    localStorage.setItem('rp_sessions', JSON.stringify([s, ...existing].slice(0, 100)));
  } catch { /* quota exceeded — ignore */ }
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 40) return 'D';
  return 'F';
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#4ade80';
  if (grade.startsWith('B')) return '#D4AF37';
  if (grade.startsWith('C')) return '#fb923c';
  return '#f87171';
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── Persona Grid ──────────────────────────────────────────────────────────────
const DIFFICULTY_ORDER: PersonaDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

function PersonaGrid({ onSelect }: { onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<PersonaDifficulty | 'all'>('all');
  const pastSessions = loadStats();

  const avgScore = pastSessions.length
    ? Math.round(pastSessions.reduce((s, p) => s + p.overallScore, 0) / pastSessions.length)
    : null;

  const weakest = (() => {
    if (!pastSessions.length) return null;
    const totals: Record<string, number[]> = {};
    for (const s of pastSessions) {
      for (const [k, v] of Object.entries(s.categoryScores ?? {})) {
        if (!totals[k]) totals[k] = [];
        totals[k].push(v);
      }
    }
    let minKey = '', minVal = Infinity;
    for (const [k, vals] of Object.entries(totals)) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (avg < minVal) { minVal = avg; minKey = k; }
    }
    return minKey || null;
  })();

  const shown = filter === 'all' ? PERSONAS : PERSONAS.filter(p => p.difficulty === filter);

  return (
    <div className="space-y-6 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">AI Role Play Trainer</h2>
          <p className="text-sm text-slate-500 mt-1">
            Practice complete FE sales calls against realistic AI prospects. Real-time coaching scores every turn.
          </p>
        </div>
        {/* Practice stats */}
        {pastSessions.length > 0 && (
          <div className="flex gap-3 shrink-0">
            <div className="text-center px-4 py-2.5 rounded-xl"
              style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <p className="text-xl font-extrabold" style={{ color: gradeColor(gradeFromScore(avgScore ?? 0)) }}>{avgScore}</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Avg Score</p>
            </div>
            <div className="text-center px-4 py-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xl font-extrabold text-slate-200">{pastSessions.length}</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Sessions</p>
            </div>
            {weakest && (
              <div className="text-center px-4 py-2.5 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                <p className="text-sm font-bold text-red-400 capitalize">{weakest}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">Work On</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Difficulty filter */}
      <div className="flex gap-2 flex-wrap">
        {(['all', ...DIFFICULTY_ORDER] as const).map(d => {
          const cfg = d === 'all' ? { label: 'All', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)' } : DIFFICULTY_CONFIG[d];
          const active = filter === d;
          return (
            <button key={d} onClick={() => setFilter(d)}
              className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
              style={{
                background: active ? cfg.bg : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? cfg.border : 'rgba(255,255,255,0.08)'}`,
                color: active ? cfg.color : '#475569',
              }}>
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Persona grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {shown.map(p => {
          const dc = DIFFICULTY_CONFIG[p.difficulty];
          const past = pastSessions.filter(s => s.personaId === p.id);
          const bestScore = past.length ? Math.max(...past.map(s => s.overallScore)) : null;
          return (
            <button key={p.id} onClick={() => onSelect(p.id)}
              className="glass-card rounded-2xl p-4 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-white/6 hover:border-[rgba(212,175,55,0.3)] group">
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">{p.emoji}</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: dc.bg, color: dc.color, border: `1px solid ${dc.border}` }}>
                  {dc.label}
                </span>
              </div>
              <p className="text-[11px] font-bold text-slate-200 group-hover:text-[#D4AF37] transition-colors leading-tight">{p.label}</p>
              <p className="text-[10px] text-slate-600 mt-1 leading-relaxed line-clamp-2">{p.desc}</p>
              {bestScore !== null && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[9px] text-slate-600">Best</span>
                  <span className="text-[10px] font-bold" style={{ color: scoreColor(bestScore) }}>{bestScore}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Session Summary ────────────────────────────────────────────────────────────
interface SummaryData {
  summary: string;
  categoryScores: Record<string, number>;
  categoryExplanations: Record<string, string>;
  scoreExplanation: string;
  strengths: string[];
  areasForImprovement: string[];
  missedOpportunities: string[];
  overallScore: number;
}

function SessionSummary({
  persona, duration, summary, score, onNew, onRepeat,
}: {
  persona: { emoji: string; label: string; difficulty: PersonaDifficulty };
  duration: number;
  summary: SummaryData | null;
  score: number;
  onNew: () => void;
  onRepeat: () => void;
}) {
  const grade = gradeFromScore(score);
  const gc = gradeColor(grade);
  const dc = DIFFICULTY_CONFIG[persona.difficulty];

  const categories = summary?.categoryScores ?? {};

  return (
    <div className="max-w-[780px] mx-auto space-y-5 pb-8">
      {/* Grade header */}
      <div className="rounded-2xl p-6 text-center"
        style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}>
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-4xl">{persona.emoji}</span>
          <div className="text-left">
            <p className="text-sm text-slate-400">{persona.label}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: dc.bg, color: dc.color, border: `1px solid ${dc.border}` }}>
              {dc.label}
            </span>
          </div>
        </div>
        <div className="text-7xl font-extrabold mb-1" style={{ color: gc }}>{grade}</div>
        <div className="text-2xl font-bold text-slate-300 mb-1">{score}/100</div>
        <p className="text-sm text-slate-500">Session: {formatDuration(duration)}</p>
        {summary?.scoreExplanation && (
          <p className="text-sm text-slate-400 mt-3 max-w-md mx-auto leading-relaxed">{summary.scoreExplanation}</p>
        )}
      </div>

      {/* Category scores */}
      {Object.keys(categories).length > 0 && (
        <div className="rounded-2xl p-4 space-y-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Performance Breakdown</p>
          {Object.entries(categories).map(([key, val]) => {
            const pct = val as number;
            const sc = scoreColor(pct);
            const explanation = summary?.categoryExplanations?.[key] ?? '';
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-300 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-[11px] font-bold" style={{ color: sc }}>{pct}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-1">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: sc }} />
                </div>
                {explanation && (
                  <p className="text-[10px] text-slate-600 leading-snug mb-1">{explanation}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Strengths + Improvements */}
      <div className="grid grid-cols-2 gap-3">
        {(summary?.strengths ?? []).length > 0 && (
          <div className="rounded-xl p-4"
            style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)' }}>
            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mb-2">✓ Strengths</p>
            <ul className="space-y-1.5">
              {(summary?.strengths ?? []).map((s, i) => (
                <li key={i} className="text-[10px] text-slate-300 leading-snug flex gap-1.5">
                  <span className="text-emerald-500 shrink-0">•</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(summary?.areasForImprovement ?? []).length > 0 && (
          <div className="rounded-xl p-4"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-2">↗ Improve</p>
            <ul className="space-y-1.5">
              {(summary?.areasForImprovement ?? []).map((s, i) => (
                <li key={i} className="text-[10px] text-slate-300 leading-snug flex gap-1.5">
                  <span className="text-red-500 shrink-0">•</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Missed opportunities */}
      {(summary?.missedOpportunities ?? []).length > 0 && (
        <div className="rounded-xl p-4"
          style={{ background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.15)' }}>
          <p className="text-[9px] font-bold text-orange-400 uppercase tracking-wider mb-2">Missed Opportunities</p>
          <ul className="space-y-1">
            {(summary?.missedOpportunities ?? []).map((s, i) => (
              <li key={i} className="text-[10px] text-slate-300 leading-snug flex gap-1.5">
                <span className="text-orange-500 shrink-0">◦</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI executive summary */}
      {summary?.summary && (
        <div className="rounded-xl p-4"
          style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-2">Sales Manager Notes</p>
          <p className="text-[11px] text-slate-300 leading-relaxed">{summary.summary}</p>
        </div>
      )}

      {/* CTA */}
      <div className="flex gap-3 pt-2">
        <button onClick={onRepeat}
          className="flex-1 h-11 rounded-xl font-semibold text-sm border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-colors">
          Try Again ({persona.emoji} {persona.label})
        </button>
        <button onClick={onNew}
          className="flex-1 h-11 rounded-xl font-semibold text-sm transition-all"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)', color: '#090d18' }}>
          New Session
        </button>
      </div>
    </div>
  );
}

// ── Coaching right panel tabs ─────────────────────────────────────────────────
type CoachTab = 'coach' | 'score' | 'close' | 'uw';

const COACH_TAB_LABELS: Record<CoachTab, string> = {
  coach: 'Coach',
  score: 'Score',
  close: 'Close',
  uw: 'U/W',
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RolePlayPage() {
  return (
    <SubscriptionGate
      featureName="AI Role Play Trainer"
      featureDescription="Practice with 22 AI personas and get real-time coaching feedback on your sales technique."
    >
      <RolePlayPageInner />
    </SubscriptionGate>
  );
}

function RolePlayPageInner() {
  const { session, phase, isProspectTyping, transcript, startSession, sendAgentMessage, endSession, resetSession, durationSeconds } = useRolePlay();
  const { insight, stage, underwriting, carriers, checklist, isAnalyzing, scheduleAnalysis, liveScores, missedOpportunities, liveObjectionState, liveClosingState } = useAICoach(transcript);

  const [input, setInput] = useState('');
  const [coachTab, setCoachTab] = useState<CoachTab>('score');
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTranscriptLen = useRef(0);

  // Trigger coaching analysis when transcript grows
  useEffect(() => {
    if (transcript.length > lastTranscriptLen.current) {
      lastTranscriptLen.current = transcript.length;
      scheduleAnalysis(transcript);
    }
  }, [transcript, scheduleAnalysis]);

  // Auto-scroll transcript
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  // Focus input on session start
  useEffect(() => {
    if (phase === 'active') inputRef.current?.focus();
  }, [phase]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || phase !== 'active' || isProspectTyping) return;
    setInput('');
    await sendAgentMessage(text);
  }, [input, phase, isProspectTyping, sendAgentMessage]);

  const handleEndSession = useCallback(async () => {
    endSession();
    setLoadingSummary(true);

    // Build transcript text for post-call analysis
    const transcriptText = (session?.messages ?? [])
      .filter(m => !m.isStreaming)
      .map(m => `${m.role === 'agent' ? 'AGENT' : 'PROSPECT'}: ${m.text}`)
      .join('\n');

    const agentLines = (session?.messages ?? []).filter(m => m.role === 'agent' && !m.isStreaming);
    const prospectLines = (session?.messages ?? []).filter(m => m.role === 'prospect' && !m.isStreaming);
    const totalLines = agentLines.length + prospectLines.length;
    const talkPct = totalLines > 0 ? Math.round((agentLines.length / totalLines) * 100) : 50;
    const listenPct = 100 - talkPct;

    try {
      const res = await fetch('/api/post-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          talkPct,
          listenPct,
          questionCount: agentLines.filter(l =>
            l.text.includes('?') || /^(what|how|when|where|who|do you|have you|would you|could you|can you|tell me|are you)/i.test(l.text)
          ).length,
        }),
      });

      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const report = data.report as Record<string, unknown> | undefined ?? data;

        const computedScore = (() => {
          const cs = report.categoryScores as Record<string, number> | undefined ?? {};
          const WEIGHTS: Record<string, number> = { rapport: 0.15, discovery: 0.2, health: 0.15, budget: 0.1, presentation: 0.1, objections: 0.15, closing: 0.15 };
          const sum = Object.entries(WEIGHTS).reduce((acc, [k, w]) => acc + (cs[k] ?? 70) * w, 0);
          return Math.round(sum);
        })();

        const summary: SummaryData = {
          summary: (report.summary as string) ?? '',
          categoryScores: (report.categoryScores as Record<string, number>) ?? {},
          categoryExplanations: (report.categoryExplanations as Record<string, string>) ?? {},
          scoreExplanation: (report.scoreExplanation as string) ?? '',
          strengths: (report.strengths as string[]) ?? [],
          areasForImprovement: (report.areasForImprovement as string[]) ?? [],
          missedOpportunities: (report.missedOpportunities as string[]) ?? [],
          overallScore: computedScore,
        };
        setSummaryData(summary);

        // Persist session
        const stored: StoredSession = {
          id: `${Date.now()}`,
          personaId: session?.personaId ?? '',
          personaLabel: session?.persona.label ?? '',
          timestamp: Date.now(),
          overallScore: computedScore,
          grade: gradeFromScore(computedScore),
          durationSeconds,
          categoryScores: summary.categoryScores,
        };
        saveSession(stored);

        // Try server persistence (non-blocking)
        fetch('/api/roleplay/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...stored, turnCount: session?.turnCount ?? 0 }),
        }).catch(() => { /* non-fatal */ });
      }
    } catch { /* network error — summary unavailable */ } finally {
      setLoadingSummary(false);
    }
  }, [session, endSession, durationSeconds]);

  // ── Persona selection ──────────────────────────────────────────────────────
  if (phase === 'idle') {
    return <PersonaGrid onSelect={startSession} />;
  }

  // ── Session summary ────────────────────────────────────────────────────────
  if (phase === 'ended' && session) {
    const score = summaryData?.overallScore ?? liveScores.overall;
    return (
      <div className="h-full overflow-y-auto">
        {loadingSummary ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400">Generating your session report…</p>
          </div>
        ) : (
          <SessionSummary
            persona={session.persona}
            duration={durationSeconds}
            summary={summaryData}
            score={score}
            onNew={resetSession}
            onRepeat={() => { setSummaryData(null); startSession(session.personaId); }}
          />
        )}
      </div>
    );
  }

  // ── Active session ─────────────────────────────────────────────────────────
  if (!session) return null;
  const dc = DIFFICULTY_CONFIG[session.persona.difficulty];

  return (
    <div className="flex h-full gap-0 overflow-hidden -mx-4 -mt-2">

      {/* ── Left: Chat ────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-white/6">

        {/* Session header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/6 shrink-0">
          <span className="text-xl shrink-0">{session.persona.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-200">{session.persona.label}</p>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: dc.bg, color: dc.color, border: `1px solid ${dc.border}` }}>
                {dc.label}
              </span>
            </div>
            <p className="text-[10px] text-slate-600 truncate">{session.persona.desc}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-center">
              <p className="text-xs font-bold text-[#D4AF37]">{formatDuration(durationSeconds)}</p>
              <p className="text-[8px] text-slate-600">Duration</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-slate-300">{session.turnCount}</p>
              <p className="text-[8px] text-slate-600">Turns</p>
            </div>
            <button onClick={handleEndSession}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
              End Session
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {session.messages.map((msg) => {
            const isAgent = msg.role === 'agent';
            return (
              <div key={msg.id} className={`flex gap-2.5 ${isAgent ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${
                  isAgent
                    ? ''
                    : 'bg-blue-500/15 border border-blue-500/25 text-blue-400'
                }`}
                  style={isAgent ? { background: 'linear-gradient(135deg,#D4AF37,#b8940f)', color: '#090d18' } : {}}>
                  {isAgent ? 'A' : session.persona.emoji}
                </div>

                {/* Bubble */}
                <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isAgent
                    ? 'bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.15)] text-slate-200 rounded-tr-sm'
                    : 'bg-blue-500/8 border border-blue-500/12 text-slate-200 rounded-tl-sm'
                }`}>
                  {msg.text}
                  {msg.isStreaming && (
                    <span className="inline-flex gap-0.5 ml-1.5 align-middle">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {isProspectTyping && !session.messages.some(m => m.isStreaming) && (
            <div className="flex gap-2.5 items-center">
              <div className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-[10px]">
                {session.persona.emoji}
              </div>
              <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm bg-blue-500/8 border border-blue-500/12 flex gap-1 items-center">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-white/6 shrink-0">
          {/* Live score bar */}
          <div className="flex gap-3 mb-2.5">
            {[
              { label: 'Rapport', val: liveScores.rapport },
              { label: 'Discovery', val: liveScores.discovery },
              { label: 'Close %', val: liveClosingState.probability },
            ].map(({ label, val }) => (
              <div key={label} className="flex-1">
                <div className="flex justify-between mb-0.5">
                  <span className="text-[9px] text-slate-600">{label}</span>
                  <span className="text-[9px] font-bold" style={{ color: scoreColor(val) }}>{val}</span>
                </div>
                <div className="h-0.5 rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${val}%`, background: scoreColor(val) }} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type what you would say to the prospect…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={isProspectTyping}
              className="flex-1 h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)] transition-colors disabled:opacity-50"
            />
            <button onClick={handleSend}
              disabled={!input.trim() || isProspectTyping}
              className="px-5 h-11 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 shrink-0"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)', color: '#090d18' }}>
              Send
            </button>
          </div>
          <p className="text-[9px] text-slate-700 mt-1.5 text-center">
            Coaching updates after each prospect response · Stage: <span className="text-slate-600 capitalize">{stage.replace(/_/g, ' ')}</span>
          </p>
        </div>
      </div>

      {/* ── Right: Coaching panels ─────────────────────────────────────────── */}
      <div className="w-[340px] flex flex-col shrink-0">
        {/* Coach tab bar */}
        <div className="flex border-b border-white/6 shrink-0">
          {(Object.keys(COACH_TAB_LABELS) as CoachTab[]).map(tab => (
            <button key={tab}
              onClick={() => setCoachTab(tab)}
              className={`flex-1 py-2.5 text-[10px] font-semibold transition-colors ${
                coachTab === tab ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]' : 'text-slate-600 hover:text-slate-400'
              }`}>
              {COACH_TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {coachTab === 'coach' && (
            <div className="h-full overflow-y-auto">
              <AICoachPanel insight={insight} isAnalyzing={isAnalyzing} />
            </div>
          )}
          {coachTab === 'score' && (
            <div className="h-full overflow-y-auto">
              <LiveSalesScorePanel scores={liveScores} isAnalyzing={isAnalyzing} />
            </div>
          )}
          {coachTab === 'close' && (
            <LiveClosingPanel state={liveClosingState} isAnalyzing={isAnalyzing} />
          )}
          {coachTab === 'uw' && (
            <LiveCarrierPanel carriers={carriers} underwriting={underwriting} />
          )}
        </div>
      </div>
    </div>
  );
}
