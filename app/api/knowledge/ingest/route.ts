import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, handleApiError, logAudit } from '@/lib/api/guard';
import { parseTranscript, detectFormat } from '@/lib/pipeline/parser';
import { normalizeText } from '@/lib/rag/chunk';
import { logPipelineEvent } from '@/lib/monitoring/log';

const ALLOWED_SOURCE_TYPES = [
  'carrier_guide', 'underwriting_manual', 'script', 'objection_handling',
  'closing_technique', 'compliance', 'product_doc', 'training', 'other',
];

/**
 * Knowledge ingestion pipeline, step 1: store the document + extract text.
 * Chunking/embedding happens asynchronously via the embedding_queue, drained
 * by app/api/knowledge/process-queue (see that file for why this is a
 * pull-based "queue" rather than a true background worker in this stack).
 */
export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new Error('No file provided');

    const title = String(formData.get('title') ?? file.name);
    const sourceType = String(formData.get('sourceType') ?? 'other');
    if (!ALLOWED_SOURCE_TYPES.includes(sourceType)) {
      return NextResponse.json({ error: 'Invalid sourceType' }, { status: 400 });
    }
    const categoryId = formData.get('categoryId') ? String(formData.get('categoryId')) : null;
    const carrierId = formData.get('carrierId') ? String(formData.get('carrierId')) : null;
    const tags = String(formData.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean);

    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    // Store images as octet-stream to avoid bucket MIME allowlist restrictions
    const storageMime = isImage ? 'application/octet-stream' : file.type;
    const storagePath = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('knowledge')
      .upload(storagePath, file, { contentType: storageMime, upsert: false });
    if (uploadError) {
      await logPipelineEvent(supabase, { userId: user.id, eventType: 'upload_failure', message: uploadError.message, metadata: { fileName: file.name } });
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Extract → normalize. Reuses the existing transcript/document parser
    // (handles txt/md/pdf/docx).
    const buffer = Buffer.from(await file.arrayBuffer());
    let rawText = '';
    try {
      const format = detectFormat(file.name);
      const parsed = await parseTranscript(buffer, format, file.name);
      rawText = normalizeText(parsed.text);
    } catch (err) {
      console.error('Text extraction failed:', err);
      await logPipelineEvent(supabase, {
        userId: user.id,
        eventType: 'extraction_failure',
        message: err instanceof Error ? err.message : String(err),
        metadata: { fileName: file.name },
      });
    }

    const { data: doc, error: insertError } = await supabase
      .from('knowledge_documents')
      .insert({
        user_id: user.id,
        category_id: categoryId,
        carrier_id: carrierId,
        title,
        source_type: sourceType as any,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        raw_text: rawText,
        status: rawText ? 'processing' : 'failed',
        tags,
      } as any)
      .select()
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    if (rawText) {
      await supabase.from('embedding_queue').insert({
        user_id: user.id,
        target_type: 'knowledge_document',
        target_id: doc.id,
      } as any);
    }

    await logAudit(supabase, { userId: user.id, action: 'knowledge.ingest', entityType: 'knowledge_document', entityId: doc.id, metadata: { title, sourceType } });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
