import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export interface DocumentStat {
  documentId: string | null;
  title: string;
  sourceType: string;
  retrievalCount: number;
  positiveOutcomeCount: number;
  weight: number;
  winRate: number | null;
  lastRetrievedAt: string | null;
}

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  // Load stats joined with document titles
  const { data: statsRows } = await db
    .from('knowledge_document_stats')
    .select(`
      document_id,
      knowledge_base_id,
      retrieval_count,
      positive_outcome_count,
      weight,
      last_retrieved_at,
      knowledge_documents (
        title,
        source_type
      ),
      knowledge_base (
        original_filename
      )
    `)
    .eq('user_id', user.id)
    .order('weight', { ascending: false });

  // Load documents that have never been retrieved (retrieval_count = 0 means no stats row)
  const { data: allDocs } = await db
    .from('knowledge_documents')
    .select('id, title, source_type, status, created_at')
    .eq('user_id', user.id)
    .eq('status', 'ready')
    .eq('archived', false);

  const statDocIds = new Set<string>(
    (statsRows ?? []).map((r: any) => r.document_id).filter(Boolean),
  );

  const unusedDocs = (allDocs ?? []).filter((d: any) => !statDocIds.has(d.id)).map((d: any) => ({
    documentId: d.id,
    title: d.title,
    sourceType: d.source_type,
    retrievalCount: 0,
    positiveOutcomeCount: 0,
    weight: 1.0,
    winRate: null,
    lastRetrievedAt: null,
  }));

  const activeDocs: DocumentStat[] = (statsRows ?? []).map((r: any) => {
    const doc = r.knowledge_documents;
    const kb = r.knowledge_base;
    const title = doc?.title ?? kb?.original_filename ?? 'Unknown';
    const sourceType = doc?.source_type ?? 'call_transcript';
    const winRate = r.retrieval_count >= 3
      ? Math.round((r.positive_outcome_count / r.retrieval_count) * 100)
      : null;
    return {
      documentId: r.document_id ?? null,
      title,
      sourceType,
      retrievalCount: r.retrieval_count,
      positiveOutcomeCount: r.positive_outcome_count,
      weight: r.weight,
      winRate,
      lastRetrievedAt: r.last_retrieved_at,
    };
  });

  // Summary stats
  const allStats = [...activeDocs, ...unusedDocs];
  const totalDocs = allStats.length;
  const everRetrieved = activeDocs.length;
  const highWeight = activeDocs.filter((d) => d.weight >= 1.4);
  const lowWeight = activeDocs.filter((d) => d.weight < 0.8);
  const neverUsed = unusedDocs.length;

  return NextResponse.json({
    docs: allStats,
    summary: {
      totalDocs,
      everRetrieved,
      neverUsed,
      topSources: highWeight.slice(0, 3),
      underperforming: lowWeight.slice(0, 3),
    },
  });
}
