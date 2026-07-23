import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard' };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
}
function daysAgo(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(base.getDate() - n);
  return d;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  // Rolling analytics windows: last 7 days vs the 7 days before that.
  const last7Start = startOfDay(daysAgo(today, 6));
  const prev7Start = startOfDay(daysAgo(today, 13));

  const [callsToday, scoresTwoWeeks, recentCallsRaw] = await Promise.all([
    supabase.from('calls').select('id, outcome').gte('started_at', todayStart).lte('started_at', todayEnd),
    supabase.from('call_scores').select('overall_score, created_at').gte('created_at', prev7Start).order('created_at'),
    supabase.from('calls').select('id, contact_id, started_at, outcome, call_scores(overall_score)').order('started_at', { ascending: false }).limit(5),
  ]);

  const contactIds = (recentCallsRaw.data ?? [])
    .map((c) => c.contact_id)
    .filter((id): id is string => !!id);
  const { data: contacts } = contactIds.length
    ? await supabase.from('contacts').select('id, first_name, last_name').in('id', contactIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const contactName = (id: string | null) => {
    const c = contacts?.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : 'Unknown';
  };

  // ── Performance analytics from the last two weeks of call scores ────────────
  const allScores = scoresTwoWeeks.data ?? [];
  const last7 = allScores.filter((s) => s.created_at >= last7Start);
  const prev7 = allScores.filter((s) => s.created_at < last7Start);
  const avg = (rows: { overall_score: number | null }[]) =>
    rows.length ? Math.round(rows.reduce((s, r) => s + (r.overall_score ?? 0), 0) / rows.length) : null;

  const avg7 = avg(last7);
  const avgPrev7 = avg(prev7);
  const delta = avg7 !== null && avgPrev7 !== null ? avg7 - avgPrev7 : null;
  const best7 = last7.length ? Math.max(...last7.map((s) => s.overall_score ?? 0)) : null;
  const todayScores = last7.filter((s) => s.created_at >= todayStart);
  const avgToday = avg(todayScores);

  // Daily average bars for the last 7 days (oldest → newest)
  const dailyBars = Array.from({ length: 7 }, (_, i) => {
    const day = daysAgo(today, 6 - i);
    const dStart = startOfDay(day);
    const dEnd = endOfDay(day);
    const rows = last7.filter((s) => s.created_at >= dStart && s.created_at <= dEnd);
    return {
      label: day.toLocaleDateString('en-US', { weekday: 'narrow' }),
      isToday: i === 6,
      avg: avg(rows),
      count: rows.length,
    };
  });

  const kpis = [
    { label: "Today's Calls", value: String((callsToday.data ?? []).length), sub: `${last7.length} scored in last 7 days`, color: '#D4AF37', icon: PhoneIcon },
    { label: "Today's Avg Score", value: avgToday !== null ? `${avgToday}%` : '—', sub: todayScores.length ? `across ${todayScores.length} call${todayScores.length === 1 ? '' : 's'}` : 'No scored calls yet', color: '#22c55e', icon: TargetIcon },
    {
      label: '7-Day Avg Score',
      value: avg7 !== null ? `${avg7}%` : '—',
      sub: delta === null ? 'vs prior week: no data' : delta === 0 ? 'even with prior week' : delta > 0 ? `▲ +${delta} vs prior week` : `▼ ${delta} vs prior week`,
      color: '#06b6d4',
      icon: TrendIcon,
    },
    { label: 'Best Call', value: best7 !== null ? `${best7}%` : '—', sub: 'past 7 days', color: '#a78bfa', icon: StarIcon },
  ];

  const recentCalls = (recentCallsRaw.data ?? []).map((c) => ({
    id: c.id,
    name: contactName(c.contact_id),
    time: fmtTime(c.started_at),
    score: (c.call_scores as unknown as { overall_score: number }[] | null)?.[0]?.overall_score ?? null,
    outcome: c.outcome ?? 'pending',
  }));

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="animate-fade-in-up">
        <h2 className="text-2xl font-bold text-slate-100">Good afternoon{user?.email ? `, ${user.email.split('@')[0]}` : ''}</h2>
        <p className="text-sm text-slate-500 mt-1">
          {(callsToday.data ?? []).length} call{(callsToday.data ?? []).length === 1 ? '' : 's'} coached today
          {avg7 !== null ? ` · ${avg7}% average score this week` : ''}
        </p>
      </div>

      {/* Start Call CTA */}
      <Link
        href="/live-call"
        className="flex items-center justify-between p-5 rounded-2xl border animate-fade-in-up group transition-all hover:scale-[1.01] active:scale-100"
        style={{ background: 'linear-gradient(135deg,rgba(212,175,55,0.12),rgba(184,148,15,0.06))', borderColor: 'rgba(212,175,55,0.3)' }}
      >
        <div>
          <p className="text-lg font-bold text-[#D4AF37]">Start a Live Call</p>
          <p className="text-sm text-slate-400 mt-1">AI coaching activates the moment you begin speaking</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-live" />
            READY
          </span>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[#090d18] group-hover:scale-110 transition-transform"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/>
            </svg>
          </div>
        </div>
      </Link>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className={`glass-card rounded-2xl p-5 animate-fade-in-up stagger-${i + 1}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{k.label}</p>
                  <p className="text-2xl font-extrabold text-slate-100 mt-1">{k.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{k.sub}</p>
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: k.color + '18', color: k.color }}>
                  <Icon />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Calls */}
        <div className="glass-card rounded-2xl p-5 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">Recent Calls</h3>
            <Link href="/past-calls" className="text-xs text-[#D4AF37] hover:text-[#eec94a] transition-colors">View all</Link>
          </div>
          <div className="space-y-2">
            {recentCalls.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                  {c.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.time}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-200">{c.score ?? '—'}</p>
                  <p className="text-[10px] font-medium text-slate-400">{c.outcome.replace(/_/g, ' ')}</p>
                </div>
              </div>
            ))}
            {recentCalls.length === 0 && <p className="text-sm text-slate-600 text-center py-6">No calls yet</p>}
          </div>
        </div>

        {/* Performance Trend — daily average scores, last 7 days */}
        <div className="glass-card rounded-2xl p-5 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">Performance Trend</h3>
            <Link href="/performance" className="text-xs text-[#D4AF37] hover:text-[#eec94a] transition-colors">Full report</Link>
          </div>
          {last7.length > 0 ? (
            <>
              <div className="flex items-end justify-between gap-2 h-32 px-1">
                {dailyBars.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    {d.avg !== null && (
                      <span className="text-[10px] font-bold text-slate-400">{d.avg}</span>
                    )}
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: d.avg !== null ? `${Math.max(6, d.avg)}%` : '3px',
                        background: d.avg === null
                          ? 'rgba(255,255,255,0.06)'
                          : d.isToday
                            ? 'linear-gradient(180deg,#D4AF37,#9a7a0a)'
                            : 'rgba(212,175,55,0.35)',
                      }}
                      title={d.avg !== null ? `${d.avg}% avg across ${d.count} call${d.count === 1 ? '' : 's'}` : 'No scored calls'}
                    />
                    <span className={`text-[10px] font-medium ${d.isToday ? 'text-[#D4AF37]' : 'text-slate-600'}`}>{d.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between flex-wrap gap-y-1 mt-4 pt-3 border-t border-white/6 text-xs">
                <span className="text-slate-500">This week <span className="font-bold text-slate-300">{avg7 ?? '—'}%</span></span>
                <span className="text-slate-500">Prior week <span className="font-bold text-slate-300">{avgPrev7 ?? '—'}%</span></span>
                {delta !== null && (
                  <span className={`font-bold ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '—'}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-600 text-center py-10">
              Complete a few coached calls and your score trend will appear here
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/>
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>
    </svg>
  );
}
function StarIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  );
}
