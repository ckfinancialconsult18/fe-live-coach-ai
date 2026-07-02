import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Reports' };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default async function ReportsPage() {
  const supabase = await createClient();

  const today = startOfDay(new Date());
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - 6); // last 7 days inclusive

  const [{ data: calls, error: callsErr }, { data: scores, error: scoresErr }] = await Promise.all([
    supabase
      .from('calls')
      .select('id, started_at, outcome, status, transcript')
      .gte('started_at', rangeStart.toISOString())
      .order('started_at'),
    supabase
      .from('call_scores')
      .select('overall_score, created_at, call_id, summary')
      .gte('created_at', rangeStart.toISOString()),
  ]);

  const { data: { user } } = await supabase.auth.getUser();
  console.log('[reports] userId:', user?.id ?? 'unauthenticated',
    '| rangeStart:', rangeStart.toISOString(),
    '| calls query error:', callsErr?.message ?? 'none',
    '| scores query error:', scoresErr?.message ?? 'none',
    '| calls rows:', calls?.length ?? 0,
    '| scores rows:', scores?.length ?? 0);

  if (calls && calls.length > 0) {
    console.log('[reports] call statuses:', JSON.stringify([...new Set(calls.map((c) => c.status))]));
    const withTranscript = calls.filter((c) => Array.isArray(c.transcript) && c.transcript.length > 0);
    console.log('[reports] calls with non-empty transcript:', withTranscript.length, '/', calls.length);
  }
  if (scores && scores.length > 0) {
    console.log('[reports] score range: min', Math.min(...scores.map((s) => s.overall_score)),
      'max', Math.max(...scores.map((s) => s.overall_score)));
  }

  const scoreByCallId = new Map((scores ?? []).map((s) => [s.call_id, s.overall_score]));

  // Build 7 buckets ending today, in chronological order.
  const weeklyData = Array.from({ length: 7 }).map((_, i) => {
    const day = new Date(rangeStart);
    day.setDate(day.getDate() + i);
    const dayCalls = (calls ?? []).filter((c) => startOfDay(new Date(c.started_at)).getTime() === day.getTime());
    const dayScores = dayCalls.map((c) => scoreByCallId.get(c.id)).filter((s): s is number => s != null);
    const avgScore = dayScores.length ? Math.round(dayScores.reduce((a, b) => a + b, 0) / dayScores.length) : 0;
    return {
      day: DAY_LABELS[day.getDay()],
      calls: dayCalls.length,
      policies: dayCalls.filter((c) => c.outcome === 'policy_written').length,
      score: avgScore,
    };
  });

  const maxCalls = Math.max(1, ...weeklyData.map((d) => d.calls));
  const totalCalls = weeklyData.reduce((a, d) => a + d.calls, 0);
  const totalPolicies = weeklyData.reduce((a, d) => a + d.policies, 0);
  const scoredDays = weeklyData.filter((d) => d.score > 0);
  const avgScore = scoredDays.length ? Math.round(scoredDays.reduce((a, d) => a + d.score, 0) / scoredDays.length) : 0;
  const closeRate = totalCalls > 0 ? Math.round((totalPolicies / totalCalls) * 100) : 0;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Reports</h2>
        <p className="text-sm text-slate-500">Weekly performance summary</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Calls',    value: totalCalls,        color: '#D4AF37' },
          { label: 'Policies Written', value: totalPolicies,  color: '#22c55e' },
          { label: 'Close Rate',     value: closeRate + '%',  color: '#a78bfa' },
          { label: 'Avg Call Score', value: avgScore,         color: '#06b6d4' },
        ].map((k) => (
          <div key={k.label} className="glass-card rounded-2xl p-5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{k.label}</p>
            <p className="text-2xl font-extrabold mt-1" style={{ color: k.color }}>{k.value}</p>
            <p className="text-xs text-slate-500 mt-1">This week</p>
          </div>
        ))}
      </div>

      {/* Bar Chart */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Daily Calls This Week</h3>
        <div className="flex items-end gap-3 h-40">
          {weeklyData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500 font-medium">{d.calls}</span>
              <div
                className="w-full rounded-t-lg transition-all duration-700"
                style={{
                  height: `${(d.calls / maxCalls) * 120}px`,
                  background: 'linear-gradient(180deg, #D4AF37, #9a7a0a)',
                  opacity: 0.85,
                }}
              />
              <span className="text-[10px] text-slate-600">{d.day}</span>
            </div>
          ))}
        </div>
        {totalCalls === 0 && <p className="text-xs text-slate-600 text-center">No calls logged in the last 7 days</p>}
      </div>

      {/* Score trend */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Call Score by Day</h3>
        <div className="space-y-2">
          {weeklyData.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-8 shrink-0">{d.day}</span>
              <div className="flex-1 h-2 bg-white/5 rounded-full">
                <div
                  className="h-2 rounded-full transition-all duration-700"
                  style={{
                    width: `${d.score}%`,
                    background: d.score >= 80 ? '#22c55e' : d.score >= 65 ? '#D4AF37' : '#ef4444',
                  }}
                />
              </div>
              <span className="text-xs font-bold text-slate-300 w-7 text-right">{d.score}</span>
              <span className="text-xs text-slate-500 w-12 text-right">{d.policies} {d.policies === 1 ? 'policy' : 'policies'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
