import { NextResponse } from 'next/server';
import { requireUser, logAudit } from '@/lib/api/guard';

/**
 * Creates an in-progress call row the moment a live call starts, so autosave
 * (Phase 3 Part 8) has somewhere to write to. If the browser crashes or
 * closes mid-call, this row — and whatever autosave last wrote to it —
 * survives; nothing is lost.
 */
export async function POST() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data, error } = await supabase
    .from('calls')
    .insert({
      user_id: user.id,
      call_type: 'sales',
      status: 'in_progress',
      started_at: new Date().toISOString(),
    } as never)
    .select('id')
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to start call' }, { status: 500 });

  await logAudit(supabase, { userId: user.id, action: 'call.start', entityType: 'call', entityId: data.id });
  return NextResponse.json({ callId: data.id });
}
