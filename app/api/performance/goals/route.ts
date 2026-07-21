import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type GoalType =
  | 'calls_per_day'
  | 'appointments_per_day'
  | 'policies_per_day'
  | 'applications_submitted'
  | 'target_close_rate'
  | 'avg_call_score'
  | 'avg_discovery_score'
  | 'avg_rapport_score';

export interface Goal {
  id: string;
  goal_type: GoalType;
  target: number;
}

export interface GoalProgress extends Goal {
  current: number;
  pct: number;
  met: boolean;
  remaining: number;
  estimatedDate: string | null;
  label?: string;
}

const GOAL_LABELS: Record<GoalType, string> = {
  calls_per_day:         'Calls per day',
  appointments_per_day:  'Appointments per day',
  policies_per_day:      'Policies written per day',
  applications_submitted:'Applications submitted per day',
  target_close_rate:     'Close rate (30d %)',
  avg_call_score:        'Avg call score (30d)',
  avg_discovery_score:   'Avg discovery score (30d)',
  avg_rapport_score:     'Avg rapport score (30d)',
};

// Whether a goal tracks today's activity (vs a rolling 30-day average)
const DAILY_GOALS = new Set<GoalType>([
  'calls_per_day', 'appointments_per_day', 'policies_per_day', 'applications_submitted',
]);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { data: goalRows } = await db
    .from('agent_goals')
    .select('id, goal_type, target')
    .eq('user_id', user.id);
  const goals: Goal[] = goalRows ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [
    { data: todayCalls },
    { data: todayAppts },
    { data: thirtyDayScores },
    { data: thirtyDayCalls },
    { data: prevFourteenScores },
  ] = await Promise.all([
    db.from('calls').select('id, outcome').eq('user_id', user.id).eq('status', 'completed').gte('started_at', today.toISOString()),
    db.from('appointments').select('id').eq('user_id', user.id).gte('start_time', today.toISOString()).lte('start_time', new Date(today.getTime() + 86400000).toISOString()),
    db.from('call_scores').select('overall_score, scores, created_at').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()).order('created_at', { ascending: true }),
    db.from('calls').select('id, outcome, started_at').eq('user_id', user.id).eq('status', 'completed').gte('started_at', thirtyDaysAgo.toISOString()),
    // Previous 14-day window for trend extrapolation
    db.from('call_scores').select('overall_score, scores, created_at').eq('user_id', user.id).gte('created_at', new Date(fourteenDaysAgo.getTime() - 14 * 86400000).toISOString()).lt('created_at', fourteenDaysAgo.toISOString()),
  ]);

  const scores30 = (thirtyDayScores ?? []) as { overall_score: number; scores: Record<string, number> | null; created_at: string }[];
  const calls30 = (thirtyDayCalls ?? []) as { id: string; outcome: string; started_at: string }[];
  const prevScores = (prevFourteenScores ?? []) as { overall_score: number; scores: Record<string, number> | null }[];

  const todayCallCount = (todayCalls ?? []).length;
  const todayPolicies = (todayCalls ?? []).filter((c: { outcome: string }) => c.outcome === 'policy_written').length;
  const todayAppsSubmitted = todayPolicies; // applications â‰ˆ policies for FE insurance (same event)
  const todayAppointments = (todayAppts ?? []).length;

  const totalCalls30 = calls30.length;
  const policies30 = calls30.filter((c) => c.outcome === 'policy_written').length;
  const closeRate30 = totalCalls30 > 0 ? Math.round((policies30 / totalCalls30) * 100) : 0;

  function scoreAvg30(key?: string): number {
    const vals = key
      ? scores30.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number')
      : scores30.map((r) => r.overall_score);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }

  function scorePrevAvg(key?: string): number {
    const vals = key
      ? prevScores.map((r) => r.scores?.[key]).filter((v): v is number => typeof v === 'number')
      : prevScores.map((r) => r.overall_score);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }

  const avgScore30 = scoreAvg30();
  const avgDiscovery30 = scoreAvg30('discovery');
  const avgRapport30 = scoreAvg30('rapport');

  const actuals: Record<GoalType, number> = {
    calls_per_day:         todayCallCount,
    appointments_per_day:  todayAppointments,
    policies_per_day:      todayPolicies,
    applications_submitted: todayAppsSubmitted,
    target_close_rate:     closeRate30,
    avg_call_score:        avgScore30,
    avg_discovery_score:   avgDiscovery30,
    avg_rapport_score:     avgRapport30,
  };

  // Estimate how many days until a rate/score goal is met, using linear trend
  function estimateDate(goalType: GoalType, target: number, current: number): string | null {
    if (current >= target) return null; // already met

    if (DAILY_GOALS.has(goalType)) {
      // Today-based: can they still hit it today?
      const nowHour = new Date().getHours();
      const remaining = target - current;
      if (remaining <= 0) return 'Today';
      if (nowHour < 20) return `${remaining} more today`;
      return 'Tomorrow';
    }

    // Score/rate goal: extrapolate from 14-day trend
    const prevAvg = scorePrevAvg(
      goalType === 'avg_discovery_score' ? 'discovery' :
      goalType === 'avg_rapport_score' ? 'rapport' : undefined
    );
    const delta = current - prevAvg; // change per 14 days
    if (delta <= 0) return null; // not improving â€” no projection

    const needed = target - current;
    const daysToGoal = Math.ceil((needed / delta) * 14);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysToGoal);
    return targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const progress: GoalProgress[] = goals.map((g) => {
    const current = actuals[g.goal_type] ?? 0;
    const pct = Math.min(100, Math.round((current / g.target) * 100));
    const met = current >= g.target;
    const remaining = Math.max(0, Math.round((g.target - current) * 10) / 10);
    const estimatedDate = met ? null : estimateDate(g.goal_type, g.target, current);
    return { ...g, current, pct, met, remaining, estimatedDate, label: GOAL_LABELS[g.goal_type] };
  });

  return NextResponse.json({ goals: progress, actuals, labels: GOAL_LABELS });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json().catch(() => ({})) as { goal_type?: GoalType; target?: number };
  if (!body.goal_type || body.target == null) return NextResponse.json({ error: 'goal_type and target required' }, { status: 400 });
  if (body.target <= 0) return NextResponse.json({ error: 'target must be > 0' }, { status: 400 });

  const { data, error } = await db.from('agent_goals').upsert({
    user_id: user.id,
    goal_type: body.goal_type,
    target: body.target,
  }, { onConflict: 'user_id,goal_type' }).select().single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json().catch(() => ({})) as { goal_type?: GoalType };
  if (!body.goal_type) return NextResponse.json({ error: 'goal_type required' }, { status: 400 });

  await db.from('agent_goals').delete().eq('user_id', user.id).eq('goal_type', body.goal_type);
  return NextResponse.json({ ok: true });
}
