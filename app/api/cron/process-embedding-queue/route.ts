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
 * invocations — verified below. Requires CRON_SECRET, OPENAI_API_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY in the deployment environment; all failure paths
 * log a [cron/embed] line so the reason is visible in Vercel runtime logs.
 */
export async function GET(request: NextRequest) {
  // Every failure path below console.errors with a [cron/embed] prefix so the
  // reason is visible in Vercel runtime logs — a bare 500 status line in the
  // dashboard is not diagnosable.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/embed] FAILED: CRON_SECRET is not set in the deployment environment. ' +
      'Add it in Vercel → Project Settings → Environment Variables, then redeploy.');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[cron/embed] REJECTED: Authorization header does not match CRON_SECRET ' +
      `(header ${authHeader ? 'present but wrong' : 'absent'}). If this is a Vercel Cron invocation, ` +
      'CRON_SECRET changed after the last deploy — redeploy to re-sync.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fail fast on missing OPENAI_API_KEY: without it every job would be marked
  // 'failed' with a confusing OpenAI 401 instead of one clear config error,
  // and the queue rows would burn their attempts counter.
  if (!process.env.OPENAI_API_KEY) {
    console.error('[cron/embed] FAILED: OPENAI_API_KEY is not set — embeddings cannot be generated. ' +
      'Queue left untouched (jobs stay pending).');
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Admin client unavailable';
    console.error('[cron/embed] FAILED: could not create service-role client —', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Drain in batches across all users until the queue is empty or we run out
  // of cron execution time (maxDuration above).
  let totalProcessed = 0;
  let totalFailed = 0;
  try {
    for (let i = 0; i < 20; i++) {
      const result = await processEmbeddingQueue(supabase);
      totalProcessed += result.processed;
      totalFailed += result.failed;
      if (result.processed + result.failed === 0) break;
    }
  } catch (err) {
    // A throw here (queue SELECT failed: invalid service key, network error,
    // missing table) previously escaped the handler as an unlogged generic 500.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/embed] FAILED mid-drain after processing', totalProcessed,
      'and failing', totalFailed, 'jobs. Error:', err instanceof Error ? err.stack ?? msg : msg);
    return NextResponse.json(
      { error: `Queue drain failed: ${msg}`, processed: totalProcessed, failed: totalFailed },
      { status: 500 }
    );
  }

  console.log(`[cron/embed] OK — processed: ${totalProcessed}, failed: ${totalFailed}`);
  return NextResponse.json({ processed: totalProcessed, failed: totalFailed });
}
