import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, logAudit } from '@/lib/api/guard';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: doc, error } = await supabase
    .from('knowledge_documents')
    .select('storage_path, title, mime_type')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (error || !doc || !doc.storage_path) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from('knowledge')
    .createSignedUrl(doc.storage_path, 60 * 5);
  if (signError || !signed) return NextResponse.json({ error: signError?.message ?? 'Could not sign URL' }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl, title: doc.title, mimeType: doc.mime_type });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: doc } = await supabase
    .from('knowledge_documents')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (doc?.storage_path) {
    await supabase.storage.from('knowledge').remove([doc.storage_path]);
  }

  // knowledge_chunks and embedding_queue rows cascade via FK on document_id.
  const { error } = await supabase.from('knowledge_documents').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, { userId: user.id, action: 'knowledge.delete', entityType: 'knowledge_document', entityId: id });
  return NextResponse.json({ success: true });
}
