/**
 * Video knowledge pipeline:
 * 1. Download audio via yt-dlp (YouTube) or read uploaded file
 * 2. Extract/convert to WAV via ffmpeg
 * 3. Transcribe with Deepgram (speaker diarization + timestamps)
 * 4. Extract knowledge with OpenAI
 * 5. Chunk + embed → knowledge_documents + embedding_queue
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenAI } from '@/lib/openai';
import { chunkText } from '@/lib/rag/chunk';
import { embedTexts } from '@/lib/rag/embed';

// ── YouTube caption fetch via Innertube API ──────────────────────────────────
// Uses YouTube's internal API (same as the YouTube app) — avoids IP blocks
// that plague web-scraper-based transcript libraries on shared hosting.

async function fetchCaptionsViaInnertube(videoId: string): Promise<string> {
  // Fetch the YouTube watch page and extract ytInitialPlayerResponse —
  // same data a browser gets, most reliable way to find caption track URLs.
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!pageRes.ok) throw new Error(`YouTube page returned ${pageRes.status}`);
  const html = await pageRes.text();

  // Extract ytInitialPlayerResponse JSON from the page
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
  if (!match) throw new Error('Could not find player data in YouTube page');

  let player: any;
  try { player = JSON.parse(match[1]); } catch { throw new Error('Failed to parse player data'); }

  const tracks: any[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) throw new Error('No captions available for this video');

  // Prefer English auto-generated, then English manual, then first available
  const track =
    tracks.find((t) => t.languageCode === 'en' && t.kind === 'asr') ??
    tracks.find((t) => t.languageCode === 'en') ??
    tracks[0];

  const captionUrl = track.baseUrl;

  // Step 2: Fetch the caption XML
  const xmlRes = await fetch(`${captionUrl}&fmt=json3`, { signal: AbortSignal.timeout(10000) });
  if (!xmlRes.ok) throw new Error(`Caption fetch returned ${xmlRes.status}`);
  const xml = await xmlRes.json() as any;

  // Step 3: Flatten events to plain text
  const text = (xml?.events ?? [])
    .flatMap((e: any) => e.segs ?? [])
    .map((s: any) => s.utf8 ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) throw new Error('Caption text is empty');
  return text;
}

export type PipelineStatus =
  | 'queued' | 'downloading' | 'extracting_audio'
  | 'transcribing' | 'building_knowledge' | 'embedding' | 'complete' | 'error';

type ProgressCallback = (status: PipelineStatus, progress: number) => Promise<void>;

// ── YouTube metadata ────────────────────────────────────────────────────────

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function isPlaylist(url: string): boolean {
  return url.includes('list=');
}

export async function fetchYouTubeMetadata(url: string): Promise<{
  id: string; title: string; channel: string; duration: number; thumbnail: string;
}> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error('Could not parse YouTube video ID');

  // Use oEmbed — no API key required, not rate-limited like yt-dlp
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`YouTube oEmbed returned ${res.status}`);
  const data = await res.json() as { title?: string; author_name?: string; thumbnail_url?: string };

  return {
    id: videoId,
    title: data.title ?? 'Untitled',
    channel: data.author_name ?? 'Unknown',
    duration: 0, // oEmbed doesn't provide duration; stored as 0 until transcription
    thumbnail: data.thumbnail_url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export async function fetchPlaylistUrls(playlistUrl: string): Promise<string[]> {
  // Extract playlist ID and use YouTube's oEmbed + playlist RSS as a lightweight alternative.
  // For now return an error — playlist support requires yt-dlp which is bot-detected on Railway.
  throw new Error('Playlist import is not supported. Please add videos one at a time using their individual URLs.');
}

// ── Main pipeline ────────────────────────────────────────────────────────────

export async function processVideoJob(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
  onProgress: ProgressCallback
): Promise<void> {
  // Load job
  const { data: job } = await supabase
    .from('video_knowledge')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!job) throw new Error('Job not found');

  // ── Step 1: Fetch transcript from YouTube captions ───────────────────────
  // No yt-dlp, no audio download, no Deepgram — completes in seconds.
  await onProgress('transcribing', 20);

  const videoId = job.youtube_id ?? extractYouTubeId(job.youtube_url ?? '');
  if (!videoId) throw new Error('Cannot determine YouTube video ID');

  let transcript: string;
  try {
    transcript = await fetchCaptionsViaInnertube(videoId);
  } catch (err) {
    throw new Error(`Could not fetch captions for this video. Make sure captions are enabled. (${err instanceof Error ? err.message : String(err)})`);
  }

  if (!transcript) throw new Error('Transcript is empty — video may have no captions');

  await supabase.from('video_knowledge').update({ transcript_text: transcript }).eq('id', jobId);

  // ── Step 2: Extract knowledge with OpenAI ──────────────────────────────
  await onProgress('building_knowledge', 50);

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: buildVideoExtractionPrompt(transcript, job.title ?? 'Video') }],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
  });

  let extracted: { summary?: string; takeaways?: string[]; tags?: string[] } = {};
  try { extracted = JSON.parse(completion.choices[0]?.message?.content ?? '{}'); } catch { /* use empty */ }

  // ── Step 3: Create knowledge document + chunk + embed ─────────────────
  await onProgress('embedding', 70);

  const { data: doc } = await supabase.from('knowledge_documents').insert({
    user_id: userId,
    title: job.title ?? 'Video Knowledge',
    source_type: 'training',
    raw_text: transcript,
    status: 'processing',
  }).select('id').single();

  if (doc) {
    await supabase.from('video_knowledge').update({
      document_id: doc.id,
      ai_summary: extracted.summary ?? null,
      key_takeaways: extracted.takeaways ?? [],
      tags: extracted.tags ?? [],
    }).eq('id', jobId);

    const chunks = chunkText(transcript);
    const embeddings = await embedTexts(chunks);

    const queueRows = chunks.map((chunk, i) => ({
      user_id: userId,
      document_id: doc.id,
      chunk_index: i,
      chunk_text: chunk,
      embedding: JSON.stringify(embeddings[i]),
      metadata: {
        video_id: jobId,
        youtube_url: job.youtube_url,
        title: job.title,
        channel: job.channel_name,
        category: job.category,
        tags: extracted.tags ?? [],
      },
      status: 'ready',
    }));

    for (let i = 0; i < queueRows.length; i += 50) {
      await supabase.from('knowledge_chunks').insert(queueRows.slice(i, i + 50));
    }

    await supabase.from('knowledge_documents').update({ status: 'ready' }).eq('id', doc.id);
  }

  await onProgress('complete', 100);
}

function buildVideoExtractionPrompt(transcript: string, title: string): string {
  const truncated = transcript.slice(0, 8000);
  return `You are analyzing a sales coaching video titled "${title}".

Extract the key knowledge from this transcript and return a JSON object with:
- "summary": 2-3 sentence executive summary
- "takeaways": array of 5-10 key actionable takeaways (strings)
- "tags": array of 8-15 relevant tags (e.g. "objection_handling", "closing", "final_expense", "rapport", "mindset")

Transcript:
${truncated}

Respond with valid JSON only.`;
}
