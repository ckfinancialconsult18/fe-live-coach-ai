import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { COACHING_RECOMMENDATIONS_PROMPT } from '@/lib/coach-prompts';
import { requireUser } from '@/lib/api/guard';

const MIN_SCORED_CALLS = 3;

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [{ data: scores }, { data: policies }, { data: commissions }, { data: history }] = await Promise.all([
    supabase
      .from('call_scores')
      .select('overall_score, scores, objections, buying_signals, strengths, missed_opportunities, created_at')
      .gte('created_at', since.toISOString()),
    supabase
      .from('policies')
      .select('policy_type, carrier_name, status, created_at')
      .gte('created_at', since.toISOString()),
    supabase
      .from('commissions')
      .select('carrier, amount, status')
      .gte('created_at', since.toISOString()),
    // Conversational memory: prior snapshots let the model speak to trends
    // ("your budget score has improved 12 points over 3 cycles") instead of
    // only ever seeing a single isolated window.
    supabase
      .from('coaching_history')
      .select('period_start, stats')
      .order('period_start', { ascending: false })
      .limit(3),
  ]);

  const scoredCalls = scores ?? [];

  if (scoredCalls.length < MIN_SCORED_CALLS) {
    return NextResponse.json({
      insufficientData: true,
      callsScored: scoredCalls.length,
      callsNeeded: MIN_SCORED_CALLS,
    });
  }

  // Aggregate — this is what actually gets sent to the model, not raw transcripts.
  const avgOverall = Math.round(scoredCalls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / scoredCalls.length);

  const stageKeys = ['introduction', 'permission', 'discovery', 'existingCoverage', 'health', 'budget', 'presentation', 'objections', 'closing'];
  const stageAverages: Record<string, number> = {};
  for (const key of stageKeys) {
    const vals = scoredCalls.map((c) => (c.scores as Record<string, number> | null)?.[key]).filter((v): v is number => typeof v === 'number');
    if (vals.length) stageAverages[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  const objectionCounts: Record<string, number> = {};
  scoredCalls.forEach((c) => (c.objections ?? []).forEach((o: string) => { objectionCounts[o] = (objectionCounts[o] ?? 0) + 1; }));

  const buyingSignalCounts: Record<string, number> = {};
  scoredCalls.forEach((c) => (c.buying_signals ?? []).forEach((b: string) => { buyingSignalCounts[b] = (buyingSignalCounts[b] ?? 0) + 1; }));

  const policyList = policies ?? [];
  const carrierMix: Record<string, number> = {};
  policyList.forEach((p) => { carrierMix[p.carrier_name] = (carrierMix[p.carrier_name] ?? 0) + 1; });
  const issuedCount = policyList.filter((p) => p.status === 'issued').length;
  const conversionRate = scoredCalls.length ? Math.round((issuedCount / scoredCalls.length) * 100) : 0;

  const commissionList = commissions ?? [];
  const totalCommission = commissionList.reduce((s, c) => s + Number(c.amount ?? 0), 0);

  const stats = {
    period: 'last_30_days',
    callsScored: scoredCalls.length,
    avgOverallScore: avgOverall,
    stageAverages,
    topObjections: Object.entries(objectionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    topBuyingSignals: Object.entries(buyingSignalCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    policiesIssued: issuedCount,
    conversionRatePct: conversionRate,
    carrierMix,
    totalCommissionEarned: totalCommission,
    priorPeriods: (history ?? []).map((h) => ({ periodStart: h.period_start, stats: h.stats })),
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ insufficientData: false, stats, recommendations: [], aiUnavailable: true });
  }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: COACHING_RECOMMENDATIONS_PROMPT },
        { role: 'user', content: JSON.stringify(stats) },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    const content = res.choices[0]?.message?.content ?? '{"recommendations":[]}';
    const parsed = JSON.parse(content);
    const recommendations = parsed.recommendations ?? [];

    await supabase.from('coaching_history').insert({
      user_id: user.id,
      period_start: since.toISOString(),
      period_end: new Date().toISOString(),
      stats,
      recommendations,
    } as any);

    return NextResponse.json({ insufficientData: false, stats, recommendations });
  } catch (err) {
    console.error('Coaching insights generation failed:', err);
    return NextResponse.json({ insufficientData: false, stats, recommendations: [], aiUnavailable: true });
  }
}
