import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: call, error } = await supabase
    .from('calls')
    .select('*, call_scores(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !call) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });

  const score = Array.isArray(call.call_scores) ? call.call_scores[0] : null;
  return NextResponse.json({
    id: call.id,
    overallScore: score?.overall_score ?? 0,
    summary: score?.summary ?? '',
    aiCoachingSummary: score?.report_details?.aiCoachingSummary ?? '',
    threeBiggestStrengths: score?.report_details?.threeBiggestStrengths ?? [],
    threeBiggestImprovements: score?.report_details?.threeBiggestImprovements ?? [],
    improvementPlan: score?.improvement_plan ?? [],
    missedOpportunities: score?.missed_opportunities ?? [],
    objectionsHandling: score?.report_details?.objectionsHandling ?? [],
    whatShouldHaveBeenDifferent: score?.report_details?.whatShouldHaveBeenDifferent ?? [],
    weightedBreakdown: score?.report_details?.weightedBreakdown ?? null,
    followUpText: score?.follow_up_text ?? '',
    followUpEmail: score?.follow_up_email ?? '',
    crmNotes: score?.crm_notes ?? '',
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('calls')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
