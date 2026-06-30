import Link from 'next/link';

export const metadata = { title: 'Dashboard' };

const kpis = [
  { label: "Today's Calls",    value: '6',   sub: '2 policies written', color: '#D4AF37', icon: PhoneIcon },
  { label: 'Appointments',     value: '3',   sub: '1 in 45 minutes',    color: '#22c55e', icon: CalendarIcon },
  { label: 'Policies Written', value: '2',   sub: '$84/mo premium',     color: '#a78bfa', icon: ShieldIcon },
  { label: 'Avg Call Score',   value: '79%', sub: '+4pts this week',    color: '#06b6d4', icon: TrendIcon },
];

const recentCalls = [
  { name: 'Dorothy Williams', time: '2:30 PM',    score: 82, outcome: 'Policy Written',  cls: 'text-green-400' },
  { name: 'Robert Martinez',  time: '11:15 AM',   score: 51, outcome: 'Follow Up',       cls: 'text-amber-400' },
  { name: 'Helen Johnson',    time: 'Yesterday',  score: 91, outcome: 'Policy Written',  cls: 'text-green-400' },
  { name: 'James Thompson',   time: 'Yesterday',  score: 34, outcome: 'Not Interested',  cls: 'text-red-400' },
];

const upcomingAppts = [
  { name: 'Betty Crawford', time: '3:15 PM',            type: 'Phone' },
  { name: 'Earl Stevens',   time: '4:00 PM',            type: 'Phone' },
  { name: 'Marie Lopez',    time: 'Tomorrow 10:00 AM',  type: 'Phone' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="animate-fade-in-up">
        <h2 className="text-2xl font-bold text-slate-100">Good afternoon, Courtney</h2>
        <p className="text-sm text-slate-500 mt-1">You have 3 appointments today and 2 policies written this week.</p>
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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
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
              <div key={c.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                  {c.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.time}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-200">{c.score}</p>
                  <p className={`text-[10px] font-medium ${c.cls}`}>{c.outcome}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Appointments */}
        <div className="glass-card rounded-2xl p-5 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">Upcoming Appointments</h3>
            <span className="text-[10px] font-semibold text-[#D4AF37] bg-[rgba(212,175,55,0.1)] px-2 py-1 rounded-full">
              {upcomingAppts.length} today
            </span>
          </div>
          <div className="space-y-2">
            {upcomingAppts.map((a) => (
              <div key={a.name} className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/4 border border-white/6">
                <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.type} · {a.time}</p>
                </div>
                <Link href="/live-call"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-colors"
                  style={{ background: 'rgba(212,175,55,0.12)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.25)' }}>
                  Coach
                </Link>
              </div>
            ))}
          </div>
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
function CalendarIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
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
