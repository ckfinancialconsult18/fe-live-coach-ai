import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, role, avatar_url')
    .eq('id', user.id)
    .single();

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

  const [{ data: calls, count: callsToday }, { count: apptsToday }, { data: scores }] = await Promise.all([
    supabase.from('calls').select('outcome', { count: 'exact' }).gte('started_at', todayStart).lte('started_at', todayEnd),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('start_time', todayStart).lte('start_time', todayEnd).eq('status', 'scheduled'),
    supabase.from('call_scores').select('overall_score').gte('created_at', todayStart),
  ]);

  const avgScore = scores?.length
    ? Math.round(scores.reduce((s, c) => s + (c.overall_score ?? 0), 0) / scores.length)
    : null;
  const policiesToday = (calls ?? []).filter((c) => c.outcome === 'policy_written').length;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name ?? null,
      role: profile?.role ?? 'agent',
      avatarUrl: profile?.avatar_url ?? null,
    },
    todayStats: {
      calls: callsToday ?? 0,
      appointments: apptsToday ?? 0,
      policiesWritten: policiesToday,
      avgScore,
    },
  });
}
