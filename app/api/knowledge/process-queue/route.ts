import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import { processEmbeddingQueue } from '@/lib/rag/process-queue';

/**
 * User-triggered drain of their own embedding_queue — called immediately
 * after ingest from the client so newly uploaded documents become
 * searchable without waiting for the next cron tick. For users who upload
 * many documents in a row, the cron job (app/api/cron/process-embedding-queue)
 * is the backstop that guarantees eventual processing.
 */
export async function POST() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  try {
    const result = await processEmbeddingQueue(supabase, { userId: user.id });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Queue processing failed' }, { status: 500 });
  }
}
