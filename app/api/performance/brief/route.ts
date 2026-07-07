/**
 * Morning Brief — computed entirely from stored call_scores, no AI call.
 * Returns a snapshot of the agent's performance for the chosen window vs the
 * previous period of the same length so every metric has a delta.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const STAGE_KEYS = [
  { key: 'introduction',     label: 'Opening / Intro' },
  { key: 'permission',       label: 'Permission' },
  { key: 'discovery',        label: 'Discovery Questions' },
  { key: 'existingCoverage', label: 'Existing Coverage' },
  { key: 'health',           label: 'Health Questions' },
  { key: 'budget',           label: 'Budget Talk' },
  { key: 'presentation',     label: 'Presentation' },
  { key: 'objections',       label: 'Objection Handling' },
  { key: 'closing',          label: 'Closing' },
] as const;

function daysBefore(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

type ScoreRow = {
  overall_score: number;
  scores: Record<string, number> | null;
  strengths: string[];
  missed_opportunities: string[];
  objections: string[];
  report_details: { closingScore?: number } | null;
  created_at: string;
};

function avgScores(rows: ScoreRow[]) {
  if (!rows.length) return null;
  return Math.round(rows.reduce((a, r) => a + r.overall_score, 0) / rows.length);
}

function topEntry(map: Map<string, number>): string | null {
  if (!map.size) return null;
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function stageSummary(rows: ScoreRow[]) {
  return STAGE_KEYS.map(({ key, label }) => {
    const vals = rows.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number');
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    return { key, label, avg };
  }).filter((s) => s.avg !== null) as { key: string; label: string; avg: number }[];
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const days = parseInt(req.nextUrl.searchParams.get('window') ?? '30', 10);
  const currentSince = daysBefore(days);
  const prevSince = daysBefore(days * 2);

  const db = supabase as any;

  // Fetch current + previous window in one query then split
  const { data: allRows } = await db
    .from('call_scores')
    .select('overall_score, scores, strengths, missed_opportunities, objections, report_details, created_at')
    .eq('user_id', user.id)
    .gte('created_at', prevSince)
    .order('created_at', { ascending: true });

  const rows: ScoreRow[] = allRows ?? [];
  const current = rows.filter((r) => r.created_at >= currentSince);
  const previous = rows.filter((r) => r.created_at < currentSince);

  const currentAvg = avgScores(current);
  const previousAvg = avgScores(previous);
  const trendDelta = currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : null;

  // Stage analysis
  const currentStages = stageSummary(current);
  const previousStages = stageSummary(previous);

  const stageDeltas = currentStages.map((cs) => {
    const ps = previousStages.find((s) => s.key === cs.key);
    return { ...cs, delta: ps ? cs.avg - ps.avg : null };
  });

  const sorted = [...stageDeltas].sort((a, b) => b.avg - a.avg);
  const strongestSkill = sorted[0] ?? null;
  const weakestSkill = sorted[sorted.length - 1] ?? null;

  // Biggest improvement (largest positive delta)
  const biggestImprovement = [...stageDeltas]
    .filter((s) => s.delta !== null)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0] ?? null;

  // Most common objection
  const objMap = new Map<string, number>();
  current.forEach((r) => r.objections?.forEach((o: string) => objMap.set(o, (objMap.get(o) ?? 0) + 1)));
  const topObjection = topEntry(objMap);

  // Most frequently missed discovery question (from missed_opportunities)
  const discoverKeywords = ['discovery', 'question', 'beneficiar', 'existing', 'budget', 'health'];
  const missMap = new Map<string, number>();
  current.forEach((r) =>
    r.missed_opportunities?.forEach((m: string) => {
      const lower = m.toLowerCase();
      if (discoverKeywords.some((kw) => lower.includes(kw))) {
        missMap.set(m.slice(0, 80), (missMap.get(m.slice(0, 80)) ?? 0) + 1);
      }
    })
  );
  const topMissedDiscovery = topEntry(missMap);

  // Close probability trend: use closing stage score over time
  const closingTrend = current.map((r) => ({
    date: r.created_at.slice(0, 10),
    score: r.scores?.['closing'] ?? r.report_details?.closingScore ?? null,
  })).filter((d) => d.score !== null) as { date: string; score: number }[];

  // Top coaching focus = weakest stage
  const topFocus = weakestSkill
    ? `Focus on ${weakestSkill.label} — your average is ${weakestSkill.avg}/100. Drill this in role play before your next call.`
    : null;

  return NextResponse.json({
    window: days,
    callCount: current.length,
    currentAvg,
    previousAvg,
    trendDelta,
    trendDirection: trendDelta === null ? 'unknown' : trendDelta > 2 ? 'up' : trendDelta < -2 ? 'down' : 'flat',
    strongestSkill,
    weakestSkill,
    biggestImprovement,
    topObjection,
    topMissedDiscovery,
    closingTrend,
    topFocus,
    stageDeltas,
  });
}
