import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import type { PipelineJob } from '@/lib/pipeline/types';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data, error } = await supabase
    .from('knowledge_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  const jobs: PipelineJob[] = (data ?? []).map((row) => ({
    id: row.id,
    originalName: row.original_name,
    format: row.format as PipelineJob['format'],
    status: row.status as PipelineJob['status'],
    progress: row.progress,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
    retryCount: row.retry_count,
    wordCount: row.word_count ?? undefined,
    extractedCount: row.extracted_count ?? undefined,
    newKnowledgeCount: row.new_knowledge_count ?? undefined,
    callType: (row.call_type as PipelineJob['callType']) ?? undefined,
    callOutcome: (row.call_outcome as PipelineJob['callOutcome']) ?? undefined,
    callScore: row.call_score ?? undefined,
  }));

  return NextResponse.json({ jobs });
}
