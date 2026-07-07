/**
 * Internal route — called by the ingest route (fire-and-forget) to run the video pipeline.
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processVideoJob } from '@/lib/video/pipeline';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { jobId?: string };
  if (!body.jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // Service-role client — bypasses RLS for background processing
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) as any;

  // Get user_id from the job
  const { data: job } = await supabase
    .from('video_knowledge')
    .select('user_id')
    .eq('id', body.jobId)
    .single();

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  await supabase.from('video_knowledge').update({ started_at: new Date().toISOString() }).eq('id', body.jobId);

  try {
    await processVideoJob(supabase, body.jobId, job.user_id, async (status: string, progress: number) => {
      await supabase.from('video_knowledge').update({
        status,
        progress,
        ...(status === 'complete' ? { completed_at: new Date().toISOString() } : {}),
      }).eq('id', body.jobId);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('video_knowledge').update({
      status: 'error',
      error_message: message,
    }).eq('id', body.jobId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
