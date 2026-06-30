import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/pipeline/queue';
import { readStats } from '@/lib/pipeline/knowledge-store';

export const runtime = 'nodejs';

export async function GET() {
  const [stats, jobs] = await Promise.all([readStats(), listJobs(1000)]);

  // Merge live queue counts into stats
  stats.totalJobs = jobs.length;
  stats.completedJobs = jobs.filter(
    (j) => j.status === 'pending_review' || j.status === 'completed'
  ).length;
  stats.failedJobs = jobs.filter((j) => j.status === 'failed').length;
  stats.queuedJobs = jobs.filter((j) => j.status === 'queued').length;
  stats.totalTranscripts = jobs.length;
  stats.salesCalls = jobs.filter((j) => j.callType === 'sales').length;
  stats.coachingCalls = jobs.filter((j) => j.callType === 'coaching').length;

  return NextResponse.json({ stats });
}
