/**
 * GET — list all members of the caller's agency with their performance stats.
 * Only accessible to agency owners.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  // Resolve agency (must be owner)
  const { data: agency } = await db
    .from('agencies')
    .select('id, name')
    .eq('owner_id', user.id)
    .single();

  if (!agency) return NextResponse.json({ error: 'No agency found or you are not the owner' }, { status: 403 });

  const days = parseInt(req.nextUrl.searchParams.get('window') ?? '30', 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Fetch all members with their user profile
  const { data: members } = await db
    .from('agency_members')
    .select('user_id, role, joined_at, users(id, email, full_name, avatar_url, created_at)')
    .eq('agency_id', agency.id);

  if (!members?.length) return NextResponse.json({ agency, members: [] });

  const memberIds = (members as any[]).map((m: any) => m.user_id);

  // Fetch call_scores for all members in one query
  const { data: scores } = await db
    .from('call_scores')
    .select('user_id, overall_score, scores, strengths, objections, created_at')
    .in('user_id', memberIds)
    .gte('created_at', since.toISOString());

  const scoreRows = (scores ?? []) as Array<{
    user_id: string;
    overall_score: number;
    scores: Record<string, number> | null;
    strengths: string[];
    objections: string[];
    created_at: string;
  }>;

  // Fetch call counts for all members
  const { data: callRows } = await db
    .from('calls')
    .select('user_id, outcome')
    .in('user_id', memberIds)
    .eq('status', 'completed')
    .gte('started_at', since.toISOString());

  const calls = (callRows ?? []) as Array<{ user_id: string; outcome: string }>;

  // Build per-member stats
  const STAGE_KEYS = ['introduction', 'permission', 'discovery', 'existingCoverage', 'health', 'budget', 'presentation', 'objections', 'closing'];

  const memberStats = (members as any[]).map((m: any) => {
    const uid = m.user_id;
    const userScores = scoreRows.filter((r) => r.user_id === uid);
    const userCalls = calls.filter((c) => c.user_id === uid);

    const avgScore = userScores.length
      ? Math.round(userScores.reduce((a, r) => a + r.overall_score, 0) / userScores.length)
      : null;

    const stageAvgs: Record<string, number> = {};
    for (const key of STAGE_KEYS) {
      const vals = userScores.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number');
      if (vals.length) stageAvgs[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    const sortedStages = Object.entries(stageAvgs).sort((a, b) => b[1] - a[1]);
    const strongestStage = sortedStages[0]?.[0] ?? null;
    const weakestStage = sortedStages[sortedStages.length - 1]?.[0] ?? null;

    const totalCalls = userCalls.length;
    const policies = userCalls.filter((c) => c.outcome === 'policy_written').length;
    const closeRate = totalCalls > 0 ? Math.round((policies / totalCalls) * 100) : null;

    // Score trend: first half vs second half
    const sorted = [...userScores].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);
    const firstAvg = firstHalf.length ? firstHalf.reduce((a, r) => a + r.overall_score, 0) / firstHalf.length : null;
    const secondAvg = secondHalf.length ? secondHalf.reduce((a, r) => a + r.overall_score, 0) / secondHalf.length : null;
    const trend: 'up' | 'down' | 'flat' =
      firstAvg === null || secondAvg === null ? 'flat'
      : secondAvg - firstAvg > 3 ? 'up'
      : firstAvg - secondAvg > 3 ? 'down'
      : 'flat';

    // Recent score dots for sparkline
    const scoreDots = sorted.slice(-10).map((r) => ({
      date: r.created_at.slice(0, 10),
      score: r.overall_score,
    }));

    return {
      user: m.users,
      role: m.role,
      joinedAt: m.joined_at,
      stats: {
        callCount: totalCalls,
        scoredCalls: userScores.length,
        avgScore,
        closeRate,
        policies,
        strongestStage,
        weakestStage,
        trend,
        scoreDots,
      },
    };
  });

  // Sort: owner first, then by avg score desc
  memberStats.sort((a, b) => {
    if (a.role === 'owner') return -1;
    if (b.role === 'owner') return 1;
    return (b.stats.avgScore ?? 0) - (a.stats.avgScore ?? 0);
  });

  // Agency aggregate
  const allScores = scoreRows.map((r) => r.overall_score);
  const agencyAvgScore = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : null;
  const agencyTotalCalls = calls.length;
  const agencyPolicies = calls.filter((c) => c.outcome === 'policy_written').length;
  const agencyCloseRate = agencyTotalCalls > 0 ? Math.round((agencyPolicies / agencyTotalCalls) * 100) : null;

  return NextResponse.json({
    agency,
    window: days,
    aggregate: { avgScore: agencyAvgScore, totalCalls: agencyTotalCalls, policies: agencyPolicies, closeRate: agencyCloseRate },
    members: memberStats,
  });
}

export async function DELETE(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  const body = await req.json().catch(() => ({})) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (body.userId === user.id) return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });

  // Verify caller is owner
  const { data: agency } = await db.from('agencies').select('id').eq('owner_id', user.id).single();
  if (!agency) return NextResponse.json({ error: 'Not an agency owner' }, { status: 403 });

  await db.from('agency_members').delete().eq('agency_id', agency.id).eq('user_id', body.userId);
  return NextResponse.json({ ok: true });
}
