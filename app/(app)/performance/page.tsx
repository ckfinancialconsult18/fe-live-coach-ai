'use client';

import { useState, useEffect } from 'react';

type Window = '7' | '30' | '90';

interface StageRanking {
  key: string;
  label: string;
  avg: number | null;
  callCount: number;
  trend: 'up' | 'down' | 'flat';
}

interface FreqItem { label: string; count: number; pct?: number; frequency?: number }
interface ScoreDot { date: string; score: number }

interface PerfData {
  window: Window;
  callCount: number;
  avgOverall: number | null;
  scoreTrend: ScoreDot[];
  stageRankings: StageRanking[];
  ranked: StageRanking[];
  topStrengths: FreqItem[];
  missedOpportunities: (FreqItem & { frequency: number })[];
  topObjections: FreqItem[];
  recurringImprovements: FreqItem[];
}

function scoreColor(s: number) {
  return s >= 80 ? '#22c55e' : s >= 65 ? '#D4AF37' : '#ef4444';
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span className="text-green-400 text-xs">↑</span>;
  if (trend === 'down') return <span className="text-red-400 text-xs">↓</span>;
  return <span className="text-slate-600 text-xs">→</span>;
}

export default function PerformancePage() {
  const [win, setWin] = useState<Window>('30');
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/performance?window=${win}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [win]);

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Performance Engine</h2>
          <p className="text-sm text-slate-500 mt-1">Track every skill, spot every gap, and see exactly where deals are won or lost</p>
        </div>
        {/* Window selector */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 shrink-0">
          {(['7', '30', '90'] as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                win === w ? 'bg-[#D4AF37] text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin" />
        </div>
      ) : !data || data.callCount === 0 ? (
        <EmptyState win={win} />
      ) : (
        <PerfDashboard data={data} />
      )}
    </div>
  );
}

function EmptyState({ win }: { win: Window }) {
  return (
    <div className="glass-card rounded-2xl p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-400">No scored calls in the last {win} days</p>
      <p className="text-xs text-slate-600 mt-1">Complete a live call — the AI will score every stage and build your performance profile here.</p>
    </div>
  );
}

