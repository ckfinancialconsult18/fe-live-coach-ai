export const metadata = { title: 'Reports' };

const weeklyData = [
  { day: 'Mon', calls: 8, policies: 2, score: 74 },
  { day: 'Tue', calls: 6, policies: 1, score: 68 },
  { day: 'Wed', calls: 10, policies: 3, score: 81 },
  { day: 'Thu', calls: 7, policies: 2, score: 79 },
  { day: 'Fri', calls: 9, policies: 2, score: 76 },
  { day: 'Sat', calls: 4, policies: 1, score: 83 },
  { day: 'Sun', calls: 2, policies: 0, score: 70 },
];

const maxCalls = Math.max(...weeklyData.map((d) => d.calls));

export default function ReportsPage() {
  const totalCalls = weeklyData.reduce((a, d) => a + d.calls, 0);
  const totalPolicies = weeklyData.reduce((a, d) => a + d.policies, 0);
  const avgScore = Math.round(weeklyData.reduce((a, d) => a + d.score, 0) / weeklyData.length);
  const closeRate = Math.round((totalPolicies / totalCalls) * 100);

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
          {weeklyData.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
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
      </div>

      {/* Score trend */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Call Score by Day</h3>
        <div className="space-y-2">
          {weeklyData.map((d) => (
            <div key={d.day} className="flex items-center gap-3">
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
