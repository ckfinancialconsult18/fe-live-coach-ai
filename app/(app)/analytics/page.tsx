import { createClient } from '@/lib/supabase/server';
import { AICoachingPanel } from '@/components/AICoachingPanel';

export const metadata = { title: 'Analytics' };

const STAGE_KEYS = [
  ['introduction', 'Introduction'],
  ['permission', 'Permission'],
  ['discovery', 'Discovery'],
  ['existingCoverage', 'Existing Coverage'],
  ['health', 'Health'],
  ['budget', 'Budget'],
  ['presentation', 'Presentation'],
  ['objections', 'Objections'],
  ['closing', 'Close'],
] as const;

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: scores } = await supabase
    .from('call_scores')
    .select('scores, objections, strengths')
    .gte('created_at', since.toISOString());

  const rows = scores ?? [];

  const stageScores = STAGE_KEYS.map(([key, label]) => {
    const values = rows
      .map((r) => (r.scores as Record<string, number> | null)?.[key])
      .filter((v): v is number => typeof v === 'number');
    const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    return { stage: label, score: avg, hasData: values.length > 0 };
  });

  // Aggregate objection frequency from free-text objections logged per call.
  const objectionCounts = new Map<string, number>();
  rows.forEach((r) => {
    (r.objections ?? []).forEach((o: string) => {
      objectionCounts.set(o, (objectionCounts.get(o) ?? 0) + 1);
    });
  });
  const maxObjectionCount = Math.max(1, ...Array.from(objectionCounts.values()));
  const topObjections = Array.from(objectionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count, pct: Math.round((count / maxObjectionCount) * 100) }));

  const weakestStage = stageScores.filter((s) => s.hasData).sort((a, b) => a.score - b.score)[0];

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
                    {s.hasData ? s.score : '—'}
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
          {weakestStage && (
            <div className="pt-2 border-t border-white/6">
              <p className="text-[10px] text-amber-400">
                ⚡ {weakestStage.stage} needs the most work ({weakestStage.score}). Focus role play sessions here.
              </p>
            </div>
          )}
          {!weakestStage && (
            <p className="text-xs text-slate-600 text-center py-2">No scored calls in the last 30 days</p>
          )}
        </div>

        {/* Objections */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Top Objections</h3>
          <p className="text-xs text-slate-500">Frequency over the last 30 days</p>
          <div className="space-y-4">
            {topObjections.map((o) => (
              <div key={o.label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{o.label}</span>
                  <span className="text-[10px] text-slate-500">{o.count}x</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full bg-red-500/60" style={{ width: `${o.pct}%` }} />
                </div>
              </div>
            ))}
            {topObjections.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-2">No objections logged in the last 30 days</p>
            )}
          </div>
        </div>
      </div>

      <AICoachingPanel />
    </div>
  );
}
