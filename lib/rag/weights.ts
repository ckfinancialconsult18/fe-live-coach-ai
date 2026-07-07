/**
 * Adaptive coaching weights — learns which uploaded documents drive
 * successful calls and re-ranks retrieved chunks accordingly.
 *
 * Weight range: [0.5, 2.0], default 1.0 (neutral / no data yet).
 *
 * Effective similarity = chunk.similarity * document_weight
 * This means a document that consistently contributes to won calls rises
 * toward the top of retrieval even at moderate cosine similarity.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetrievedChunk } from './retrieve';

export interface WeightedChunk extends RetrievedChunk {
  weight: number;
  effectiveSimilarity: number;
}

/**
 * Load per-document weights and re-rank chunks by effectiveSimilarity.
 * Falls back to original order silently on any error.
 */
export async function applyAdaptiveWeights(
  supabase: SupabaseClient<any>,
  userId: string,
  chunks: RetrievedChunk[],
): Promise<WeightedChunk[]> {
  if (!chunks.length) return [];

  const docIds = [...new Set(chunks.map((c) => c.documentId).filter(Boolean))] as string[];

  let weightMap = new Map<string, number>();
  if (docIds.length) {
    try {
      const { data } = await supabase
        .from('knowledge_document_stats')
        .select('document_id, weight')
        .eq('user_id', userId)
        .in('document_id', docIds);
      (data ?? []).forEach((row: any) => weightMap.set(row.document_id, row.weight ?? 1.0));
    } catch { /* degrade silently */ }
  }

  return chunks
    .map((c) => {
      const w = (c.documentId ? weightMap.get(c.documentId) : undefined) ?? 1.0;
      return { ...c, weight: w, effectiveSimilarity: c.similarity * w };
    })
    .sort((a, b) => b.effectiveSimilarity - a.effectiveSimilarity);
}

/**
 * Fire-and-forget: log retrieved chunks + bump retrieval counts.
 * Never throws — weight tracking is non-blocking.
 */
export function logRetrieval(
  supabase: SupabaseClient<any>,
  userId: string,
  chunks: RetrievedChunk[],
  callId?: string | null,
  coachingContext?: string | null,
): void {
  if (!chunks.length) return;

  // Log individual chunk retrievals
  const rows = chunks.map((c) => ({
    user_id: userId,
    call_id: callId ?? null,
    chunk_id: c.id,
    document_id: c.documentId ?? null,
    knowledge_base_id: c.knowledgeBaseId ?? null,
    similarity: c.similarity,
    coaching_context: coachingContext ?? null,
  }));

  void Promise.resolve(supabase.from('knowledge_retrieval_log').insert(rows)).catch(() => {});

  // Atomically increment retrieval_count for each unique document
  const uniqueDocs = [...new Set(chunks.map((c) => c.documentId).filter(Boolean))] as string[];
  const uniqueKbs = [...new Set(chunks.map((c) => c.knowledgeBaseId).filter(Boolean))] as string[];

  for (const docId of uniqueDocs) {
    void Promise.resolve(supabase.rpc('increment_knowledge_retrieval', { p_user_id: userId, p_document_id: docId })).catch(() => {});
  }
  for (const kbId of uniqueKbs) {
    void Promise.resolve(supabase.rpc('increment_knowledge_retrieval', { p_user_id: userId, p_knowledge_base_id: kbId })).catch(() => {});
  }
}

/**
 * Called from post-call when outcome = 'policy_written'.
 * Finds all documents retrieved during this call and records positive outcomes.
 * Triggers weight recomputation in Postgres.
 */
export async function recordPositiveOutcome(
  supabase: SupabaseClient<any>,
  userId: string,
  callId: string,
): Promise<void> {
  try {
    const { data: logs } = await supabase
      .from('knowledge_retrieval_log')
      .select('document_id')
      .eq('user_id', userId)
      .eq('call_id', callId)
      .not('document_id', 'is', null);

    if (!logs?.length) return;

    const docIds = [...new Set((logs as any[]).map((l) => l.document_id as string))];
    await Promise.all(
      docIds.map((docId) =>
        supabase.rpc('record_knowledge_positive_outcome', {
          p_user_id: userId,
          p_document_id: docId,
        }),
      ),
    );
  } catch (err) {
    console.error('[weights] recordPositiveOutcome failed:', err);
  }
}
