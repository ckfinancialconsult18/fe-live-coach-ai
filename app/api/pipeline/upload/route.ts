import { NextRequest, NextResponse } from 'next/server';
import { createJob, saveRawFile, generateId } from '@/lib/pipeline/queue';
import { detectFormat } from '@/lib/pipeline/parser';
import type { PipelineJob } from '@/lib/pipeline/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const jobs: PipelineJob[] = [];

    for (const file of files) {
      if (!file.name || file.size === 0) continue;

      const jobId = generateId();
      const format = detectFormat(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());

      await saveRawFile(jobId, file.name, buffer);

      const job: PipelineJob = {
        id: jobId,
        originalName: file.name,
        format,
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };

      await createJob(job);
      jobs.push(job);
    }

    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
