import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import type { PendingEntryIndex, PendingKnowledgeEntry } from '@/lib/pipeline/types';

export async function GET(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await supabase.from('knowledge_base').select('*').eq('id', id).eq('user_id', user.id).single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const entry: PendingKnowledgeEntry = {
      id: data.id,
      jobId: data.knowledge_job_id ?? data.job_id ?? '',
      originalFilename: data.original_filename ?? '',
      type: data.type as PendingKnowledgeEntry['type'],
      targetFile: data.target_file as PendingKnowledgeEntry['targetFile'],
      summary: data.summary,
      confidence: data.confidence,
      status: data.status,
      isDuplicate: data.is_duplicate,
      createdAt: data.created_at,
      tags: data.tags,
      section: data.section ?? '',
      content: data.content,
      evidence: data.evidence ?? '',
      markdownEntry: data.markdown_entry ?? '',
      reviewedAt: data.reviewed_at ?? undefined,
      reviewNote: data.review_note ?? undefined,
      callScore: data.call_score ?? undefined,
    };
    return NextResponse.json({ entry });
  }

  const filter = searchParams.get('filter') ?? 'pending';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? '50')));

  let query = supabase.from('knowledge_base').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (filter !== 'all') query = query.eq('status', filter as never);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  const entries: PendingEntryIndex[] = (data ?? []).map((row) => ({
    id: row.id,
    jobId: row.knowledge_job_id ?? row.job_id ?? '',
    originalFilename: row.original_filename ?? '',
    type: row.type as PendingEntryIndex['type'],
    targetFile: row.target_file as PendingEntryIndex['targetFile'],
    summary: row.summary,
    confidence: row.confidence,
    status: row.status,
    isDuplicate: row.is_duplicate,
    createdAt: row.created_at,
    tags: row.tags,
  }));

  return NextResponse.json({ entries, total: count ?? 0, page, pageSize });
}
