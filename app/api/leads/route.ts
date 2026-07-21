import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { leadFromRow, leadToRow } from '@/lib/api/mappers';
import { requireUser, requireFields, handleApiError } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  return NextResponse.json({ leads: (data ?? []).map(leadFromRow) });
}

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  try {
    const body = await request.json();
    requireFields(body, ['firstName', 'lastName']);

    const { data, error } = await supabase
      .from('leads')
      .insert({ ...leadToRow(body), user_id: user.id } as any)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lead: leadFromRow(data) }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
