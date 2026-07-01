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
  if (!user) {
    console.error('[calls/start] auth failed — no user');
    return response;
  }

  console.log('[calls/start] INSERT attempt — userId:', user.id);

  const insertPayload = {
    user_id: user.id,
    call_type: 'sales',
    status: 'in_progress',
    started_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('calls')
    .insert(insertPayload as never)
    .select('id')
    .single();

  if (error || !data) {
    console.error('[calls/start] INSERT failed — code:', error?.code, '| msg:', error?.message, '| details:', error?.details, '| hint:', error?.hint);
    return NextResponse.json({ error: error?.message ?? 'Failed to start call' }, { status: 500 });
  }

  console.log('[calls/start] INSERT succeeded — callId:', data.id, '| userId:', user.id);
  await logAudit(supabase, { userId: user.id, action: 'call.start', entityType: 'call', entityId: data.id });
  return NextResponse.json({ callId: data.id });
}
