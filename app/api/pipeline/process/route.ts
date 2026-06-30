import { NextResponse } from 'next/server';
import {
  claimNextJob,
  updateJob,
  readRawFile,
  saveTranscriptText,
  resetStuckJobs,
} from '@/lib/pipeline/queue';
import { parseTranscript } from '@/lib/pipeline/parser';
import { extractInsights } from '@/lib/pipeline/extractor';
import { deduplicateInsights } from '@/lib/pipeline/deduplicator';
import { savePendingEntries, listPendingIndex } from '@/lib/pipeline/knowledge-store';
import type { PendingKnowledgeEntry } from '@/lib/pipeline/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST() {
  // Reset any jobs stuck in processing for >10 minutes
  await resetStuckJobs();

  const job = await claimNextJob();
  if (!job) return NextResponse.json({ done: true });

  try {
    // 1. Parse
    await updateJob(job.id, { status: 'parsing', progress: 10 });
    const buffer = await readRawFile(job.id, job.originalName);
    const parsed = await parseTranscript(buffer, job.format, job.originalName);
    await saveTranscriptText(job.id, parsed.text);
    await updateJob(job.id, { progress: 25, wordCount: parsed.wordCount });

    // 2. Extract
    await updateJob(job.id, { status: 'extracting', progress: 30 });
    const extraction = await extractInsights(parsed.text, job.id);
    await updateJob(job.id, {
      progress: 65,
      extractedCount: extraction.insights.length,
      callType: extraction.callType,
      callOutcome: extraction.callOutcome,
      callScore: extraction.callScore,
    });

    // 3. Deduplicate
    await updateJob(job.id, { status: 'deduplicating', progress: 75 });
    const { entries: existingIndex } = await listPendingIndex('all', 1, 2000);
    const deduped = await deduplicateInsights(extraction.insights, existingIndex);

    // 4. Save pending entries
    const toSave: Omit<PendingKnowledgeEntry, 'id' | 'createdAt' | 'status'>[] = deduped.map(
      ({ insight, isDuplicate, similarTo, conflictsWith }) => ({
        jobId: job.id,
        originalFilename: job.originalName,
        type: insight.type,
        targetFile: insight.targetFile,
        section: insight.section,
        summary: insight.summary,
        content: insight.content,
        evidence: insight.evidence,
        confidence: insight.confidence,
        tags: insight.tags,
        markdownEntry: insight.markdownEntry,
        isDuplicate,
        similarTo,
        conflictsWith,
        callSummary: extraction.callSummary,
        callType: extraction.callType,
        callOutcome: extraction.callOutcome,
        callScore: extraction.callScore,
      })
    );

    await savePendingEntries(toSave);
    const newCount = toSave.filter((e) => !e.isDuplicate).length;

    // 5. Complete
    await updateJob(job.id, {
      status: 'pending_review',
      progress: 100,
      completedAt: new Date().toISOString(),
      newKnowledgeCount: newCount,
    });

    return NextResponse.json({
      done: false,
      jobId: job.id,
      extracted: extraction.insights.length,
      newKnowledge: newCount,
      duplicatesSkipped: toSave.length - newCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing error';
    const shouldRetry = job.retryCount < 3;
    await updateJob(job.id, {
      status: shouldRetry ? 'queued' : 'failed',
      progress: 0,
      retryCount: job.retryCount + 1,
      error: message,
      startedAt: undefined,
    });
    return NextResponse.json({ done: false, jobId: job.id, error: message }, { status: 500 });
  }
}
