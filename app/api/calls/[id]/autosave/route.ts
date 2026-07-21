import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/guard';

/**
 * Periodic mid-call autosave (Phase 3 Part 8) — called every few seconds
 * while a call is live. Writes the current transcript, underwriting capture,
 * metrics, and a `live_state` snapshot (coaching insight, memory, timeline)
 * to the in-progress call row created by /api/calls/start. Idempotent and
 * cheap: a single UPDATE scoped to one row by id + owning user.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (body.transcript !== undefined) update.transcript = body.transcript;
  if (body.underwriting !== undefined) update.underwriting = body.underwriting;
  if (body.metrics !== undefined) update.metrics = body.metrics;
  if (body.durationSeconds !== undefined) update.duration_seconds = body.durationSeconds;
  if (body.liveState !== undefined) update.live_state = body.liveState;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
  }

  const transcriptLen = Array.isArray(body.transcript) ? (body.transcript as unknown[]).length : 'n/a';
  const { error, count } = await supabase
    .from('calls')
    .update(update as never)
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'in_progress');

  if (error) {
    console.error('[autosave] UPDATE failed — callId:', id, '| code:', error.code);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  void count;
  return NextResponse.json({ saved: true, at: new Date().toISOString() });
}
