import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type GoalType = 'calls_per_day' | 'appointments_per_day' | 'policies_per_day' | 'target_close_rate' | 'avg_call_score';

export interface Goal {
  id: string;
  goal_type: GoalType;
  target: number;
}

export interface GoalProgress extends Goal {
  current: number;
  pct: number;
  met: boolean;
}

const GOAL_LABELS: Record<GoalType, string> = {
  calls_per_day: 'Calls per day',
  appointments_per_day: 'Appointments per day',
  policies_per_day: 'Policies written per day',
  target_close_rate: 'Close rate (%)',
  avg_call_score: 'Avg call score',
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  // Fetch goals
  const { data: goalRows } = await db
    .from('agent_goals')
    .select('id, goal_type, target')
    .eq('user_id', user.id);
  const goals: Goal[] = goalRows ?? [];

  // Compute actuals for today and last 30 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: todayCalls } = await db
    .from('calls')
    .select('id, outcome')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('started_at', today.toISOString());

  const { data: thirtyDayScores } = await db
    .from('call_scores')
    .select('overall_score')
    .eq('user_id', user.id)
    .gte('created_at', thirtyDaysAgo.toISOString());

  const { data: thirtyDayCalls } = await db
    .from('calls')
    .select('id, outcome, started_at')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('started_at', thirtyDaysAgo.toISOString());

  const todayCallCount = (todayCalls ?? []).length;
  const todayPolicies = (todayCalls ?? []).filter((c: { outcome: string }) => c.outcome === 'policy_written').length;

  // Close rate over 30 days
  const totalCalls30 = (thirtyDayCalls ?? []).length;
  const policies30 = (thirtyDayCalls ?? []).filter((c: { outcome: string }) => c.outcome === 'policy_written').length;
  const closeRate30 = totalCalls30 > 0 ? Math.round((policies30 / totalCalls30) * 100) : 0;

  // Avg score over 30 days
  const scoreRows = thirtyDayScores ?? [];
  const avgScore30 = scoreRows.length
    ? Math.round(scoreRows.reduce((a: number, r: { overall_score: number }) => a + r.overall_score, 0) / scoreRows.length)
    : 0;

  // Appointments today (from calls with specific outcome or contact bookings — use calls as proxy)
  const todayAppointments = 0; // No appointments table link to today's calls yet; show 0 honestly

  const actuals: Record<GoalType, number> = {
    calls_per_day: todayCallCount,
    appointments_per_day: todayAppointments,
    policies_per_day: todayPolicies,
    target_close_rate: closeRate30,
    avg_call_score: avgScore30,
  };

  const progress: GoalProgress[] = goals.map((g) => {
    const current = actuals[g.goal_type] ?? 0;
    const pct = Math.min(100, Math.round((current / g.target) * 100));
    return { ...g, current, pct, met: current >= g.target, label: GOAL_LABELS[g.goal_type] };
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
