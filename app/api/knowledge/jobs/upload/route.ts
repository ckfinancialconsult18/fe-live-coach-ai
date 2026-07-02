import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireUser, logAudit } from '@/lib/api/guard';
import { logPipelineEvent } from '@/lib/monitoring/log';
import { parseTranscript, detectFormat } from '@/lib/pipeline/parser';
import { normalizeText } from '@/lib/rag/chunk';
import { extractInsightsFromDb } from '@/lib/rag/extract-insights';
import type { PipelineJob } from '@/lib/pipeline/types';

// Vercel function timeout — AI/provider calls in this route routinely exceed the
// platform default (10-15s); without this the route 504s mid-generation.
export const maxDuration = 60;

/**
 * Replaces the filesystem-backed /api/pipeline/upload + /api/pipeline/process
 * loop with a single synchronous-per-file pipeline: store → extract → normalize
 * → insert pending knowledge_base rows → mark job pending_review. There is no
 * deduplication queue step anymore (the original "deduplicating" status is
 * skipped — the model itself dedupes against the existing-knowledge index
 * passed into the prompt, per lib/rag/extract-insights.ts).
 */
// Per-file cap — transcripts are text; anything larger is either not a
// transcript or will blow the serverless memory/time budget in parseTranscript.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB, matches the transcripts bucket limit
const ALLOWED_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'docx', 'vtt']);
const MAX_FILES_PER_REQUEST = 10;

export async function POST(request: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const formData = await request.formData();
  const files = formData.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: `Too many files — upload at most ${MAX_FILES_PER_REQUEST} per request` }, { status: 400 });
  }
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `"${file.name}" exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB per-file limit` },
        { status: 400 }
      );
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `"${file.name}" has unsupported type ".${ext}" — allowed: ${[...ALLOWED_EXTENSIONS].map((e) => '.' + e).join(', ')}` },
        { status: 400 }
      );
    }
  }

  const jobs: PipelineJob[] = [];

  for (const file of files) {
    const startedAt = Date.now();
    const format = detectFormat(file.name);

    const { data: job, error: jobErr } = await supabase
      .from('knowledge_jobs')
      .insert({ user_id: user.id, original_name: file.name, format, status: 'parsing', progress: 10, started_at: new Date().toISOString() } as never)
      .select()
      .single();

    if (jobErr || !job) {
      console.error('Failed to create knowledge job:', jobErr);
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await parseTranscript(buffer, format, file.name);
      const text = normalizeText(parsed.text);
      if (!text.trim()) throw new Error('No text extracted from file');

      await supabase.from('knowledge_jobs').update({ status: 'extracting', progress: 40, word_count: parsed.wordCount } as never).eq('id', job.id);

      const result = await extractInsightsFromDb(supabase, user.id, text, job.id);

      const rows = result.insights.map((insight) => ({
        user_id: user.id,
        knowledge_job_id: job.id,
        job_id: job.id,
        type: insight.type,
        target_file: insight.targetFile,
        section: insight.section,
        summary: insight.summary,
        content: insight.content,
        evidence: insight.evidence,
        markdown_entry: insight.markdownEntry,
        confidence: insight.confidence,
        tags: insight.tags,
        status: 'pending',
        original_filename: file.name,
        call_score: result.callScore,
      }));

      if (rows.length > 0) {
        const { error: insertErr } = await supabase.from('knowledge_base').insert(rows as never);
        if (insertErr) throw new Error(insertErr.message);
      }

      const { data: updatedJob } = await supabase
        .from('knowledge_jobs')
        .update({
          status: 'pending_review',
          progress: 100,
          extracted_count: result.insights.length,
          new_knowledge_count: rows.length,
          call_type: result.callType,
          call_outcome: result.callOutcome,
          call_score: result.callScore,
          completed_at: new Date().toISOString(),
        } as never)
        .eq('id', job.id)
        .select()
        .single();

      await logPipelineEvent(supabase, {
        userId: user.id,
        eventType: 'processing_complete',
        targetType: 'knowledge_job',
        targetId: job.id,
        durationMs: Date.now() - startedAt,
        metadata: { insightCount: rows.length },
      });

      if (updatedJob) jobs.push(toPipelineJob(updatedJob));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Knowledge job failed:', job.id, err);
      const { data: failedJob } = await supabase
        .from('knowledge_jobs')
        .update({ status: 'failed', error: message, completed_at: new Date().toISOString() } as never)
        .eq('id', job.id)
        .select()
        .single();

      await logPipelineEvent(supabase, {
        userId: user.id,
        eventType: 'extraction_failure',
        targetType: 'knowledge_job',
        targetId: job.id,
        durationMs: Date.now() - startedAt,
        message,
      });

      if (failedJob) jobs.push(toPipelineJob(failedJob));
    }
  }

  await logAudit(supabase, { userId: user.id, action: 'knowledge.bulk_upload', entityType: 'knowledge_job', metadata: { fileCount: files.length } });

  return NextResponse.json({ jobs });
}

function toPipelineJob(row: Record<string, any>): PipelineJob {
  return {
    id: row.id,
    originalName: row.original_name,
    format: row.format,
    status: row.status,
    progress: row.progress,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
    retryCount: row.retry_count,
    wordCount: row.word_count ?? undefined,
    extractedCount: row.extracted_count ?? undefined,
    newKnowledgeCount: row.new_knowledge_count ?? undefined,
    callType: row.call_type ?? undefined,
    callOutcome: row.call_outcome ?? undefined,
    callScore: row.call_score ?? undefined,
  };
}
