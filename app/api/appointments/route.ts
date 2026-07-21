import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { appointmentFromRow, appointmentToRow } from '@/lib/api/mappers';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', user.id)
    .order('start_time', { ascending: true });

  if (error) return NextResponse.json({ error: 'Failed to load appointments' }, { status: 500 });
  return NextResponse.json({ appointments: (data ?? []).map(appointmentFromRow) });
}

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json();
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...appointmentToRow(body), user_id: user.id } as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
  return NextResponse.json({ appointment: appointmentFromRow(data) }, { status: 201 });
}
