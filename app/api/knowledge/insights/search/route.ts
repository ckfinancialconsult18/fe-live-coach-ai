import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import { logPipelineEvent } from '@/lib/monitoring/log';
import type { SearchResult, PendingKnowledgeEntry } from '@/lib/pipeline/types';

function highlight(text: string, terms: string[]): string {
  if (!text) return text;
  let out = text;
  for (const term of terms) {
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(${escaped})`, 'gi'), '**$1**');
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '30')));

  let query = supabase.from('knowledge_base').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  // knowledge_base's full-text index (migration 12) is a functional index,
  // not a generated column, so PostgREST .textSearch() can't target it
  // directly — fall back to ILIKE across the searchable fields.
  if (q.trim()) query = query.or(`summary.ilike.%${q}%,content.ilike.%${q}%,evidence.ilike.%${q}%`);
  if (status) query = query.eq('status', status as never);
  if (type) query = query.eq('type', type as never);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const terms = q.split(/\s+/).filter(Boolean);
  const results: SearchResult[] = (data ?? []).map((row) => {
    const entry: PendingKnowledgeEntry = {
      id: row.id,
      jobId: row.knowledge_job_id ?? row.job_id ?? '',
      originalFilename: row.original_filename ?? '',
      type: row.type as PendingKnowledgeEntry['type'],
      targetFile: row.target_file as PendingKnowledgeEntry['targetFile'],
      summary: row.summary,
      confidence: row.confidence,
      status: row.status,
      isDuplicate: row.is_duplicate,
      createdAt: row.created_at,
      tags: row.tags,
      section: row.section ?? '',
      content: row.content,
      evidence: row.evidence ?? '',
      markdownEntry: row.markdown_entry ?? '',
    };
    return {
      entry,
      score: row.confidence,
      matchedFields: ['summary', 'content'],
      highlights: { summary: highlight(row.summary, terms), evidence: highlight(row.evidence ?? '', terms) },
    };
  });

  const durationMs = Date.now() - startedAt;
  await logPipelineEvent(supabase, { userId: user.id, eventType: 'search_latency', durationMs, message: q, metadata: { resultCount: results.length } });

  return NextResponse.json({ results, total: count ?? 0, page, pageSize, tookMs: durationMs });
}
