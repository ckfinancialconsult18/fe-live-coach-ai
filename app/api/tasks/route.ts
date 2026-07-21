import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { taskFromRow, taskToRow } from '@/lib/api/mappers';
import { requireUser } from '@/lib/api/guard';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('due_date', { ascending: true });

  if (error) return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  return NextResponse.json({ tasks: (data ?? []).map(taskFromRow) });
}

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...taskToRow(body), user_id: user.id } as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  return NextResponse.json({ task: taskFromRow(data) }, { status: 201 });
}
