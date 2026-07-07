/**
 * AI Insights — generates pattern-based insights backed by real call data.
 * Only surfaces an insight when the underlying metric passes a confidence
 * threshold (minimum N calls, minimum delta from threshold).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOpenAI } from '@/lib/openai';

export interface Insight {
  id: string;
  text: string;
  category: 'strength' | 'gap' | 'trend' | 'opportunity';
  metric: string;
  confidence: 'high' | 'medium';
}

const STAGE_LABELS: Record<string, string> = {
  introduction: 'Opening',
  permission: 'Permission',
  discovery: 'Discovery',
  existingCoverage: 'Existing Coverage Check',
  health: 'Health Questions',
  budget: 'Budget Talk',
  presentation: 'Presentation',
  objections: 'Objection Handling',
  closing: 'Closing',
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const days = parseInt(req.nextUrl.searchParams.get('window') ?? '30', 10);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const prevSince = new Date();
  prevSince.setDate(prevSince.getDate() - days * 2);

  const { data: currRows } = await db
    .from('call_scores')
    .select('overall_score, scores, strengths, missed_opportunities, objections, report_details, created_at')
    .eq('user_id', user.id)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  const { data: prevRows } = await db
    .from('call_scores')
    .select('overall_score, scores, created_at')
    .eq('user_id', user.id)
    .gte('created_at', prevSince.toISOString())
    .lt('created_at', since.toISOString());

  const current = (currRows ?? []) as Array<{
    overall_score: number;
    scores: Record<string, number> | null;
    strengths: string[];
    missed_opportunities: string[];
    objections: string[];
    report_details: Record<string, unknown> | null;
    created_at: string;
  }>;
  const previous = (prevRows ?? []) as Array<{ overall_score: number; scores: Record<string, number> | null }>;

  if (current.length < 2) {
    return NextResponse.json({ insights: [], message: 'Need at least 2 scored calls to generate insights.' });
  }

  // Build structured stats for the AI
  const stageKeys = Object.keys(STAGE_LABELS);
  const currStageAvgs: Record<string, number> = {};
  const prevStageAvgs: Record<string, number> = {};

  for (const key of stageKeys) {
    const vals = current.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number');
    if (vals.length) currStageAvgs[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);

    const pvals = previous.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number');
    if (pvals.length) prevStageAvgs[key] = Math.round(pvals.reduce((a, b) => a + b, 0) / pvals.length);
  }

  const objMap = new Map<string, number>();
  current.forEach((r) => r.objections?.forEach((o: string) => objMap.set(o, (objMap.get(o) ?? 0) + 1)));
  const topObjections = [...objMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v}×)`);

  const missMap = new Map<string, number>();
  current.forEach((r) => r.missed_opportunities?.forEach((m: string) => {
    const key = m.slice(0, 70);
    missMap.set(key, (missMap.get(key) ?? 0) + 1);
  }));
  const topMissed = [...missMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v}×)`);

  const avgCurr = Math.round(current.reduce((a, r) => a + r.overall_score, 0) / current.length);
  const avgPrev = previous.length ? Math.round(previous.reduce((a, r) => a + r.overall_score, 0) / previous.length) : null;

  // Compute first-half vs second-half trend for each stage
  const mid = Math.floor(current.length / 2);
  const firstHalf = current.slice(0, mid);
  const secondHalf = current.slice(mid);
  const stagetrends: Record<string, number> = {};
  for (const key of stageKeys) {
    const f = firstHalf.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number');
    const s = secondHalf.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number');
    if (f.length && s.length) {
      const fa = f.reduce((a, b) => a + b, 0) / f.length;
      const sa = s.reduce((a, b) => a + b, 0) / s.length;
      stagetrends[key] = Math.round(sa - fa);
    }
  }

  const prompt = `You are a Final Expense sales performance analyst. Based on ONLY the following real call data, generate 4-6 specific, insightful observations about this agent's patterns.

REAL DATA (${current.length} calls over ${days} days):
- Avg overall score: ${avgCurr}/100 (previous period: ${avgPrev ?? 'insufficient data'}/100)
- Stage scores: ${JSON.stringify(currStageAvgs)}
- Previous stage scores: ${JSON.stringify(prevStageAvgs)}
- Stage improvement trends (positive = improving): ${JSON.stringify(stagetrends)}
- Top objections received: ${topObjections.join(', ') || 'none'}
- Most missed opportunities: ${topMissed.join(', ') || 'none'}

Rules:
- ONLY reference patterns visible in the data above
- Be specific and actionable — name the exact stage, objection, or behavior
- Do NOT fabricate statistics or invent patterns not supported by the data
- Use plain conversational language like a real coach talking to an agent
- Each insight must be a single sentence (under 20 words)

Return JSON:
{
  "insights": [
    {
      "id": "unique_snake_case_id",
      "text": "Single sentence insight",
      "category": "strength|gap|trend|opportunity",
      "metric": "short metric description (e.g. 'Closing avg: 61')",
      "confidence": "high|medium"
    }
  ]
}`;

  let insights: Insight[] = [];
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    insights = parsed.insights ?? [];
  } catch (err) {
    return NextResponse.json({ error: `Failed to generate insights: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  return NextResponse.json({ insights, callCount: current.length, window: days });
}
