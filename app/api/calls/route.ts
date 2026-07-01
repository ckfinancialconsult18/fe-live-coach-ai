import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    console.error('[GET /api/calls] auth failed:', authError?.message);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[GET /api/calls] query — userId:', user.id);

  const { data: calls, error } = await supabase
    .from('calls')
    .select('*, call_scores(overall_score)')
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[GET /api/calls] query failed — code:', error.code, '| msg:', error.message, '| details:', error.details);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[GET /api/calls] rows returned:', calls?.length ?? 0, '| userId:', user.id,
    '| statuses:', JSON.stringify([...new Set((calls ?? []).map((c: any) => c.status))]));

  const withScore = (calls ?? []).filter((c: any) => Array.isArray(c.call_scores) && c.call_scores.length > 0);
  const withTranscript = (calls ?? []).filter((c: any) => Array.isArray(c.transcript) && c.transcript.length > 0);
  console.log('[GET /api/calls] rows with call_scores:', withScore.length, '| rows with transcript:', withTranscript.length);

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
