import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: calls, error } = await supabase
    .from('calls')
    .select('*, call_scores(overall_score)')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[GET /api/calls] query failed — code:', error.code, '| msg:', error.message);
    return NextResponse.json({ error: 'Failed to load calls' }, { status: 500 });
  }

  const contactIds = [...new Set((calls ?? []).map((c: any) => c.contact_id).filter(Boolean))];
  const { data: contacts } = contactIds.length
    ? await supabase.from('contacts').select('id, first_name, last_name').in('id', contactIds)
    : { data: [] as any[] };

  const records = (calls ?? []).map((c: any) => ({
    id: c.id,
    contactName: contacts?.find((x) => x.id === c.contact_id)
      ? `${contacts.find((x) => x.id === c.contact_id)!.first_name} ${contacts.find((x) => x.id === c.contact_id)!.last_name}`
      : 'Unknown Contact',
    date: c.started_at,
    duration: c.duration_seconds ?? 0,
    score: c.call_scores?.[0]?.overall_score ?? 0,
    outcome: c.outcome ?? 'no_answer',
    transcript: c.transcript ?? [],
    underwriting: c.underwriting ?? {},
    metrics: c.metrics ?? {},
  }));

  return NextResponse.json({ calls: records });
}
