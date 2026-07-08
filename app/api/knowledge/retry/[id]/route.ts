import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import { parseTranscript, detectFormat } from '@/lib/pipeline/parser';
import { normalizeText } from '@/lib/rag/chunk';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  // Verify ownership and get doc metadata
  const { data: doc } = await (supabase as any)
    .from('knowledge_documents')
    .select('id, storage_path, mime_type, raw_text, title')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let rawText: string = doc.raw_text ?? '';

  // If raw_text is empty (failed extraction), re-download and re-parse from storage
  if (!rawText.trim() && doc.storage_path) {
    const { data: fileData, error: dlError } = await supabase.storage
      .from('knowledge')
      .download(doc.storage_path);

    if (dlError || !fileData) {
      return NextResponse.json({ error: 'Could not download file from storage for re-processing.' }, { status: 500 });
    }

    try {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const filename = doc.storage_path.split('/').pop() ?? 'file';
      const format = detectFormat(filename);
      const parsed = await parseTranscript(buffer, format, filename);
      rawText = normalizeText(parsed.text);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Re-parsing failed' },
        { status: 422 },
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'No text could be extracted from this file even with vision OCR.' }, { status: 422 });
    }

    // Save the newly extracted text
    await (supabase as any)
      .from('knowledge_documents')
      .update({ raw_text: rawText, status: 'processing' })
      .eq('id', id)
      .eq('user_id', user.id);
  } else {
    // Has text — just reset status
    await (supabase as any)
      .from('knowledge_documents')
      .update({ status: 'processing' })
      .eq('id', id)
      .eq('user_id', user.id);
  }

  // Delete any stuck queue entry and re-insert fresh
  await (supabase as any).from('embedding_queue').delete().eq('target_id', id).eq('target_type', 'knowledge_document');
  await (supabase as any).from('embedding_queue').insert({
    user_id: user.id,
    target_type: 'knowledge_document',
    target_id: id,
    status: 'pending',
  });

  return NextResponse.json({ ok: true });
}
