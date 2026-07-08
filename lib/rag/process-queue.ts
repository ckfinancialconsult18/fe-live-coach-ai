import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { chunkText, estimateTokens } from './chunk';
import { embedTexts } from './embed';
import { logPipelineEvent } from '@/lib/monitoring/log';

const BATCH_SIZE = 20;

/**
 * Drains pending embedding_queue rows: chunk → embed → store → mark ready.
 * Shared by app/api/knowledge/process-queue (user-triggered, RLS-scoped
 * client) and app/api/cron/process-embedding-queue (Vercel Cron, service-role
 * client spanning all users). Pass `userId` to scope to one user; omit (with
 * an admin client) to drain across all users.
 */
export async function processEmbeddingQueue(
  supabase: SupabaseClient<Database>,
  opts: { userId?: string } = {}
) {
  let query = supabase.from('embedding_queue').select('*').eq('status', 'pending').order('created_at').limit(BATCH_SIZE);
  if (opts.userId) query = query.eq('user_id', opts.userId);

  const { data: jobs, error: queueError } = await query;
  if (queueError) throw new Error(queueError.message);
  if (!jobs || jobs.length === 0) return { processed: 0, failed: 0, remaining: 0 };

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const startedAt = Date.now();
    await supabase.from('embedding_queue').update({ status: 'processing' } as never).eq('id', job.id);

    try {
      let text = '';
      if (job.target_type === 'knowledge_document') {
        const { data: doc } = await supabase.from('knowledge_documents').select('raw_text').eq('id', job.target_id).single();
        text = doc?.raw_text ?? '';
      } else {
        const { data: kb } = await supabase.from('knowledge_base').select('summary, content, evidence').eq('id', job.target_id).single();
        text = [kb?.summary, kb?.content, kb?.evidence].filter(Boolean).join('\n\n');
      }

      if (!text.trim()) throw new Error('No text to embed');

      const chunks = chunkText(text);
      if (chunks.length === 0) throw new Error('Chunking produced no segments');

      const embeddings = await embedTexts(chunks);

      // Clear any prior chunks for this target (re-indexing case).
      if (job.target_type === 'knowledge_document') {
        await supabase.from('knowledge_chunks').delete().eq('document_id', job.target_id);
      } else {
        await supabase.from('knowledge_chunks').delete().eq('knowledge_base_id', job.target_id);
      }

      const rows = chunks.map((content, i) => ({
        user_id: job.user_id,
        document_id: job.target_type === 'knowledge_document' ? job.target_id : null,
        knowledge_base_id: job.target_type === 'knowledge_base' ? job.target_id : null,
        chunk_index: i,
        content,
        token_count: estimateTokens(content),
        embedding: embeddings[i],
      }));

      const { error: insertErr } = await supabase.from('knowledge_chunks').insert(rows as never);
      if (insertErr) throw new Error(insertErr.message);

      if (job.target_type === 'knowledge_document') {
        await supabase.from('knowledge_documents').update({ status: 'ready' } as never).eq('id', job.target_id);
      }

      await supabase.from('embedding_queue').update({ status: 'done', processed_at: new Date().toISOString() } as never).eq('id', job.id);
      await logPipelineEvent(supabase, {
        userId: job.user_id,
        eventType: 'processing_complete',
        targetType: job.target_type,
        targetId: job.target_id,
        durationMs: Date.now() - startedAt,
      });
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Embedding job failed:', job.id, err);
      await supabase
        .from('embedding_queue')
        .update({ status: 'failed', attempts: job.attempts + 1, error: message } as never)
        .eq('id', job.id);
      if (job.target_type === 'knowledge_document') {
        await supabase.from('knowledge_documents').update({ status: 'failed' } as never).eq('id', job.target_id);
      }
      await logPipelineEvent(supabase, {
        userId: job.user_id,
        eventType: 'embedding_failure',
        targetType: job.target_type,
        targetId: job.target_id,
        durationMs: Date.now() - startedAt,
        message,
      });
      failed++;
    }
  }

  return { processed, failed, remaining: jobs.length - processed - failed };
}
