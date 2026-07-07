export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import {
  extractYouTubeId,
  isPlaylist,
  fetchYouTubeMetadata,
  fetchPlaylistUrls,
  processVideoJob,
} from '@/lib/video/pipeline';

export async function POST(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any;

  const body = await req.json().catch(() => ({})) as { url?: string; category?: string };
  if (!body.url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const url = body.url.trim();
  const category = body.category ?? 'General Sales';

  if (isPlaylist(url)) {
    let urls: string[];
    try {
      urls = await fetchPlaylistUrls(url);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 });
    }
    return NextResponse.json({ queued: urls.length });
  }

  const ytId = extractYouTubeId(url);
  if (!ytId) return NextResponse.json({ error: 'Could not parse YouTube video ID from URL' }, { status: 422 });

  // Duplicate check
  const { data: existing } = await db
    .from('video_knowledge')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('youtube_id', ytId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'This video is already in your knowledge base', existing_id: existing.id }, { status: 409 });
  }

  // Fetch metadata via oEmbed
  let meta: { id: string; title: string; channel: string; duration: number; thumbnail: string };
  try {
    meta = await fetchYouTubeMetadata(url);
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch video metadata: ${err instanceof Error ? err.message : String(err)}` }, { status: 422 });
  }

  const { data: job, error: insertError } = await db.from('video_knowledge').insert({
    user_id: user.id,
    source_type: 'youtube',
    youtube_url: url,
    youtube_id: ytId,
    title: meta.title,
    thumbnail_url: meta.thumbnail,
    channel_name: meta.channel,
    duration_sec: meta.duration,
    category,
    status: 'queued',
    started_at: new Date().toISOString(),
  }).select('id').single();

  if (insertError || !job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  // Process inline — caption fetch + GPT + embed takes ~5-10s, well within limits.
  // Use the authenticated user client (RLS covers all reads/writes for own rows).
  try {
    await processVideoJob(db, job.id, user.id, async (status, progress) => {
      await db.from('video_knowledge').update({
        status,
        progress,
        ...(status === 'complete' ? { completed_at: new Date().toISOString() } : {}),
      }).eq('id', job.id);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('video_knowledge').update({ status: 'error', error_message: message }).eq('id', job.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ id: job.id, title: meta.title, thumbnail: meta.thumbnail });
}
