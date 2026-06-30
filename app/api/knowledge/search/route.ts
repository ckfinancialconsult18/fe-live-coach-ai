import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import { retrieveRelevantChunks } from '@/lib/rag/retrieve';
import { logPipelineEvent } from '@/lib/monitoring/log';

type SearchResult = {
  chunkId: string | null;
  documentId: string;
  title: string;
  sourceType: string;
  snippet: string;
  similarity: number | null;
  matchType: 'semantic' | 'keyword' | 'hybrid';
  createdAt: string;
};

export async function GET(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const carrierId = searchParams.get('carrierId');
  const sourceType = searchParams.get('sourceType');
  const categoryId = searchParams.get('categoryId');
  const fromDate = searchParams.get('from');
  const toDate = searchParams.get('to');

  if (!q.trim()) return NextResponse.json({ results: [] });

  // Keyword search over knowledge_documents (title/raw_text/tags), with filters.
  let keywordQuery = supabase
    .from('knowledge_documents')
    .select('id, title, source_type, raw_text, carrier_id, category_id, created_at')
    .eq('user_id', user.id)
    .textSearch('search_vector', q, { type: 'websearch' });

  if (carrierId) keywordQuery = keywordQuery.eq('carrier_id', carrierId);
  if (sourceType) keywordQuery = keywordQuery.eq('source_type', sourceType as never);
  if (categoryId) keywordQuery = keywordQuery.eq('category_id', categoryId);
  if (fromDate) keywordQuery = keywordQuery.gte('created_at', fromDate);
  if (toDate) keywordQuery = keywordQuery.lte('created_at', toDate);

  const [keywordRes, semanticChunks] = await Promise.all([
    keywordQuery.limit(10),
    retrieveRelevantChunks(supabase, user.id, q, { matchCount: 10, minSimilarity: 0.35 }),
  ]);

  // Hydrate semantic chunk hits with parent document metadata + apply the
  // same filters (pgvector RPC doesn't take arbitrary filter params, so we
  // filter post-hoc here).
  const semanticDocIds = [...new Set(semanticChunks.map((c) => c.documentId).filter((id): id is string => !!id))];
  const { data: semanticDocs } = semanticDocIds.length
    ? await supabase.from('knowledge_documents').select('id, title, source_type, carrier_id, category_id, created_at').in('id', semanticDocIds)
    : { data: [] as { id: string; title: string; source_type: string; carrier_id: string | null; category_id: string | null; created_at: string }[] };

  const passesFilters = (doc: { carrier_id: string | null; category_id: string | null; created_at: string }) => {
    if (carrierId && doc.carrier_id !== carrierId) return false;
    if (categoryId && doc.category_id !== categoryId) return false;
    if (fromDate && doc.created_at < fromDate) return false;
    if (toDate && doc.created_at > toDate) return false;
    return true;
  };

  const resultsByDoc = new Map<string, SearchResult>();

  for (const chunk of semanticChunks) {
    if (!chunk.documentId) continue;
    const doc = semanticDocs?.find((d) => d.id === chunk.documentId);
    if (!doc || !passesFilters(doc)) continue;
    if (sourceType && doc.source_type !== sourceType) continue;
    resultsByDoc.set(doc.id, {
      chunkId: chunk.id,
      documentId: doc.id,
      title: doc.title,
      sourceType: doc.source_type,
      snippet: chunk.content.slice(0, 280),
      similarity: chunk.similarity,
      matchType: 'semantic',
      createdAt: doc.created_at,
    });
  }

  for (const doc of keywordRes.data ?? []) {
    const existing = resultsByDoc.get(doc.id);
    if (existing) {
      existing.matchType = 'hybrid'; // found by both — rank it highest
      continue;
    }
    resultsByDoc.set(doc.id, {
      chunkId: null,
      documentId: doc.id,
      title: doc.title,
      sourceType: doc.source_type,
      snippet: (doc.raw_text ?? '').slice(0, 280),
      similarity: null,
      matchType: 'keyword',
      createdAt: doc.created_at,
    });
  }

  // Hybrid ranking: hybrid (both signals) > semantic (by similarity) > keyword.
  const rank = { hybrid: 0, semantic: 1, keyword: 2 };
  const results = Array.from(resultsByDoc.values()).sort((a, b) => {
    if (rank[a.matchType] !== rank[b.matchType]) return rank[a.matchType] - rank[b.matchType];
    return (b.similarity ?? 0) - (a.similarity ?? 0);
  });

  const durationMs = Date.now() - startedAt;
  await Promise.all([
    supabase.from('search_analytics').insert({ user_id: user.id, query: q, result_count: results.length } as never),
    logPipelineEvent(supabase, { userId: user.id, eventType: 'search_latency', durationMs, message: q, metadata: { resultCount: results.length } }),
  ]);

  return NextResponse.json({ results, tookMs: durationMs });
}
