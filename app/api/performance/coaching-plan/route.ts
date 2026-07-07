/**
 * AI Coaching Plan — uses GPT-4o to generate a personalized plan from
 * the last N days of call_scores data. Results are cached per-user per-day
 * in coaching_cache to avoid expensive regeneration on every load.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOpenAI } from '@/lib/openai';

export interface CoachingPlan {
  generatedAt: string;
  top3Priorities: { priority: string; why: string; estimatedImpact: string }[];
  scriptsToPractice: { scenario: string; script: string }[];
  discoveryQuestionsToImprove: string[];
  objectionHandlingFocus: { objection: string; recommendedResponse: string }[];
  closingRecommendation: string;
  overallMessage: string;
}

function buildPrompt(data: {
  callCount: number;
  avgScore: number | null;
  strongestStage: string | null;
  weakestStage: string | null;
  topObjections: string[];
  topMissedOpportunities: string[];
  recurringImprovements: string[];
  stageScores: Record<string, number>;
}): string {
  return `You are an expert Final Expense insurance sales coach. Generate a personalized daily coaching plan for this agent based on their real call performance data.

AGENT PERFORMANCE DATA (last ${data.callCount} calls):
- Average overall score: ${data.avgScore ?? 'unknown'}/100
- Strongest stage: ${data.strongestStage ?? 'unknown'}
- Weakest stage: ${data.weakestStage ?? 'unknown'}
- Stage scores: ${JSON.stringify(data.stageScores)}
- Top objections received: ${data.topObjections.slice(0, 3).join(', ') || 'none recorded'}
- Most missed opportunities: ${data.topMissedOpportunities.slice(0, 3).join(', ') || 'none recorded'}
- Recurring AI coaching notes: ${data.recurringImprovements.slice(0, 3).join(', ') || 'none'}

Generate a JSON response with this exact structure:
{
  "top3Priorities": [
    { "priority": "string", "why": "string", "estimatedImpact": "string" },
    { "priority": "string", "why": "string", "estimatedImpact": "string" },
    { "priority": "string", "why": "string", "estimatedImpact": "string" }
  ],
  "scriptsToPractice": [
    { "scenario": "string", "script": "string" },
    { "scenario": "string", "script": "string" }
  ],
  "discoveryQuestionsToImprove": ["string", "string", "string"],
  "objectionHandlingFocus": [
    { "objection": "string", "recommendedResponse": "string" }
  ],
  "closingRecommendation": "string",
  "overallMessage": "string (2-3 sentences of personalized encouragement and direction)"
}

Rules:
- Be specific and concrete — reference the actual weak areas from the data
- Scripts should be word-for-word Final Expense language an agent can practice aloud
- Estimated impact should be realistic (e.g. "+5-8 points on closing score")
- Only include objection handling for objections that actually appeared in their call data
- Do NOT make up data or reference things not in the performance data
- Keep scripts short (2-4 sentences) and immediately usable on a real call
- Respond with valid JSON only, no markdown fences`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const days = parseInt(req.nextUrl.searchParams.get('window') ?? '7', 10);
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';
  const db = supabase as any;
  const today = new Date().toISOString().slice(0, 10);

  // Check cache first
  if (!forceRefresh) {
    const { data: cached } = await db
      .from('coaching_cache')
      .select('plan, created_at')
      .eq('user_id', user.id)
      .eq('cache_date', today)
      .eq('window_days', days)
      .single();
    if (cached?.plan) {
      return NextResponse.json({ ...cached.plan, fromCache: true, cachedAt: cached.created_at });
    }
  }

  // Fetch recent call_scores
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: rows } = await db
    .from('call_scores')
    .select('overall_score, scores, strengths, missed_opportunities, objections, improvement_plan')
    .eq('user_id', user.id)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  const data = (rows ?? []) as Array<{
    overall_score: number;
    scores: Record<string, number> | null;
    strengths: string[];
    missed_opportunities: string[];
    objections: string[];
    improvement_plan: unknown;
  }>;

  if (!data.length) {
    return NextResponse.json({ error: 'Not enough call data to generate a coaching plan. Complete at least one scored call first.' }, { status: 422 });
  }

  // Aggregate stats for the prompt
  const avgScore = Math.round(data.reduce((a, r) => a + r.overall_score, 0) / data.length);

  const stageKeys = ['introduction', 'permission', 'discovery', 'existingCoverage', 'health', 'budget', 'presentation', 'objections', 'closing'];
  const stageScores: Record<string, number> = {};
  for (const key of stageKeys) {
    const vals = data.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number');
    if (vals.length) stageScores[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  const scored = Object.entries(stageScores).sort((a, b) => b[1] - a[1]);
  const strongestStage = scored[0]?.[0] ?? null;
  const weakestStage = scored[scored.length - 1]?.[0] ?? null;

  const objMap = new Map<string, number>();
  data.forEach((r) => r.objections?.forEach((o: string) => objMap.set(o, (objMap.get(o) ?? 0) + 1)));
  const topObjections = [...objMap.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const missMap = new Map<string, number>();
  data.forEach((r) => r.missed_opportunities?.forEach((m: string) => missMap.set(m.slice(0, 80), (missMap.get(m.slice(0, 80)) ?? 0) + 1)));
  const topMissed = [...missMap.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const improvMap = new Map<string, number>();
  data.forEach((r) => {
    const plan = r.improvement_plan;
    (Array.isArray(plan) ? plan : []).forEach((item: string) => {
      if (typeof item === 'string') improvMap.set(item.slice(0, 80), (improvMap.get(item.slice(0, 80)) ?? 0) + 1);
    });
  });
  const recurringImprovements = [...improvMap.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k);

  // Generate with OpenAI
  const openai = getOpenAI();
  const prompt = buildPrompt({ callCount: data.length, avgScore, strongestStage, weakestStage, topObjections, topMissedOpportunities: topMissed, recurringImprovements, stageScores });

  let plan: CoachingPlan;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 1500,
    });
    plan = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as CoachingPlan;
    plan.generatedAt = new Date().toISOString();
  } catch (err) {
    return NextResponse.json({ error: `Failed to generate coaching plan: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  // Cache the result
  await db.from('coaching_cache').upsert({
    user_id: user.id,
    cache_date: today,
    window_days: days,
    plan,
  }, { onConflict: 'user_id,cache_date,window_days' });

  return NextResponse.json({ ...plan, fromCache: false });
}