function PerfDashboard({ data }: { data: PerfData }) {
  const topStage = data.ranked[0];
  const bottomStage = data.ranked[data.ranked.length - 1];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Calls Analyzed"
          value={String(data.callCount)}
          sub={`Last ${data.window} days`}
          color="#D4AF37"
        />
        <KpiCard
          label="Avg Score"
          value={data.avgOverall !== null ? `${data.avgOverall}` : '—'}
          sub={data.avgOverall !== null ? (data.avgOverall >= 80 ? 'Excellent' : data.avgOverall >= 65 ? 'Good' : 'Needs work') : 'No data'}
          color={data.avgOverall !== null ? scoreColor(data.avgOverall) : '#64748b'}
        />
        <KpiCard
          label="Strongest Skill"
          value={topStage?.label ?? '—'}
          sub={topStage ? `Avg ${topStage.avg}` : 'No data'}
          color="#22c55e"
          small
        />
        <KpiCard
          label="Biggest Gap"
          value={bottomStage?.label ?? '—'}
          sub={bottomStage ? `Avg ${bottomStage.avg} — focus here` : 'No data'}
          color="#ef4444"
          small
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Skill rankings */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Skill Rankings</h3>
            <p className="text-xs text-slate-500 mt-0.5">All 9 call stages ranked by average score</p>
          </div>
          <div className="space-y-2.5">
            {data.stageRankings.map((s, i) => {
              const rank = data.ranked.findIndex((r) => r.key === s.key);
              const isTop = rank === 0;
              const isBottom = rank === data.ranked.length - 1 && data.ranked.length > 1;
              return (
                <div key={s.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] w-4 text-slate-600 text-right">{rank + 1}</span>
                    <span className="text-xs text-slate-300 flex-1">{s.label}</span>
                    <TrendIcon trend={s.trend} />
                    {isTop && <span className="text-[10px] text-green-400">★ best</span>}
                    {isBottom && <span className="text-[10px] text-red-400">⚠ gap</span>}
                    <span
                      className="text-xs font-bold w-8 text-right"
                      style={{ color: s.avg !== null ? scoreColor(s.avg) : '#475569' }}
                    >
                      {s.avg ?? '—'}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 ml-6">
                    <div
                      className="h-1.5 rounded-full transition-all duration-700"
                      style={{
                        width: s.avg !== null ? `${s.avg}%` : '0%',
                        background: s.avg !== null ? scoreColor(s.avg) : 'transparent',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Score trend sparkline */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Score Trend</h3>
            <p className="text-xs text-slate-500 mt-0.5">Overall score across every call in this window</p>
          </div>
          <ScoreChart dots={data.scoreTrend} />

          {/* Recurring improvements */}
          {data.recurringImprovements.length > 0 && (
            <div className="pt-4 border-t border-white/6">
              <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-2">Recurring coaching notes</p>
              <ul className="space-y-1.5">
                {data.recurringImprovements.map((item) => (
                  <li key={item.label} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 shrink-0 text-xs">•</span>
                    <span className="text-xs text-slate-400">{item.label}</span>
                    <span className="ml-auto text-[10px] text-slate-600 shrink-0">{item.count}× flagged</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Strengths */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Top Strengths</h3>
            <p className="text-xs text-slate-500 mt-0.5">What the AI consistently praises</p>
          </div>
          {data.topStrengths.length === 0 ? (
            <p className="text-xs text-slate-600">No strength data yet</p>
          ) : (
            <ul className="space-y-2">
              {data.topStrengths.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-slate-300 flex-1 leading-tight">{s.label}</span>
                  <span className="text-[10px] text-slate-500">{s.pct}% of calls</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Missed opportunities */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Missed Opportunities</h3>
            <p className="text-xs text-slate-500 mt-0.5">Steps you skip — where deals slip away</p>
          </div>
          {data.missedOpportunities.length === 0 ? (
            <p className="text-xs text-slate-600">No missed opportunities logged — great work!</p>
          ) : (
            <ul className="space-y-2.5">
              {data.missedOpportunities.map((m) => (
                <li key={m.label}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="text-xs text-slate-300 flex-1 leading-tight">{m.label}</span>
                    <span className="text-[10px] text-red-400">{m.frequency}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5 ml-3.5">
                    <div className="h-1 rounded-full bg-red-500/50" style={{ width: `${m.frequency}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top objections */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Top Objections</h3>
            <p className="text-xs text-slate-500 mt-0.5">Most frequent prospect pushback</p>
          </div>
          {data.topObjections.length === 0 ? (
            <p className="text-xs text-slate-600">No objections logged yet</p>
          ) : (
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

function KpiCard({ label, value, sub, color, small }: {
  label: string; value: string; sub: string; color: string; small?: boolean;
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p
        className={`font-bold leading-tight ${small ? 'text-base' : 'text-3xl'}`}
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

function ScoreChart({ dots }: { dots: ScoreDot[] }) {
  if (dots.length === 0) {
    return <div className="h-32 flex items-center justify-center text-xs text-slate-600">No data</div>;
  }

  const h = 100;
  const w = 300;
  const pad = 10;
  const minY = Math.min(0, ...dots.map((d) => d.score));
  const maxY = Math.max(100, ...dots.map((d) => d.score));
  const range = maxY - minY || 1;

  const pts = dots.map((d, i) => {
    const x = pad + (i / Math.max(dots.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((d.score - minY) / range) * (h - pad * 2);
    return { x, y, score: d.score, date: d.date };
  });

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `M ${pts[0].x} ${h} ${pts.map((p) => `L ${p.x} ${p.y}`).join(' ')} L ${pts[pts.length - 1].x} ${h} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 120 }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 80 line */}
        <line
          x1={pad} x2={w - pad}
          y1={h - pad - ((80 - minY) / range) * (h - pad * 2)}
          y2={h - pad - ((80 - minY) / range) * (h - pad * 2)}
          stroke="#22c55e" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.3"
        />
        <path d={areaD} fill="url(#scoreGrad)" />
        <path d={pathD} fill="none" stroke="#D4AF37" strokeWidth="1.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={scoreColor(p.score)} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-1">
        <span>{dots[0]?.date}</span>
        <span className="text-slate-500">— 80 target</span>
        <span>{dots[dots.length - 1]?.date}</span>
      </div>
    </div>
  );
}
