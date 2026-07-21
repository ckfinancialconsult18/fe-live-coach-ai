import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, logAudit } from '@/lib/api/guard';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') ?? 'download'; // 'download' | 'preview'

  const { data: doc, error } = await supabase
    .from('documents')
    .select('storage_path, name, mime_type')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 60 * 5, mode === 'download' ? { download: doc.name } : undefined);

  if (signError || !signed) return NextResponse.json({ error: signError?.message ?? 'Could not sign URL' }, { status: 500 });

  await logAudit(supabase, { userId: user.id, action: mode === 'download' ? 'document.download' : 'document.preview', entityType: 'document', entityId: id });
  return NextResponse.json({ url: signed.signedUrl, name: doc.name, mimeType: doc.mime_type });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = await request.json();
  const allowed: Record<string, any> = {};
  if (body.category !== undefined) allowed.category = body.category;
  if (body.folder !== undefined) allowed.folder = body.folder;
  if (body.tags !== undefined) allowed.tags = body.tags;
  if (body.contactId !== undefined) allowed.contact_id = body.contactId;
  if (body.carrierId !== undefined) allowed.carrier_id = body.carrierId;

  const { data, error } = await supabase
    .from('documents')
    .update(allowed as any)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ document: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  const { data: versions } = await supabase
    .from('document_versions')
    .select('storage_path')
    .eq('document_id', id)
    .eq('user_id', user.id);

  const paths = [doc?.storage_path, ...(versions ?? []).map((v) => v.storage_path)].filter((p): p is string => !!p);
  if (paths.length) {
    await supabase.storage.from('documents').remove(paths);
  }

  const { error } = await supabase.from('documents').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  await logAudit(supabase, { userId: user.id, action: 'document.delete', entityType: 'document', entityId: id });
  return NextResponse.json({ success: true });
}
