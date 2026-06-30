import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, requireFields, handleApiError, logAudit } from '@/lib/api/guard';
import type { ApproveAction } from '@/lib/pipeline/types';

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  try {
    const body = await request.json() as ApproveAction;
    requireFields(body as unknown as Record<string, unknown>, ['ids', 'action']);
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
    }

    const status = body.action === 'approve' ? 'approved' : 'rejected';
    const { data: updated, error } = await supabase
      .from('knowledge_base')
      .update({ status, reviewed_at: new Date().toISOString(), review_note: body.note ?? null } as never)
      .in('id', body.ids)
      .eq('user_id', user.id)
      .select('id');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Approved entries become retrievable — enqueue them for chunking/embedding.
    if (status === 'approved' && updated) {
      const queueRows = updated.map((row) => ({ user_id: user.id, target_type: 'knowledge_base' as const, target_id: row.id }));
      await supabase.from('embedding_queue').insert(queueRows as never);
    }

    await logAudit(supabase, {
      userId: user.id,
      action: `knowledge.${body.action}`,
      entityType: 'knowledge_base',
      metadata: { ids: body.ids, note: body.note },
    });

    return NextResponse.json({ updated: updated?.length ?? 0 });
  } catch (err) {
    return handleApiError(err);
  }
}
