import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, logAudit } from '@/lib/api/guard';
import { MAX_FILE_SIZE_BYTES, isAllowedMimeType, DOCUMENT_CATEGORIES } from '@/lib/documents/constants';
import { hashFile } from '@/lib/documents/hash';

export async function GET(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const category = searchParams.get('category');
  const folder = searchParams.get('folder');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '50')));

  let query = supabase
    .from('documents')
    .select('*, contacts(first_name, last_name), carriers(name)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (q) query = query.textSearch('search_vector', q, { type: 'websearch' });
  if (category) query = query.eq('category', category as any);
  if (folder) query = query.eq('folder', folder);

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const documents = (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    folder: d.folder,
    tags: d.tags,
    fileSize: d.file_size,
    mimeType: d.mime_type,
    version: d.version,
    scanStatus: d.scan_status,
    clientName: d.contacts ? `${d.contacts.first_name} ${d.contacts.last_name}` : null,
    carrierName: d.carriers?.name ?? null,
    createdAt: d.created_at,
  }));

  return NextResponse.json({ documents, total: count ?? 0, page, pageSize });
}

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: `File exceeds the ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit` }, { status: 400 });
  }
  if (!isAllowedMimeType(file.type)) {
    return NextResponse.json({ error: `File type "${file.type}" is not allowed` }, { status: 400 });
  }

  const category = String(formData.get('category') ?? 'other');
  if (!DOCUMENT_CATEGORIES.includes(category as any)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  const contactId = formData.get('contactId') ? String(formData.get('contactId')) : null;
  const carrierId = formData.get('carrierId') ? String(formData.get('carrierId')) : null;
  const folder = String(formData.get('folder') ?? 'general');
  const tags = String(formData.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const documentId = formData.get('documentId') ? String(formData.get('documentId')) : null;

  const fileHash = await hashFile(file);
  if (!documentId) {
    const { data: dup } = await supabase
      .from('documents')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('file_hash', fileHash)
      .limit(1)
      .maybeSingle();
    if (dup) {
      return NextResponse.json(
        { error: `Duplicate file — identical content already uploaded as "${dup.name}"`, duplicateOf: dup.id },
        { status: 409 }
      );
    }
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  const storagePath = `${user.id}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // scan_status stays 'pending' — actual virus-scan integration (e.g. ClamAV
  // via an edge function, or a third-party API) is not wired up; this column
  // is the hook point for that integration.

  if (documentId) {
    // New version of an existing document.
    const { data: existing, error: fetchErr } = await supabase
      .from('documents')
      .select('version')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();
    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const nextVersion = existing.version + 1;

    await supabase.from('document_versions').insert({
      document_id: documentId,
      user_id: user.id,
      version: nextVersion,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
    });

    const { data: updated, error: updateErr } = await supabase
      .from('documents')
      .update({ storage_path: storagePath, file_size: file.size, mime_type: file.type, version: nextVersion, scan_status: 'pending', file_hash: fileHash } as any)
      .eq('id', documentId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    await logAudit(supabase, { userId: user.id, action: 'document.new_version', entityType: 'document', entityId: documentId, metadata: { version: nextVersion } });
    return NextResponse.json({ document: updated }, { status: 201 });
  }

  const { data: doc, error: insertError } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      contact_id: contactId,
      carrier_id: carrierId,
      name: file.name,
      original_filename: file.name,
      category,
      folder,
      tags,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      file_hash: fileHash,
    } as any)
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  await logAudit(supabase, { userId: user.id, action: 'document.upload', entityType: 'document', entityId: doc.id, metadata: { name: file.name, size: file.size } });
  return NextResponse.json({ document: doc }, { status: 201 });
}
