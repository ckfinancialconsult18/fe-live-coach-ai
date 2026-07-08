import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  // Verify ownership
  const { data: doc } = await (supabase as any)
    .from('knowledge_documents')
    .select('id, raw_text')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!doc.raw_text) {
    return NextResponse.json({ error: 'Document has no extracted text to embed. Re-upload the file.' }, { status: 422 });
  }

  // Reset status and upsert a fresh queue entry
  await (supabase as any)
    .from('knowledge_documents')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('user_id', user.id);

  // Delete any stuck/failed queue entry then re-insert
  await (supabase as any).from('embedding_queue').delete().eq('target_id', id).eq('target_type', 'knowledge_document');
  await (supabase as any).from('embedding_queue').insert({
    user_id: user.id,
    target_type: 'knowledge_document',
    target_id: id,
    status: 'pending',
  });

  return NextResponse.json({ ok: true });
}
