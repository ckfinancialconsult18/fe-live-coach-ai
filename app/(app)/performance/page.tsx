'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Window = '7' | '30' | '90';
type Tab = 'overview' | 'brief' | 'coaching' | 'goals' | 'insights' | 'trends' | 'achievements' | 'team';

interface StageRanking {
  key: string; label: string; avg: number | null; callCount: number; trend: 'up' | 'down' | 'flat';
}
interface FreqItem { label: string; count: number; pct?: number; frequency?: number }
interface ScoreDot { date: string; score: number }

interface PerfData {
  window: Window; callCount: number; avgOverall: number | null;
  scoreTrend: ScoreDot[]; stageRankings: StageRanking[]; ranked: StageRanking[];
  topStrengths: FreqItem[]; missedOpportunities: (FreqItem & { frequency: number })[];
  topObjections: FreqItem[]; recurringImprovements: FreqItem[];
}

interface BriefData {
  window: number; callCount: number; currentAvg: number | null; previousAvg: number | null;
  trendDelta: number | null; trendDirection: 'up' | 'down' | 'flat' | 'unknown';
  strongestSkill: { label: string; avg: number } | null;
  weakestSkill: { label: string; avg: number } | null;
  biggestImprovement: { label: string; avg: number; delta: number } | null;
  mostImprovedSkill: { label: string; avg: number; delta: number } | null;
  topObjection: string | null; topMissedDiscovery: string | null;
  closingTrend: ScoreDot[];
  topFocus: string | null;
  stageDeltas: { key: string; label: string; avg: number; delta: number | null }[];
  coachSummary: string | null;
}

interface CoachingPlan {
  generatedAt?: string; fromCache?: boolean;
  top3Priorities: { priority: string; why: string; estimatedImpact: string }[];
  scriptsToPractice: { scenario: string; script: string }[];
  discoveryQuestionsToImprove: string[];
  objectionHandlingFocus: { objection: string; recommendedResponse: string }[];
  closingRecommendation: string;
  overallMessage: string;
  error?: string;
}

type GoalType =
  | 'calls_per_day' | 'appointments_per_day' | 'policies_per_day'
  | 'applications_submitted' | 'target_close_rate' | 'avg_call_score'
  | 'avg_discovery_score' | 'avg_rapport_score';

interface GoalProgress {
  id: string; goal_type: GoalType; target: number; current: number;
  pct: number; met: boolean; remaining: number; estimatedDate: string | null; label?: string;
}
interface GoalsData { goals: GoalProgress[]; labels: Record<GoalType, string> }

interface StreakData {
  consecutiveCallDays: number; longestCallStreak: number;
  consecutiveHighScoreDays: number; longestHighScoreStreak: number;
  currentImprovementStreak: number; longestImprovementStreak: number;
  totalCallDays: number; totalScoredCalls: number;
  callsThisWeek: number; policiesThisMonth: number;
}

interface Insight {
  id: string; text: string; category: 'strength' | 'gap' | 'trend' | 'opportunity'; metric: string; confidence: 'high' | 'medium';
}
interface InsightsData { insights: Insight[]; callCount: number; message?: string; error?: string }

interface TrendsData {
  window: number; callCount: number; scoreCount: number;
  scoreOverTime: ScoreDot[];
  avgScoreOverTime: ScoreDot[];
  callVolume: { date: string; count: number }[];
  policiesPerDay: { date: string; count: number }[];
  closeRateOverTime: { date: string; rate: number }[];
  stageTrends: { key: string; label: string; points: ScoreDot[] }[];
}

interface Achievement {
  id: string; name: string; description: string; icon: string;
  category: 'volume' | 'quality' | 'consistency' | 'mastery';
  earned: boolean; earnedAt?: string; progress: number; progressLabel: string;
}
interface AchievementsData {
  achievements: Achievement[]; earned: number; total: number;
  totalCalls: number; totalPolicies: number; bestScore: number;
}

