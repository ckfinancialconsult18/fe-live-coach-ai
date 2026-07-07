import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import {
  extractYouTubeId,
  isPlaylist,
  fetchYouTubeMetadata,
  fetchPlaylistUrls,
} from '@/lib/video/pipeline';

export async function POST(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const db = supabase as any; // video_knowledge not in generated types yet

  const body = await req.json().catch(() => ({})) as {
    url?: string;
    category?: string;
  };

  if (!body.url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const url = body.url.trim();
  const category = body.category ?? 'General Sales';

  // Handle playlists — expand then queue each video
  if (isPlaylist(url)) {
    let urls: string[];
    try {
      urls = await fetchPlaylistUrls(url);
    } catch (err) {
      return NextResponse.json({ error: `Failed to expand playlist: ${err instanceof Error ? err.message : String(err)}` }, { status: 422 });
    }

    const jobs: { id: string; youtube_url: string }[] = [];
    for (const videoUrl of urls.slice(0, 50)) {
      const ytId = extractYouTubeId(videoUrl);
      if (!ytId) continue;

      // Skip duplicates
      const { data: existing } = await db
        .from('video_knowledge')
        .select('id')
        .eq('user_id', user.id)
        .eq('youtube_id', ytId)
        .maybeSingle();
      if (existing) continue;

      const { data: job } = await db.from('video_knowledge').insert({
        user_id: user.id,
        source_type: 'youtube',
        youtube_url: videoUrl,
        youtube_id: ytId,
        category,
        status: 'queued',
      }).select('id').single();

      if (job) jobs.push({ id: job.id, youtube_url: videoUrl });
    }

    // Kick off processing for each job (fire-and-forget)
    for (const job of jobs) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/knowledge/video/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      }).catch(() => {/* non-blocking */});
    }

    return NextResponse.json({ queued: jobs.length, jobs });
  }

  // Single YouTube URL
  const ytId = extractYouTubeId(url);
  if (!ytId) {
    return NextResponse.json({ error: 'Could not parse YouTube video ID from URL' }, { status: 422 });
  }

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

  // Fetch metadata
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
  }).select('id').single();

  if (insertError || !job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  // Kick off processing (fire-and-forget)
  fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/knowledge/video/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: job.id }),
  }).catch(() => {/* non-blocking */});

  return NextResponse.json({ id: job.id, title: meta.title, thumbnail: meta.thumbnail });
}
