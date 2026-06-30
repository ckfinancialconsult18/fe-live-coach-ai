import { NextRequest, NextResponse } from 'next/server';
import { listJobs, getJob } from '@/lib/pipeline/queue';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const job = await getJob(id);
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ job });
  }

  const limit = parseInt(searchParams.get('limit') ?? '200');
  const offset = parseInt(searchParams.get('offset') ?? '0');
  const jobs = await listJobs(limit, offset);

  const summary = {
    queued: jobs.filter((j) => j.status === 'queued').length,
    processing: jobs.filter((j) =>
      ['parsing', 'extracting', 'deduplicating'].includes(j.status)
    ).length,
    completed: jobs.filter((j) => j.status === 'pending_review' || j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  return NextResponse.json({ jobs, summary });
}