interface AgencyMember {
  id: string; name: string; email: string; role: string;
  avgScore: number | null; callCount: number; closeRate: number;
  strongestStage: string | null; weakestStage: string | null;
  trend: 'up' | 'down' | 'flat';
}
interface AgencyData { id: string; name: string; role: string; members?: AgencyMember[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 80 ? '#22c55e' : s >= 65 ? '#D4AF37' : '#ef4444';
}
function TrendArrow({ dir }: { dir: 'up' | 'down' | 'flat' | 'unknown' }) {
  if (dir === 'up') return <span className="text-green-400">↑</span>;
  if (dir === 'down') return <span className="text-red-400">↓</span>;
  return <span className="text-slate-500">→</span>;
}
function Spinner() {
  return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin" /></div>;
}
function EmptyCard({ msg }: { msg: string }) {
  return (
    <div className="glass-card rounded-2xl p-10 text-center">
      <p className="text-sm text-slate-500">{msg}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [win, setWin] = useState<Window>('30');
  const [isOwner, setIsOwner] = useState(false);

  // Check if user is agency owner to show Team tab
  useEffect(() => {
    fetch('/api/agency').then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.role === 'owner') setIsOwner(true);
    }).catch(() => {});
  }, []);

  const baseTabs: { id: Tab; label: string }[] = [
    { id: 'overview',     label: 'Overview' },
    { id: 'brief',        label: 'Morning Brief' },
    { id: 'coaching',     label: 'Coaching Plan' },
    { id: 'goals',        label: 'Goals' },
    { id: 'insights',     label: 'Insights' },
    { id: 'trends',       label: 'Trends' },
    { id: 'achievements', label: 'Achievements' },
  ];
  const tabs = isOwner ? [...baseTabs, { id: 'team' as Tab, label: 'Team' }] : baseTabs;

  const showWindow = tab === 'overview' || tab === 'brief' || tab === 'insights' || tab === 'trends';

  return (
    <div className="space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Performance Engine</h2>
          <p className="text-sm text-slate-500 mt-1">Track every skill, spot every gap, and know exactly where deals are won or lost</p>
        </div>
        {showWindow && (
          <div className="flex gap-1 p-1 rounded-xl bg-white/5">
            {(['7', '30', '90'] as Window[]).map((w) => (
              <button key={w} onClick={() => setWin(w)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${win === w ? 'bg-[#D4AF37] text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>
                {w}d
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 w-fit flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-[#D4AF37] text-slate-950' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'     && <OverviewTab win={win} />}
      {tab === 'brief'        && <BriefTab win={win} />}
      {tab === 'coaching'     && <CoachingTab />}
      {tab === 'goals'        && <GoalsTab />}
      {tab === 'insights'     && <InsightsTab win={win} />}
      {tab === 'trends'       && <TrendsTab win={win} />}
      {tab === 'achievements' && <AchievementsTab />}
      {tab === 'team'         && <AgencyTeamTab />}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ win }: { win: Window }) {
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    fetch(`/api/performance?window=${win}`)
      .then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [win]);

  if (loading) return <Spinner />;
  if (!data || data.callCount === 0) return <EmptyCard msg={`No scored calls in the last ${win} days. Complete a live call to start building your performance profile.`} />;

  const topStage = data.ranked[0];
  const bottomStage = data.ranked[data.ranked.length - 1];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Calls Analyzed" value={String(data.callCount)} sub={`Last ${win} days`} color="#D4AF37" />
        <KpiCard label="Avg Score" value={data.avgOverall !== null ? String(data.avgOverall) : '—'} sub={data.avgOverall !== null ? (data.avgOverall >= 80 ? 'Excellent' : data.avgOverall >= 65 ? 'Good' : 'Needs work') : 'No data'} color={data.avgOverall !== null ? scoreColor(data.avgOverall) : '#64748b'} />
        <KpiCard label="Strongest Skill" value={topStage?.label ?? '—'} sub={topStage ? `Avg ${topStage.avg}` : 'No data'} color="#22c55e" small />
        <KpiCard label="Biggest Gap" value={bottomStage?.label ?? '—'} sub={bottomStage ? `Avg ${bottomStage.avg} — focus here` : 'No data'} color="#ef4444" small />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Skill Rankings</h3>
            <p className="text-xs text-slate-500 mt-0.5">All 9 call stages ranked by average score</p>
          </div>
          <div className="space-y-2.5">
            {data.stageRankings.map((s) => {
              const rank = data.ranked.findIndex((r) => r.key === s.key);
              const isTop = rank === 0, isBot = rank === data.ranked.length - 1 && data.ranked.length > 1;
              return (
                <div key={s.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] w-4 text-slate-600 text-right">{rank + 1}</span>
                    <span className="text-xs text-slate-300 flex-1">{s.label}</span>
                    <TrendArrow dir={s.trend} />
                    {isTop && <span className="text-[10px] text-green-400">★</span>}
                    {isBot && <span className="text-[10px] text-red-400">⚠</span>}
                    <span className="text-xs font-bold w-8 text-right" style={{ color: s.avg !== null ? scoreColor(s.avg) : '#475569' }}>{s.avg ?? '—'}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 ml-6">
                    <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: s.avg !== null ? `${s.avg}%` : '0%', background: s.avg !== null ? scoreColor(s.avg) : 'transparent' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Score Trend</h3>
            <p className="text-xs text-slate-500 mt-0.5">Every scored call in this window</p>
          </div>
          <ScoreChart dots={data.scoreTrend} />
          {data.recurringImprovements.length > 0 && (
            <div className="pt-3 border-t border-white/6">
              <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-2">Recurring coaching notes</p>
              <ul className="space-y-1.5">
                {data.recurringImprovements.map((item) => (
                  <li key={item.label} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 shrink-0 text-xs">•</span>
                    <span className="text-xs text-slate-400">{item.label}</span>
                    <span className="ml-auto text-[10px] text-slate-600 shrink-0">{item.count}×</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div><h3 className="text-sm font-semibold text-slate-200">Top Strengths</h3><p className="text-xs text-slate-500">What the AI consistently praises</p></div>
          {data.topStrengths.length === 0 ? <p className="text-xs text-slate-600">No data yet</p> : (
            <ul className="space-y-2">
              {data.topStrengths.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-slate-300 flex-1 leading-tight">{s.label}</span>
                  <span className="text-[10px] text-slate-500">{s.pct}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div><h3 className="text-sm font-semibold text-slate-200">Missed Opportunities</h3><p className="text-xs text-slate-500">Steps you skip — where deals slip away</p></div>
          {data.missedOpportunities.length === 0 ? <p className="text-xs text-slate-600">None logged — great work!</p> : (
            <ul className="space-y-2.5">
              {data.missedOpportunities.map((m) => (
                <li key={m.label}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="text-xs text-slate-300 flex-1 leading-tight">{m.label}</span>
                    <span className="text-[10px] text-red-400">{m.frequency}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5 ml-3.5"><div className="h-1 rounded-full bg-red-500/50" style={{ width: `${m.frequency}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div><h3 className="text-sm font-semibold text-slate-200">Top Objections</h3><p className="text-xs text-slate-500">Most frequent prospect pushback</p></div>
          {data.topObjections.length === 0 ? <p className="text-xs text-slate-600">No objections logged yet</p> : (
            <ul className="space-y-2">
              {data.topObjections.map((o, i) => (
                <li key={o.label} className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600 w-4">{i + 1}</span>
                  <span className="text-xs text-slate-300 flex-1 leading-tight">{o.label}</span>
                  <span className="text-[10px] text-slate-500">{o.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Morning Brief Tab ─────────────────────────────────────────────────────────

function BriefTab({ win }: { win: Window }) {
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    fetch(`/api/performance/brief?window=${win}`)
      .then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [win]);

  if (loading) return <Spinner />;
  if (!data || data.callCount === 0) return <EmptyCard msg={`No scored calls in the last ${win} days. Complete a live call to generate your Morning Brief.`} />;

  const trendColor = data.trendDirection === 'up' ? '#22c55e' : data.trendDirection === 'down' ? '#ef4444' : '#D4AF37';

  return (
    <div className="space-y-5">
      {/* AI Coach Summary Banner */}
      <div className="glass-card rounded-2xl p-5 border border-[#D4AF37]/20" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.06) 0%, transparent 60%)' }}>
        <p className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider mb-2">Your Morning Brief</p>
        {data.coachSummary ? (
          <p className="text-sm text-slate-200 leading-relaxed">{data.coachSummary}</p>
        ) : (
          <h3 className="text-lg font-bold text-slate-100">
            {data.trendDirection === 'up' ? 'You\'re improving — keep the momentum.' : data.trendDirection === 'down' ? 'Time to tighten up — here\'s your focus.' : 'Steady performance — here\'s your snapshot.'}
          </h3>
        )}
        <p className="text-xs text-slate-500 mt-2">Based on {data.callCount} calls over the last {win} days</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Avg Score" value={data.currentAvg !== null ? String(data.currentAvg) : '—'} sub={data.trendDelta !== null ? `${data.trendDelta > 0 ? '+' : ''}${data.trendDelta} vs prev period` : 'First period'} color={data.currentAvg !== null ? scoreColor(data.currentAvg) : '#64748b'} />
        <KpiCard label="Trend" value={data.trendDirection === 'up' ? 'Improving' : data.trendDirection === 'down' ? 'Declining' : data.trendDirection === 'flat' ? 'Steady' : '—'} sub={data.trendDelta !== null ? `${Math.abs(data.trendDelta)} pts` : 'No comparison'} color={trendColor} small />
        <KpiCard label="Strongest Skill" value={data.strongestSkill?.label ?? '—'} sub={data.strongestSkill ? `${data.strongestSkill.avg}/100` : ''} color="#22c55e" small />
        <KpiCard label="Biggest Gap" value={data.weakestSkill?.label ?? '—'} sub={data.weakestSkill ? `${data.weakestSkill.avg}/100` : ''} color="#ef4444" small />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Stage deltas */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Stage-by-Stage vs Last Period</h3>
          <div className="space-y-2.5">
            {data.stageDeltas.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-36 shrink-0">{s.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full" style={{ width: `${s.avg}%`, background: scoreColor(s.avg) }} />
                </div>
                <span className="text-xs font-bold w-8 text-right" style={{ color: scoreColor(s.avg) }}>{s.avg}</span>
                {s.delta !== null && (
                  <span className="text-[10px] w-10 text-right" style={{ color: s.delta > 0 ? '#22c55e' : s.delta < 0 ? '#ef4444' : '#64748b' }}>
                    {s.delta > 0 ? `+${s.delta}` : s.delta}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Closing trend + key signals */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Closing Score Trend</h3>
          {data.closingTrend.length > 1 ? (
            <ScoreChart dots={data.closingTrend} />
          ) : (
            <p className="text-xs text-slate-600">Not enough closing data to chart</p>
          )}

          <div className="pt-3 border-t border-white/6 space-y-3">
            {data.mostImprovedSkill && (
              <div className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">↑</span>
                <div>
                  <p className="text-xs font-medium text-slate-200">Most improved this period</p>
                  <p className="text-xs text-slate-400">{data.mostImprovedSkill.label} +{data.mostImprovedSkill.delta} pts vs last period</p>
                </div>
              </div>
            )}
            {data.topObjection && (
              <div className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">!</span>
                <div>
                  <p className="text-xs font-medium text-slate-200">Most common objection</p>
                  <p className="text-xs text-slate-400">{data.topObjection}</p>
                </div>
              </div>
            )}
            {data.topMissedDiscovery && (
              <div className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✕</span>
                <div>
                  <p className="text-xs font-medium text-slate-200">Most missed discovery step</p>
                  <p className="text-xs text-slate-400">{data.topMissedDiscovery}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {data.topFocus && (
        <div className="glass-card rounded-2xl p-5 border border-[#D4AF37]/15" style={{ background: 'rgba(212,175,55,0.04)' }}>
          <p className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">Top Recommended Coaching Focus</p>
          <p className="text-sm text-slate-200">{data.topFocus}</p>
        </div>
      )}
    </div>
  );
}

// ── Coaching Plan Tab ─────────────────────────────────────────────────────────

function CoachingTab() {
  const [plan, setPlan] = useState<CoachingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    fetch(`/api/performance/coaching-plan?window=7${refresh ? '&refresh=1' : ''}`)
      .then((r) => r.json())
      .then((d) => { setPlan(d); })
      .catch(() => setPlan(null))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  if (!plan || plan.error) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center space-y-3">
        <p className="text-sm text-slate-400">{plan?.error ?? 'Could not generate coaching plan.'}</p>
        <button onClick={() => load(true)} className="text-xs text-[#D4AF37] hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="glass-card rounded-2xl p-4 flex-1 border border-[#D4AF37]/15" style={{ background: 'rgba(212,175,55,0.04)' }}>
          <p className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">Personalized AI Coaching Plan</p>
          <p className="text-sm text-slate-200">{plan.overallMessage}</p>
          <p className="text-[10px] text-slate-600 mt-2">
            {plan.fromCache ? 'Cached today · ' : ''}
            {plan.generatedAt ? `Generated ${new Date(plan.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <button
          onClick={() => load(true)} disabled={refreshing}
          className="ml-3 shrink-0 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/8 disabled:opacity-40 transition-colors"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Top 3 Priorities for Today</h3>
        <div className="space-y-4">
          {(plan.top3Priorities ?? []).map((p, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-slate-950" style={{ background: i === 0 ? '#D4AF37' : i === 1 ? '#a78bfa' : '#64748b' }}>{i + 1}</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-200">{p.priority}</p>
                <p className="text-xs text-slate-400 mt-0.5">{p.why}</p>
                <p className="text-[11px] text-green-400 mt-1">Impact: {p.estimatedImpact}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Scripts to Practice</h3>
          <div className="space-y-4">
            {(plan.scriptsToPractice ?? []).map((s, i) => (
              <div key={i}>
                <p className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider mb-1.5">{s.scenario}</p>
                <div className="rounded-xl p-3 bg-white/3 border border-white/6">
                  <p className="text-xs text-slate-300 leading-relaxed italic">&ldquo;{s.script}&rdquo;</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Discovery Questions to Improve</h3>
          <ul className="space-y-2.5">
            {(plan.discoveryQuestionsToImprove ?? []).map((q, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#D4AF37] mt-0.5 shrink-0">→</span>
                <p className="text-xs text-slate-300 leading-relaxed">{q}</p>
              </li>
            ))}
          </ul>

          {plan.closingRecommendation && (
            <div className="pt-3 border-t border-white/6">
              <p className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider mb-1.5">Closing Recommendation</p>
              <p className="text-xs text-slate-300 leading-relaxed">{plan.closingRecommendation}</p>
            </div>
          )}
        </div>
      </div>

      {(plan.objectionHandlingFocus ?? []).length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Objection Handling Focus</h3>
          <div className="space-y-4">
            {plan.objectionHandlingFocus.map((o, i) => (
              <div key={i} className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="rounded-xl p-3 bg-red-500/8 border border-red-500/15">
                  <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">Prospect says</p>
                  <p className="text-xs text-slate-300">&ldquo;{o.objection}&rdquo;</p>
                </div>
                <div className="rounded-xl p-3 bg-green-500/8 border border-green-500/15">
                  <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-1">Your response</p>
                  <p className="text-xs text-slate-300 italic">&ldquo;{o.recommendedResponse}&rdquo;</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────────────────────────

const ALL_GOAL_TYPES: GoalType[] = [
  'calls_per_day', 'appointments_per_day', 'policies_per_day', 'applications_submitted',
  'target_close_rate', 'avg_call_score', 'avg_discovery_score', 'avg_rapport_score',
];

const GOAL_LABELS: Record<GoalType, string> = {
  calls_per_day:          'Calls per day',
  appointments_per_day:   'Appointments per day',
  policies_per_day:       'Policies written per day',
  applications_submitted: 'Applications submitted per day',
  target_close_rate:      'Close rate (30d %)',
  avg_call_score:         'Avg call score (30d)',
  avg_discovery_score:    'Avg discovery score (30d)',
  avg_rapport_score:      'Avg rapport score (30d)',
};

const GOAL_UNITS: Record<GoalType, string> = {
  calls_per_day:          'calls',
  appointments_per_day:   'appts',
  policies_per_day:       'policies',
  applications_submitted: 'apps',
  target_close_rate:      '%',
  avg_call_score:         'pts',
  avg_discovery_score:    'pts',
  avg_rapport_score:      'pts',
};

function GoalsTab() {
  const [data, setData] = useState<GoalsData | null>(null);
  const [streaks, setStreaks] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<GoalType | null>(null);
  const [targetInput, setTargetInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/performance/goals').then((r) => r.json()),
      fetch('/api/performance/streaks').then((r) => r.json()),
    ]).then(([g, s]) => { setData(g); setStreaks(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveGoal() {
    if (!adding || !targetInput) return;
    setSaving(true);
    await fetch('/api/performance/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_type: adding, target: parseFloat(targetInput) }),
    });
    setAdding(null); setTargetInput('');
    setSaving(false);
    load();
  }

  async function deleteGoal(goal_type: GoalType) {
    await fetch('/api/performance/goals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_type }),
    });
    load();
  }

  if (loading) return <Spinner />;

  const existingTypes = new Set(data?.goals.map((g) => g.goal_type) ?? []);
  const availableTypes = ALL_GOAL_TYPES.filter((t) => !existingTypes.has(t));

  return (
    <div className="space-y-5">
      {/* Streaks */}
      {streaks && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Streaks &amp; Activity</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
            <StreakCard label="Call streak" current={streaks.consecutiveCallDays} best={streaks.longestCallStreak} unit="days" color="#D4AF37" />
            <StreakCard label="High-score streak" current={streaks.consecutiveHighScoreDays} best={streaks.longestHighScoreStreak} unit="days" color="#22c55e" />
            <StreakCard label="Improvement streak" current={streaks.currentImprovementStreak} best={streaks.longestImprovementStreak} unit="days" color="#a78bfa" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <div className="rounded-xl p-4 bg-white/3 border border-white/6">
              <p className="text-[11px] text-slate-500 mb-1">Calls this week</p>
              <p className="text-2xl font-bold text-[#D4AF37]">{streaks.callsThisWeek}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">since Monday</p>
            </div>
            <div className="rounded-xl p-4 bg-white/3 border border-white/6">
              <p className="text-[11px] text-slate-500 mb-1">Policies this month</p>
              <p className="text-2xl font-bold text-green-400">{streaks.policiesThisMonth}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">written this month</p>
            </div>
            <div className="rounded-xl p-4 bg-white/3 border border-white/6">
              <p className="text-[11px] text-slate-500 mb-1">Active calling days</p>
              <p className="text-2xl font-bold text-slate-400">{streaks.totalCallDays}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">all time</p>
            </div>
          </div>
        </div>
      )}

      {/* Active goals */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Goals</h3>
          {availableTypes.length > 0 && !adding && (
            <button onClick={() => setAdding(availableTypes[0])} className="text-xs text-[#D4AF37] hover:underline">+ Add goal</button>
          )}
        </div>

        {/* Add goal form */}
        {adding && (
          <div className="rounded-xl p-4 bg-white/3 border border-[#D4AF37]/20 space-y-3">
            <div className="flex gap-2">
              <select
                value={adding}
                onChange={(e) => setAdding(e.target.value as GoalType)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#D4AF37]/40"
              >
                {availableTypes.map((t) => <option key={t} value={t} className="bg-slate-900">{GOAL_LABELS[t]}</option>)}
              </select>
              <input
                type="number" min="0.1" step="0.1" value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder="Target"
                className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#D4AF37]/40"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={saveGoal} disabled={saving || !targetInput} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#D4AF37] text-slate-950 disabled:opacity-40">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setAdding(null); setTargetInput(''); }} className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200">Cancel</button>
            </div>
          </div>
        )}

        {(!data?.goals || data.goals.length === 0) ? (
          <p className="text-xs text-slate-600 text-center py-4">No goals set yet. Click &ldquo;Add goal&rdquo; to set your first target.</p>
        ) : (
          <div className="space-y-5">
            {data.goals.map((g) => (
              <div key={g.id}>
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-xs text-slate-300 flex-1">{g.label ?? GOAL_LABELS[g.goal_type]}</span>
                  <span className="text-xs text-slate-400">{g.current} / {g.target} {GOAL_UNITS[g.goal_type]}</span>
                  <span className="text-xs font-bold" style={{ color: g.met ? '#22c55e' : '#D4AF37' }}>{g.pct}%</span>
                  {g.met && <span className="text-green-400 text-xs">✓</span>}
                  <button onClick={() => deleteGoal(g.goal_type)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
                </div>
                <div className="h-2 rounded-full bg-white/5">
                  <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${g.pct}%`, background: g.met ? '#22c55e' : '#D4AF37' }} />
                </div>
                <div className="flex items-center gap-4 mt-1.5">
                  {!g.met && g.remaining > 0 && (
                    <span className="text-[10px] text-slate-500">
                      {g.remaining} {GOAL_UNITS[g.goal_type]} remaining
                    </span>
                  )}
                  {g.estimatedDate && !g.met && (
                    <span className="text-[10px] text-slate-600">· {g.estimatedDate}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Insights Tab ──────────────────────────────────────────────────────────────

const INSIGHT_COLORS: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  strength:    { bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.2)',  dot: '#22c55e', label: 'Strength' },
  gap:         { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.2)',  dot: '#ef4444', label: 'Gap' },
  trend:       { bg: 'rgba(212,175,55,0.06)', border: 'rgba(212,175,55,0.2)', dot: '#D4AF37', label: 'Trend' },
  opportunity: { bg: 'rgba(167,139,250,0.06)',border: 'rgba(167,139,250,0.2)',dot: '#a78bfa', label: 'Opportunity' },
};

function InsightsTab({ win }: { win: Window }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    fetch(`/api/performance/insights?window=${win}`)
      .then((r) => r.json())
      .then((d) => { setData(d); })
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [win]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (data?.message && !data.insights?.length) return <EmptyCard msg={data.message} />;
  if (data?.error) return <EmptyCard msg={data.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {data?.callCount ?? 0} calls analyzed · All insights backed by real call data
        </p>
        <button onClick={() => load(true)} disabled={refreshing} className="text-xs text-[#D4AF37] hover:underline disabled:opacity-40">
          {refreshing ? 'Generating…' : 'Regenerate'}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {Object.entries(INSIGHT_COLORS).map(([cat, style]) => {
          const count = (data?.insights ?? []).filter((i) => i.category === cat).length;
          if (!count) return null;
          return (
            <span key={cat} className="text-[11px] px-2.5 py-1 rounded-full border font-medium" style={{ background: style.bg, borderColor: style.border, color: style.dot }}>
              {count} {style.label}{count !== 1 ? 's' : ''}
            </span>
          );
        })}
      </div>

      <div className="space-y-3">
        {(data?.insights ?? []).map((ins) => {
          const style = INSIGHT_COLORS[ins.category] ?? INSIGHT_COLORS.trend;
          return (
            <div key={ins.id} className="glass-card rounded-2xl p-4 border flex items-start gap-3" style={{ borderColor: style.border, background: style.bg }}>
              <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: style.dot }} />
              <div className="flex-1">
                <p className="text-sm text-slate-200 leading-snug">{ins.text}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: style.dot }}>{style.label}</span>
                  <span className="text-[10px] text-slate-600">{ins.metric}</span>
                  {ins.confidence === 'high' && <span className="text-[10px] text-slate-500">High confidence</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Trends Tab ────────────────────────────────────────────────────────────────

type TrendsWindow = '7' | '30' | '90' | 'all';

function TrendsTab({ win }: { win: Window }) {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tWin, setTWin] = useState<TrendsWindow>(win);

  const load = useCallback((w: TrendsWindow) => {
    setLoading(true);
    fetch(`/api/performance/trends?window=${w}`)
      .then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(tWin); }, [tWin, load]);

  const wins: { id: TrendsWindow; label: string }[] = [
    { id: '7', label: '7d' }, { id: '30', label: '30d' },
    { id: '90', label: '90d' }, { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-5">
      {/* Window selector */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 w-fit">
        {wins.map((w) => (
          <button key={w.id} onClick={() => setTWin(w.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tWin === w.id ? 'bg-[#D4AF37] text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>
            {w.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : !data || data.scoreCount === 0 ? (
        <EmptyCard msg="No scored call data in this window to display trends." />
      ) : (
        <div className="space-y-5">
          {/* Score over time */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Average Score Over Time</h3>
              <p className="text-xs text-slate-500 mt-0.5">{data.scoreCount} scored calls · daily average</p>
            </div>
            {data.avgScoreOverTime.length > 1 ? (
              <ScoreChart dots={data.avgScoreOverTime} />
            ) : (
              <p className="text-xs text-slate-600">Not enough data points to chart</p>
            )}
          </div>

          {/* 3-column metric charts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <TrendMetricCard
              title="Close Rate"
              subtitle="Policies written / calls per day"
              data={data.closeRateOverTime.map((d) => ({ date: d.date, score: d.rate }))}
              unit="%"
              color="#22c55e"
            />
            <TrendMetricCard
              title="Call Volume"
              subtitle="Completed calls per day"
              data={data.callVolume.map((d) => ({ date: d.date, score: d.count }))}
              unit="calls"
              color="#D4AF37"
              isBar
            />
            <TrendMetricCard
              title="Policies Written"
              subtitle="Policies per day"
              data={data.policiesPerDay.map((d) => ({ date: d.date, score: d.count }))}
              unit="policies"
              color="#a78bfa"
              isBar
            />
          </div>

          {/* Stage trends */}
          {data.stageTrends.length > 0 && (
            <div className="glass-card rounded-2xl p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Stage Score Trends</h3>
                <p className="text-xs text-slate-500 mt-0.5">Daily average for each key stage</p>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {data.stageTrends.map((s) => (
                  <div key={s.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-300">{s.label}</p>
                      {s.points.length > 0 && (
                        <p className="text-xs font-bold" style={{ color: scoreColor(s.points[s.points.length - 1]?.score ?? 0) }}>
                          {s.points[s.points.length - 1]?.score ?? '—'}
                        </p>
                      )}
                    </div>
                    <ScoreChart dots={s.points} compact />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrendMetricCard({ title, subtitle, data, unit, color, isBar }: {
  title: string; subtitle: string; data: ScoreDot[]; unit: string; color: string; isBar?: boolean;
}) {
  const latest = data[data.length - 1]?.score ?? null;
  const first = data[0]?.score ?? null;
  const delta = (latest !== null && first !== null) ? latest - first : null;

  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {latest !== null && (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold" style={{ color }}>{latest}</span>
          <span className="text-xs text-slate-500">{unit}</span>
          {delta !== null && delta !== 0 && (
            <span className="text-xs ml-1" style={{ color: delta > 0 ? '#22c55e' : '#ef4444' }}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          )}
        </div>
      )}
      {data.length > 1 ? (
        isBar ? <MiniBarChart data={data} color={color} /> : <ScoreChart dots={data} compact color={color} />
      ) : (
        <p className="text-xs text-slate-600 py-4">Not enough data</p>
      )}
    </div>
  );
}

// ── Achievements Tab ──────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  volume:      { bg: 'rgba(212,175,55,0.08)',  border: 'rgba(212,175,55,0.2)',  text: '#D4AF37' },
  quality:     { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   text: '#22c55e' },
  mastery:     { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', text: '#a78bfa' },
  consistency: { bg: 'rgba(56,189,248,0.08)',  border: 'rgba(56,189,248,0.2)',  text: '#38bdf8' },
};

function AchievementsTab() {
  const [data, setData] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');

  useEffect(() => {
    fetch('/api/performance/achievements')
      .then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data) return <EmptyCard msg="Could not load achievements." />;

  const filtered = filter === 'earned'
    ? data.achievements.filter((a) => a.earned)
    : filter === 'locked'
    ? data.achievements.filter((a) => !a.earned)
    : data.achievements;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Badges Earned" value={`${data.earned}/${data.total}`} sub="achievements unlocked" color="#D4AF37" />
        <KpiCard label="Total Calls" value={String(data.totalCalls)} sub="all time" color="#22c55e" />
        <KpiCard label="Policies Written" value={String(data.totalPolicies)} sub="all time" color="#a78bfa" />
        <KpiCard label="Best Score" value={data.bestScore > 0 ? String(data.bestScore) : '—'} sub="single call" color={data.bestScore > 0 ? scoreColor(data.bestScore) : '#64748b'} />
      </div>

      {/* Progress bar */}
      <div className="glass-card rounded-2xl p-5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Achievement Progress</h3>
          <span className="text-xs text-slate-400">{data.earned} / {data.total}</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/5">
          <div className="h-2.5 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#22c55e] transition-all duration-700"
            style={{ width: `${Math.round((data.earned / data.total) * 100)}%` }} />
        </div>
        <p className="text-xs text-slate-500">{Math.round((data.earned / data.total) * 100)}% complete</p>
      </div>

      {/* Filter */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 w-fit">
        {(['all', 'earned', 'locked'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${filter === f ? 'bg-[#D4AF37] text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Badges grid */}
      {(['volume', 'quality', 'mastery', 'consistency'] as const).map((cat) => {
        const catBadges = filtered.filter((a) => a.category === cat);
        if (!catBadges.length) return null;
        const style = CATEGORY_COLORS[cat];
        return (
          <div key={cat} className="glass-card rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold capitalize" style={{ color: style.text }}>
              {cat === 'volume' ? '📦 Volume' : cat === 'quality' ? '⚡ Quality' : cat === 'mastery' ? '🎓 Mastery' : '🗓️ Consistency'}
            </h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {catBadges.map((a) => (
                <div key={a.id} className={`rounded-2xl p-4 border transition-all ${a.earned ? '' : 'opacity-50 grayscale'}`}
                  style={{ background: a.earned ? style.bg : 'rgba(255,255,255,0.02)', borderColor: a.earned ? style.border : 'rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-200 truncate">{a.name}</p>
                        {a.earned && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}>Earned</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{a.description}</p>
                      {a.earnedAt && (
                        <p className="text-[10px] text-slate-600 mt-1">{new Date(a.earnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      )}
                    </div>
                  </div>
                  {!a.earned && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-500">{a.progressLabel}</span>
                        <span className="text-[10px] text-slate-500">{a.progress}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5">
                        <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${a.progress}%`, background: style.text }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Agency Team Tab ───────────────────────────────────────────────────────────

function AgencyTeamTab() {
  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [members, setMembers] = useState<AgencyMember[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agency').then((r) => r.json()).then((a) => {
      setAgency(a);
      if (a?.id) {
        fetch('/api/agency/members').then((r) => r.json()).then((d) => {
          setMembers(d?.members ?? []);
          setLoading(false);
        }).catch(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!agency?.id) return <EmptyCard msg="You are not part of an agency. Create or join one to see team performance." />;
  if (agency.role !== 'owner') return <EmptyCard msg="Team analytics are available to agency owners only." />;
  if (!members?.length) return <EmptyCard msg="No team members yet. Share your invite link to add agents." />;

  const sortedByScore = [...members].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
  const sortedByCalls = [...members].sort((a, b) => b.callCount - a.callCount);
  const sortedByClose = [...members].sort((a, b) => b.closeRate - a.closeRate);

  const teamAvgScore = members.filter((m) => m.avgScore !== null).reduce((a, m) => a + (m.avgScore ?? 0), 0) / (members.filter((m) => m.avgScore !== null).length || 1);
  const teamTotalCalls = members.reduce((a, m) => a + m.callCount, 0);
  const teamAvgClose = members.reduce((a, m) => a + m.closeRate, 0) / members.length;

  return (
    <div className="space-y-5">
      {/* Team KPIs */}
      <div className="glass-card rounded-2xl p-4 border border-[#D4AF37]/15" style={{ background: 'rgba(212,175,55,0.03)' }}>
        <p className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">{agency.name}</p>
        <p className="text-xs text-slate-500">{members.length} agent{members.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Team Avg Score" value={teamAvgScore > 0 ? String(Math.round(teamAvgScore)) : '—'} sub="across all agents" color={teamAvgScore > 0 ? scoreColor(teamAvgScore) : '#64748b'} />
        <KpiCard label="Total Team Calls" value={String(teamTotalCalls)} sub="all time" color="#D4AF37" />
        <KpiCard label="Avg Close Rate" value={`${Math.round(teamAvgClose)}%`} sub="30-day rolling" color="#22c55e" />
        <KpiCard label="Team Size" value={String(members.length)} sub="active agents" color="#a78bfa" />
      </div>

      {/* Leaderboard */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Score Leaderboard</h3>
        <div className="space-y-2">
          {sortedByScore.map((m, i) => (
            <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? 'bg-[#D4AF37]/8 border border-[#D4AF37]/20' : 'bg-white/2'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-[#D4AF37] text-slate-950' : i === 1 ? 'bg-slate-600 text-slate-200' : 'bg-white/8 text-slate-400'}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{m.name || m.email}</p>
                <p className="text-[10px] text-slate-500">{m.callCount} calls · {m.closeRate}% close rate</p>
              </div>
              {m.strongestStage && <span className="text-[10px] text-green-400 hidden xl:block">↑ {m.strongestStage}</span>}
              <TrendArrow dir={m.trend} />
              <span className="text-sm font-bold w-8 text-right" style={{ color: m.avgScore !== null ? scoreColor(m.avgScore) : '#64748b' }}>
                {m.avgScore ?? '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Most calls / best close rate */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Most Active</h3>
          <div className="space-y-2">
            {sortedByCalls.slice(0, 5).map((m, i) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-slate-600 w-4">{i + 1}</span>
                <span className="text-xs text-slate-300 flex-1 truncate">{m.name || m.email}</span>
                <span className="text-xs font-bold text-[#D4AF37]">{m.callCount}</span>
                <span className="text-[10px] text-slate-500">calls</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Best Close Rate</h3>
          <div className="space-y-2">
            {sortedByClose.slice(0, 5).map((m, i) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-slate-600 w-4">{i + 1}</span>
                <span className="text-xs text-slate-300 flex-1 truncate">{m.name || m.email}</span>
                <div className="flex-1 max-w-20 h-1.5 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full" style={{ width: `${m.closeRate}%`, background: '#22c55e' }} />
                </div>
                <span className="text-xs font-bold text-green-400">{m.closeRate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, small }: { label: string; value: string; sub: string; color: string; small?: boolean }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-bold leading-tight ${small ? 'text-base' : 'text-3xl'}`} style={{ color }}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

function StreakCard({ label, current, best, unit, color, hideStreak }: {
  label: string; current: number; best: number; unit: string; color: string; hideStreak?: boolean;
}) {
  return (
    <div className="rounded-xl p-4 bg-white/3 border border-white/6">
      <p className="text-[11px] text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{current}</p>
      <p className="text-[10px] text-slate-600 mt-0.5">{current} {unit} current</p>
      {!hideStreak && best > 0 && <p className="text-[10px] text-slate-600">Best: {best} {unit}</p>}
    </div>
  );
}

function ScoreChart({ dots, compact, color }: { dots: ScoreDot[]; compact?: boolean; color?: string }) {
  if (dots.length === 0) return <div className="h-16 flex items-center justify-center text-xs text-slate-600">No data</div>;
  const h = compact ? 60 : 90;
  const w = 300;
  const pad = 8;
  const minY = Math.min(0, ...dots.map((d) => d.score));
  const maxY = Math.max(100, ...dots.map((d) => d.score));
  const range = maxY - minY || 1;
  const pts = dots.map((d, i) => ({
    x: pad + (i / Math.max(dots.length - 1, 1)) * (w - pad * 2),
    y: h - pad - ((d.score - minY) / range) * (h - pad * 2),
    score: d.score, date: d.date,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `M ${pts[0].x} ${h} ${pts.map((p) => `L ${p.x} ${p.y}`).join(' ')} L ${pts[pts.length - 1].x} ${h} Z`;
  const lineColor = color ?? '#D4AF37';
  const y80 = h - pad - ((80 - minY) / range) * (h - pad * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: compact ? 60 : 100 }}>
        <defs>
          <linearGradient id={`sg-${compact ? 'c' : 'f'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {!compact && <line x1={pad} x2={w - pad} y1={y80} y2={y80} stroke="#22c55e" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.35" />}
        <path d={areaD} fill={`url(#sg-${compact ? 'c' : 'f'})`} />
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
        {!compact && pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={scoreColor(p.score)} />)}
      </svg>
      {!compact && (
        <div className="flex justify-between text-[10px] text-slate-600 px-1 mt-0.5">
          <span>{dots[0]?.date}</span>
          <span className="text-slate-500">— 80 target</span>
          <span>{dots[dots.length - 1]?.date}</span>
        </div>
      )}
    </div>
  );
}

function MiniBarChart({ data, color }: { data: ScoreDot[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.score), 1);
  const h = 60;
  const w = 300;
  const pad = 4;
  const barW = Math.max(2, (w - pad * 2) / data.length - 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 60 }}>
      {data.map((d, i) => {
        const barH = Math.max(2, ((d.score / max) * (h - pad * 2)));
        const x = pad + i * ((w - pad * 2) / data.length);
        return (
          <rect key={i} x={x} y={h - pad - barH} width={barW} height={barH}
            fill={color} opacity="0.7" rx="1" />
        );
      })}
    </svg>
  );
}
