export const metadata = { title: 'Analytics' };

const topObjections = [
  { label: 'Need to think about it', count: 34, pct: 82, handled: 71 },
  { label: 'Already have insurance', count: 28, pct: 67, handled: 89 },
  { label: 'Too expensive',          count: 22, pct: 53, handled: 64 },
  { label: 'Need to talk to spouse', count: 18, pct: 43, handled: 78 },
  { label: 'Not interested',         count: 12, pct: 29, handled: 42 },
];

const stageScores = [
  { stage: 'Introduction',    score: 88 },
  { stage: 'Permission',      score: 84 },
  { stage: 'Discovery',       score: 76 },
  { stage: 'Existing Coverage', score: 71 },
  { stage: 'Health',          score: 82 },
  { stage: 'Budget',          score: 58 },
  { stage: 'Presentation',    score: 72 },
  { stage: 'Objections',      score: 65 },
  { stage: 'Close',           score: 61 },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Analytics</h2>
        <p className="text-sm text-slate-500">AI-powered performance insights — last 30 days</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Stage Performance */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Average Score by Call Stage</h3>
          <p className="text-xs text-slate-500">Identify exactly where you lose momentum</p>
          <div className="space-y-3">
            {stageScores.map((s) => (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">{s.stage}</span>
                  <span className="text-xs font-bold" style={{ color: s.score >= 80 ? '#22c55e' : s.score >= 65 ? '#D4AF37' : '#ef4444' }}>
                    {s.score}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div
                    className="h-1.5 rounded-full transition-all duration-700"
                    style={{
                      width: `${s.score}%`,
                      background: s.score >= 80 ? '#22c55e' : s.score >= 65 ? 'linear-gradient(90deg,#9a7a0a,#D4AF37)' : '#ef4444',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-white/6">
            <p className="text-[10px] text-amber-400">
              ⚡ Budget and Close stages need the most work. Focus role play sessions here.
            </p>
          </div>
        </div>

        {/* Objections */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Top Objections</h3>
          <p className="text-xs text-slate-500">Frequency and handle rate</p>
          <div className="space-y-4">
            {topObjections.map((o) => (
              <div key={o.label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{o.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{o.count}x</span>
                    <span className="text-[10px] font-semibold" style={{ color: o.handled >= 75 ? '#22c55e' : '#D4AF37' }}>
                      {o.handled}% handled
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <div className="h-1.5 rounded-full bg-white/5 flex-1">
                    <div className="h-1.5 rounded-full bg-red-500/60" style={{ width: `${o.pct}%` }} />
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5" style={{ width: '60px' }}>
                    <div className="h-1.5 rounded-full bg-green-500/60" style={{ width: `${o.handled}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500/60" />
              <span className="text-[10px] text-slate-500">Frequency</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500/60" />
              <span className="text-[10px] text-slate-500">Handle Rate</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="glass-card rounded-2xl p-5 space-y-4" style={{ border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.04)' }}>
        <h3 className="text-sm font-semibold text-[#D4AF37]">🤖 AI Recommendations</h3>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {[
            { title: 'Improve Budget Stage', desc: 'Your budget score (58) is your weakest stage. Practice asking "What monthly amount would feel comfortable?" and then staying silent. Role play this daily.' },
            { title: 'Close Rate Opportunity', desc: 'You hear "I already have insurance" 28% of the time but convert 89% when you probe properly. This objection is your best opportunity — lean into it.' },
            { title: 'Talk Less, Close More', desc: 'On your top-scoring calls, you listened 64% of the time. On lost calls, you talked 58%. Let silence work for you.' },
          ].map((r) => (
            <div key={r.title} className="space-y-2">
              <p className="text-xs font-bold text-slate-200">{r.title}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
