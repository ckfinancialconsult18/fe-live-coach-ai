import fs from 'fs/promises';
import path from 'path';
import type { PipelineJob, JobStatus } from './types';

const DATA_DIR = path.join(process.cwd(), 'data', 'pipeline');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'raw'), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'transcripts'), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'pending'), { recursive: true });
}

async function readQueue(): Promise<PipelineJob[]> {
  try {
    const raw = await fs.readFile(QUEUE_FILE, 'utf-8');
    return JSON.parse(raw) as PipelineJob[];
  } catch {
    return [];
  }
}

async function writeQueue(jobs: PipelineJob[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(QUEUE_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

export async function createJob(job: PipelineJob): Promise<void> {
  const jobs = await readQueue();
  jobs.push(job);
  await writeQueue(jobs);
}

export async function updateJob(id: string, patch: Partial<PipelineJob>): Promise<void> {
  const jobs = await readQueue();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) return;
  jobs[idx] = { ...jobs[idx], ...patch };
  await writeQueue(jobs);
}

export async function getJob(id: string): Promise<PipelineJob | null> {
  const jobs = await readQueue();
  return jobs.find((j) => j.id === id) ?? null;
}

export async function listJobs(limit = 200, offset = 0): Promise<PipelineJob[]> {
  const jobs = await readQueue();
  return jobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + limit);
}

export async function claimNextJob(): Promise<PipelineJob | null> {
  const jobs = await readQueue();
  const next = jobs.find(
    (j) => j.status === 'queued' && j.retryCount < 4
  );
  if (!next) return null;
  const claimed: PipelineJob = {
    ...next,
    status: 'parsing' as JobStatus,
    startedAt: new Date().toISOString(),
    progress: 5,
  };
  const idx = jobs.findIndex((j) => j.id === next.id);
  jobs[idx] = claimed;
  await writeQueue(jobs);
  return claimed;
}

export async function resetStuckJobs(): Promise<number> {
  const jobs = await readQueue();
  const stuckCutoff = Date.now() - 10 * 60 * 1000; // 10 minutes
  let resetCount = 0;
  const updated = jobs.map((j) => {
    const inProgress = ['parsing', 'extracting', 'deduplicating'].includes(j.status);
    const startedAt = j.startedAt ? new Date(j.startedAt).getTime() : 0;
    if (inProgress && startedAt < stuckCutoff) {
      resetCount++;
      return { ...j, status: 'queued' as JobStatus, progress: 0, startedAt: undefined };
    }
    return j;
  });
  if (resetCount > 0) await writeQueue(updated);
  return resetCount;
}

export async function saveRawFile(jobId: string, filename: string, data: Buffer): Promise<string> {
  await ensureDir();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(DATA_DIR, 'raw', `${jobId}_${safeName}`);
  await fs.writeFile(filePath, data);
  return filePath;
}

export async function readRawFile(jobId: string, filename: string): Promise<Buffer> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(DATA_DIR, 'raw', `${jobId}_${safeName}`);
  return fs.readFile(filePath);
}

export async function saveTranscriptText(jobId: string, text: string): Promise<void> {
  await ensureDir();
  await fs.writeFile(path.join(DATA_DIR, 'transcripts', `${jobId}.txt`), text, 'utf-8');
}

export async function readTranscriptText(jobId: string): Promise<string> {
  return fs.readFile(path.join(DATA_DIR, 'transcripts', `${jobId}.txt`), 'utf-8');
}

export function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
