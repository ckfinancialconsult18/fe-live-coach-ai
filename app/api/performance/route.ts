import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type Window = '7' | '30' | '90';

const STAGE_KEYS = [
  { key: 'introduction',      label: 'Opening / Intro' },
  { key: 'permission',        label: 'Permission' },
  { key: 'discovery',         label: 'Discovery Questions' },
  { key: 'existingCoverage',  label: 'Existing Coverage' },
  { key: 'health',            label: 'Health Questions' },
  { key: 'budget',            label: 'Budget Talk' },
  { key: 'presentation',      label: 'Presentation' },
  { key: 'objections',        label: 'Objection Handling' },
  { key: 'closing',           label: 'Closing' },
] as const;

// Common missed opportunity patterns to look for in the text arrays
const OPPORTUNITY_PATTERNS: { id: string; label: string; keywords: string[] }[] = [
  { id: 'beneficiary',       label: 'Asked about beneficiary',      keywords: ['beneficiar'] },
  { id: 'existing_coverage', label: 'Checked existing coverage',    keywords: ['existing', 'already have', 'current policy', 'coverage now'] },
  { id: 'health_questions',  label: 'Completed health questions',   keywords: ['health', 'medic', 'condition', 'hospitaliz'] },
  { id: 'budget_anchor',     label: 'Anchored monthly budget',      keywords: ['budget', 'monthly', 'comfortable', 'afford', 'per month'] },
  { id: 'assumptive_close',  label: 'Used assumptive close',        keywords: ['go ahead', 'get that started', 'get you protected', 'set that up'] },
  { id: 'referral_ask',      label: 'Asked for referral',           keywords: ['referral', 'know anyone', 'friend', 'family member who'] },
];

function daysSince(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const win = (req.nextUrl.searchParams.get('window') ?? '30') as Window;
  const days = win === '7' ? 7 : win === '90' ? 90 : 30;
  const since = daysSince(days);

  const { data: rows } = await (supabase as any)
    .from('call_scores')
    .select('overall_score, scores, strengths, missed_opportunities, objections, improvement_plan, created_at, quality_scores, report_details')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  const data = (rows ?? []) as Array<{
    overall_score: number;
    scores: Record<string, number> | null;
    strengths: string[];
    missed_opportunities: string[];
    objections: string[];
    improvement_plan: unknown;
    quality_scores: Record<string, number> | null;
    report_details: Record<string, unknown> | null;
    created_at: string;
  }>;

  const callCount = data.length;

  // ── Stage skill rankings ──────────────────────────────────────────────────
  const stageRankings = STAGE_KEYS.map(({ key, label }) => {
    const values = data
      .map((r) => r.scores?.[key])
      .filter((v): v is number => typeof v === 'number');
    const avg = values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null;
    // Trend: compare first half vs second half of window
    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);
    const firstAvg = firstHalf.length ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : null;
    const secondAvg = secondHalf.length ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : null;
    const trend: 'up' | 'down' | 'flat' =
      firstAvg === null || secondAvg === null ? 'flat'
      : secondAvg - firstAvg > 3 ? 'up'
      : firstAvg - secondAvg > 3 ? 'down'
      : 'flat';
    return { key, label, avg, callCount: values.length, trend };
  });

  const ranked = [...stageRankings]
    .filter((s) => s.avg !== null)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));

  // ── Overall score trend (per-call for chart) ──────────────────────────────
  const scoreTrend = data.map((r) => ({
    date: r.created_at.slice(0, 10),
    score: r.overall_score,
  }));

  // ── Average overall score ─────────────────────────────────────────────────
  const avgOverall = callCount
    ? Math.round(data.reduce((a, r) => a + r.overall_score, 0) / callCount)
    : null;

  // ── Top strengths (frequency count across all calls) ─────────────────────
  const strengthMap = new Map<string, number>();
  data.forEach((r) => {
    (r.strengths ?? []).forEach((s: string) => {
      strengthMap.set(s, (strengthMap.get(s) ?? 0) + 1);
    });
  });
  const topStrengths = Array.from(strengthMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count, pct: Math.round((count / Math.max(callCount, 1)) * 100) }));

  // ── Missed opportunities ─────────────────────────────────────────────────
  const missedMap = new Map<string, number>();
  data.forEach((r) => {
    (r.missed_opportunities ?? []).forEach((m: string) => {
      const lower = m.toLowerCase();
      // Try to bucket into known categories
      const matched = OPPORTUNITY_PATTERNS.find((p) =>
        p.keywords.some((kw) => lower.includes(kw))
      );
      const bucket = matched?.label ?? m.slice(0, 60);
      missedMap.set(bucket, (missedMap.get(bucket) ?? 0) + 1);
    });
  });
  const missedOpportunities = Array.from(missedMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({
      label,
      count,
      frequency: Math.round((count / Math.max(callCount, 1)) * 100),
    }));

  // ── Top objections ────────────────────────────────────────────────────────
  const objMap = new Map<string, number>();
  data.forEach((r) => {
    (r.objections ?? []).forEach((o: string) => {
      objMap.set(o, (objMap.get(o) ?? 0) + 1);
    });
  });
  const topObjections = Array.from(objMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));

  // ── Improvement items frequency ───────────────────────────────────────────
  const improvMap = new Map<string, number>();
  data.forEach((r) => {
    const plan = r.improvement_plan;
    const items: string[] = Array.isArray(plan) ? plan : [];
    items.forEach((item: string) => {
      if (typeof item === 'string') {
        improvMap.set(item.slice(0, 80), (improvMap.get(item.slice(0, 80)) ?? 0) + 1);
      }
    });
  });
  const recurringImprovements = Array.from(improvMap.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  return NextResponse.json({
    window: win,
    callCount,
    avgOverall,
    scoreTrend,
    stageRankings,
    ranked,
    topStrengths,
    missedOpportunities,
    topObjections,
    recurringImprovements,
  });
}
