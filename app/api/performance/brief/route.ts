/**
 * Morning Brief — computed entirely from stored call_scores, with an
 * AI-generated coach summary paragraph cached per-user per-day per-window.
 * Returns a snapshot comparing current window vs the previous period.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOpenAI } from '@/lib/openai';

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

function avgScores(rows: ScoreRow[]): number | null {
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

async function generateCoachSummary(
  db: any,
  userId: string,
  days: number,
  briefData: {
    callCount: number;
    currentAvg: number | null;
    trendDelta: number | null;
    trendDirection: string;
    strongestSkill: { label: string; avg: number } | null;
    weakestSkill: { label: string; avg: number } | null;
    biggestImprovement: { label: string; delta: number } | null;
    topObjection: string | null;
    topMissedDiscovery: string | null;
  }
): Promise<string | null> {
  // Cache key: negative window_days distinguishes brief summaries from coaching plans
  const cacheKey = -days;
  const today = new Date().toISOString().slice(0, 10);

  const { data: cached } = await db
    .from('coaching_cache')
    .select('plan')
    .eq('user_id', userId)
    .eq('cache_date', today)
    .eq('window_days', cacheKey)
    .single();

  if (cached?.plan?.summary) return cached.plan.summary as string;

  if (briefData.callCount < 2) return null;

  const trendWord =
    briefData.trendDirection === 'up' ? 'improving' :
    briefData.trendDirection === 'down' ? 'declining' : 'holding steady';

  const prompt = `You are a personal Final Expense insurance sales coach. Write a 2-3 sentence morning brief for your agent. Be direct, specific, and personal — like a real coach talking one-on-one.

PERFORMANCE DATA (last ${days} days, ${briefData.callCount} calls):
- Average score: ${briefData.currentAvg ?? 'N/A'}/100 — ${trendWord}
- vs previous ${days}-day period: ${briefData.trendDelta !== null ? `${briefData.trendDelta > 0 ? '+' : ''}${briefData.trendDelta} points` : 'first period'}
- Strongest stage: ${briefData.strongestSkill ? `${briefData.strongestSkill.label} (${briefData.strongestSkill.avg}/100)` : 'N/A'}
- Weakest stage: ${briefData.weakestSkill ? `${briefData.weakestSkill.label} (${briefData.weakestSkill.avg}/100)` : 'N/A'}
- Biggest improvement: ${briefData.biggestImprovement ? `${briefData.biggestImprovement.label} +${briefData.biggestImprovement.delta} pts` : 'none'}
- Most common objection: ${briefData.topObjection ?? 'none logged'}
- Most missed discovery step: ${briefData.topMissedDiscovery ?? 'none logged'}

Rules:
- Reference actual numbers from the data (scores, percentages, stage names)
- Be encouraging but honest about weaknesses
- Give one specific thing to focus on today
- Write in second person ("you", "your")
- No generic phrases like "keep up the great work" — be specific
- 2-3 sentences maximum

Return plain text only, no JSON.`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 200,
    });
    const summary = completion.choices[0]?.message?.content?.trim() ?? null;
    if (summary) {
      await db.from('coaching_cache').upsert({
        user_id: userId,
        cache_date: today,
        window_days: cacheKey,
        plan: { summary },
      }, { onConflict: 'user_id,cache_date,window_days' });
    }
    return summary;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const days = parseInt(req.nextUrl.searchParams.get('window') ?? '30', 10);
  const currentSince = daysBefore(days);
  const prevSince = daysBefore(days * 2);

  const db = supabase as any;

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
  const trendDirection =
    trendDelta === null ? 'unknown' :
    trendDelta > 2 ? 'up' :
    trendDelta < -2 ? 'down' : 'flat';

  const currentStages = stageSummary(current);
  const previousStages = stageSummary(previous);

  const stageDeltas = currentStages.map((cs) => {
    const ps = previousStages.find((s) => s.key === cs.key);
    return { ...cs, delta: ps ? cs.avg - ps.avg : null };
  });

  const sorted = [...stageDeltas].sort((a, b) => b.avg - a.avg);
  const strongestSkill = sorted[0] ?? null;
  const weakestSkill = sorted[sorted.length - 1] ?? null;

  const biggestImprovement = [...stageDeltas]
    .filter((s): s is typeof s & { delta: number } => s.delta !== null && s.delta > 0)
    .sort((a, b) => b.delta - a.delta)[0] ?? null;

  const mostImprovedSkill = biggestImprovement ?? null;

  // Most common objection
  const objMap = new Map<string, number>();
  current.forEach((r) => r.objections?.forEach((o: string) => objMap.set(o, (objMap.get(o) ?? 0) + 1)));
  const topObjection = topEntry(objMap);

  // Most frequently missed discovery question
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

  // Closing score trend
  const closingTrend = current.map((r) => ({
    date: r.created_at.slice(0, 10),
    score: r.scores?.['closing'] ?? r.report_details?.closingScore ?? null,
  })).filter((d) => d.score !== null) as { date: string; score: number }[];

  // Close rate trend (calls table would be needed for real close rate — using closing score as proxy here)
  const topFocus = weakestSkill
    ? `Focus on ${weakestSkill.label} — your average is ${weakestSkill.avg}/100. Drill this in role play before your next call.`
    : null;

  const briefData = { callCount: current.length, currentAvg, trendDelta, trendDirection, strongestSkill, weakestSkill, biggestImprovement, topObjection, topMissedDiscovery };

  // AI coach summary (cached, non-blocking — if it fails we still return the data)
  const coachSummary = await generateCoachSummary(db, user.id, days, briefData);

  return NextResponse.json({
    window: days,
    callCount: current.length,
    currentAvg,
    previousAvg,
    trendDelta,
    trendDirection,
    strongestSkill,
    weakestSkill,
    biggestImprovement,
    mostImprovedSkill,
    topObjection,
    topMissedDiscovery,
    closingTrend,
    topFocus,
    stageDeltas,
    coachSummary,
  });
}
