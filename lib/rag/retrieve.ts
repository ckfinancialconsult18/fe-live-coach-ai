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

export interface RagSource {
  chunkId: string;
  documentId: string | null;
  title: string | null;
  sourceType: string | null;
  similarity: number;
}

/**
 * Resolves chunk document IDs → human-readable source metadata.
 * Used by non-streaming routes to return attribution alongside AI output.
 */
export async function getChunkSources(
  supabase: SupabaseClient<Database>,
  chunks: RetrievedChunk[],
): Promise<RagSource[]> {
  if (!chunks.length) return [];
  const docIds = [...new Set(chunks.map((c) => c.documentId).filter(Boolean))] as string[];
  const kbIds = [...new Set(chunks.map((c) => c.knowledgeBaseId).filter(Boolean))] as string[];

  const [docRes, kbRes] = await Promise.all([
    docIds.length
      ? (supabase as any).from('knowledge_documents').select('id, title, source_type').in('id', docIds)
      : Promise.resolve({ data: [] }),
    kbIds.length
      ? (supabase as any).from('knowledge_base').select('id, original_filename').in('id', kbIds)
      : Promise.resolve({ data: [] }),
  ]);

  const docMap = new Map<string, { title: string; source_type: string }>(
    (docRes.data ?? []).map((d: any) => [d.id, d]),
  );
  const kbMap = new Map<string, { original_filename: string }>(
    (kbRes.data ?? []).map((k: any) => [k.id, k]),
  );

  return chunks.map((c) => {
    if (c.documentId && docMap.has(c.documentId)) {
      const d = docMap.get(c.documentId)!;
      return { chunkId: c.id, documentId: c.documentId, title: d.title, sourceType: d.source_type, similarity: c.similarity };
    }
    if (c.knowledgeBaseId && kbMap.has(c.knowledgeBaseId)) {
      const k = kbMap.get(c.knowledgeBaseId)!;
      return { chunkId: c.id, documentId: null, title: k.original_filename, sourceType: 'call_transcript', similarity: c.similarity };
    }
    return { chunkId: c.id, documentId: c.documentId, title: null, sourceType: null, similarity: c.similarity };
  }).filter((s) => s.title !== null);
}
