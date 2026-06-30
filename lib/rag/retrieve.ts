import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { embedText } from './embed';

export type RetrievedChunk = {
  id: string;
  content: string;
  similarity: number;
  documentId: string | null;
  knowledgeBaseId: string | null;
};

/**
 * Embeds the query and runs cosine-similarity search via the
 * `match_knowledge_chunks` Postgres function (pgvector ivfflat index).
 * Returns [] silently if there's no OpenAI key or no chunks yet — RAG is an
 * enhancement, not a hard dependency for /api/coach to function.
 */
export async function retrieveRelevantChunks(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string,
  opts: { matchCount?: number; minSimilarity?: number } = {}
): Promise<RetrievedChunk[]> {
  if (!process.env.OPENAI_API_KEY) return [];
  if (!query.trim()) return [];

  let embedding: number[];
  try {
    embedding = await embedText(query);
  } catch (err) {
    console.error('Embedding query failed:', err);
    return [];
  }

  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: embedding as any,
    match_user_id: userId,
    match_count: opts.matchCount ?? 6,
    min_similarity: opts.minSimilarity ?? 0.5,
  });

  if (error) {
    console.error('match_knowledge_chunks failed:', error);
    return [];
  }

  return (data ?? []).map((r: any) => ({
    id: r.id,
    content: r.content,
    similarity: r.similarity,
    documentId: r.document_id,
    knowledgeBaseId: r.knowledge_base_id,
  }));
}

export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  return chunks
    .map((c, i) => `[Source ${i + 1}, relevance ${(c.similarity * 100).toFixed(0)}%]\n${c.content}`)
    .join('\n\n---\n\n');
}
