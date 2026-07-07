/**
 * Trends — returns time-series data for all key performance metrics.
 * All data comes from real call_scores and calls records — no fabrication.
 * Supports window: 7 | 30 | 90 | all (365 days)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type ScoreRow = {
  overall_score: number;
  scores: Record<string, number> | null;
  created_at: string;
};

type CallRow = {
  id: string;
  outcome: string;
  started_at: string;
};

function toDay(iso: string): string {
  return iso.slice(0, 10);
}

function avg(vals: number[]): number {
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const winParam = req.nextUrl.searchParams.get('window') ?? '30';
  const days = winParam === 'all' ? 365 : parseInt(winParam, 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [{ data: scoreRows }, { data: callRows }] = await Promise.all([
    db.from('call_scores')
      .select('overall_score, scores, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true }),
    db.from('calls')
      .select('id, outcome, started_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('started_at', since.toISOString())
      .order('started_at', { ascending: true }),
  ]);

  const scores = (scoreRows ?? []) as ScoreRow[];
  const calls = (callRows ?? []) as CallRow[];

  // Per-call score over time
  const scoreOverTime = scores.map((r) => ({ date: toDay(r.created_at), score: r.overall_score }));

  // Daily avg score
  const avgScoreByDay = new Map<string, number[]>();
  scores.forEach((r) => {
    const d = toDay(r.created_at);
    if (!avgScoreByDay.has(d)) avgScoreByDay.set(d, []);
    avgScoreByDay.get(d)!.push(r.overall_score);
  });
  const avgScoreOverTime = [...avgScoreByDay.entries()].sort()
    .map(([date, vals]) => ({ date, score: avg(vals) }));

  // Call volume by day
  const callVolumeMap = new Map<string, number>();
  calls.forEach((c) => {
    const d = toDay(c.started_at);
    callVolumeMap.set(d, (callVolumeMap.get(d) ?? 0) + 1);
  });
  const callVolume = [...callVolumeMap.entries()].sort().map(([date, count]) => ({ date, count }));

  // Policies per day
  const policiesMap = new Map<string, number>();
  calls.forEach((c) => {
    if (c.outcome === 'policy_written') {
      const d = toDay(c.started_at);
      policiesMap.set(d, (policiesMap.get(d) ?? 0) + 1);
    }
  });
  const policiesPerDay = [...policiesMap.entries()].sort().map(([date, count]) => ({ date, count }));

  // Close rate by day (policies / calls on that day × 100)
  const closeRateMap = new Map<string, { policies: number; total: number }>();
  calls.forEach((c) => {
    const d = toDay(c.started_at);
    if (!closeRateMap.has(d)) closeRateMap.set(d, { policies: 0, total: 0 });
    const e = closeRateMap.get(d)!;
    e.total++;
    if (c.outcome === 'policy_written') e.policies++;
  });
  const closeRateOverTime = [...closeRateMap.entries()].sort()
    .map(([date, { policies, total }]) => ({
      date,
      rate: total > 0 ? Math.round((policies / total) * 100) : 0,
    }));

  // Stage trends — daily avg for key stages
  const STAGE_KEYS = [
    { key: 'discovery',  label: 'Discovery' },
    { key: 'rapport',    label: 'Rapport' },
    { key: 'closing',    label: 'Closing' },
    { key: 'objections', label: 'Objection Handling' },
    { key: 'budget',     label: 'Budget Talk' },
    { key: 'presentation', label: 'Presentation' },
  ];

  const stageDayMap = new Map<string, Map<string, number[]>>();
  scores.forEach((r) => {
    const d = toDay(r.created_at);
    if (!stageDayMap.has(d)) stageDayMap.set(d, new Map());
    const dm = stageDayMap.get(d)!;
    STAGE_KEYS.forEach(({ key }) => {
      const val = r.scores?.[key];
      if (typeof val === 'number') {
        if (!dm.has(key)) dm.set(key, []);
        dm.get(key)!.push(val);
      }
    });
  });

  const stageTrends = STAGE_KEYS.map(({ key, label }) => {
    const points = [...stageDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, dm]) => {
        const vals = dm.get(key);
        if (!vals?.length) return null;
        return { date, score: avg(vals) };
      })
      .filter((p): p is { date: string; score: number } => p !== null);
    return { key, label, points };
  }).filter((s) => s.points.length > 0);

  return NextResponse.json({
    window: days,
    callCount: calls.length,
    scoreCount: scores.length,
    scoreOverTime,
    avgScoreOverTime,
    callVolume,
    policiesPerDay,
    closeRateOverTime,
    stageTrends,
  });
}
