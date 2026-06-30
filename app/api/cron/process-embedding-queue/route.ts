import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processEmbeddingQueue } from '@/lib/rag/process-queue';

export const maxDuration = 60;

/**
 * Vercel Cron entry point — drains embedding_queue across ALL users using the
 * service-role client (RLS doesn't apply; this is the one place in the app
 * that's allowed to see every user's rows, scoped only to the queue/chunks
 * tables this function touches).
 *
 * Configure in vercel.json: { "crons": [{ "path": "/api/cron/process-embedding-queue", "schedule": "*\/5 * * * *" }] }
 * Vercel sends an `Authorization: Bearer ${CRON_SECRET}` header on cron
 * invocations — verified below. Requires CRON_SECRET and
 * SUPABASE_SERVICE_ROLE_KEY to be set in the deployment environment; neither
 * is configured as of this writing (see final report).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Admin client unavailable' }, { status: 500 });
  }

  // Drain in batches across all users until the queue is empty or we run out
  // of cron execution time (maxDuration above).
  let totalProcessed = 0;
  let totalFailed = 0;
  for (let i = 0; i < 20; i++) {
    const result = await processEmbeddingQueue(supabase);
    totalProcessed += result.processed;
    totalFailed += result.failed;
    if (result.processed + result.failed === 0) break;
  }

  return NextResponse.json({ processed: totalProcessed, failed: totalFailed });
}
