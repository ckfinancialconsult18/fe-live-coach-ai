/**
 * Video knowledge pipeline:
 * 1. Download audio via yt-dlp (YouTube) or read uploaded file
 * 2. Extract/convert to WAV via ffmpeg
 * 3. Transcribe with Deepgram (speaker diarization + timestamps)
 * 4. Extract knowledge with OpenAI
 * 5. Chunk + embed → knowledge_documents + embedding_queue
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenAI } from '@/lib/openai';
import { chunkText } from '@/lib/rag/chunk';
import { embedTexts } from '@/lib/rag/embed';

const execAsync = promisify(exec);

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
  const { stdout } = await execAsync(
    `yt-dlp --flat-playlist --print "%(url)s" "${playlistUrl}"`,
    { timeout: 60000 }
  );
  return stdout.trim().split('\n').filter(Boolean).map((u) => u.trim());
}

// ── Main pipeline ────────────────────────────────────────────────────────────

export async function processVideoJob(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
  onProgress: ProgressCallback
): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'video-'));

  try {
    // Load job
    const { data: job } = await supabase
      .from('video_knowledge')
      .select('*')
      .eq('id', jobId)
      .single();

    if (!job) throw new Error('Job not found');

    // ── Step 1: Download ──────────────────────────────────────────────────
    await onProgress('downloading', 10);

    const audioPath = join(tmpDir, 'audio.%(ext)s');
    let wavPath = join(tmpDir, 'audio.wav');

    if (job.source_type === 'youtube') {
      await execAsync(
        `yt-dlp -x --audio-format wav --audio-quality 0 -o "${audioPath}" "${job.youtube_url}"`,
        { timeout: 300000 }
      );
      // yt-dlp may name it differently; find it
      const { stdout } = await execAsync(`ls "${tmpDir}"`);
      const audioFile = stdout.trim().split('\n').find((f) => f.endsWith('.wav') || f.endsWith('.webm') || f.endsWith('.m4a') || f.endsWith('.mp3'));
      if (!audioFile) throw new Error('yt-dlp did not produce an audio file');
      wavPath = join(tmpDir, audioFile);
    } else if (job.storage_path) {
      // Download from Supabase Storage
      const { data: fileData } = await supabase.storage
        .from('video-uploads')
        .download(job.storage_path);
      if (!fileData) throw new Error('Failed to download uploaded file');
      const uploadedPath = join(tmpDir, 'uploaded');
      await writeFile(uploadedPath, Buffer.from(await fileData.arrayBuffer()));
      wavPath = uploadedPath;
    }

    // ── Step 2: Convert to WAV if needed ─────────────────────────────────
    await onProgress('extracting_audio', 25);

    if (!wavPath.endsWith('.wav')) {
      const convertedPath = join(tmpDir, 'audio.wav');
      await execAsync(
        `ffmpeg -i "${wavPath}" -ar 16000 -ac 1 -f wav "${convertedPath}" -y`,
        { timeout: 120000 }
      );
      wavPath = convertedPath;
    }

    // ── Step 3: Transcribe with Deepgram REST API ─────────────────────────
    await onProgress('transcribing', 40);

    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) throw new Error('DEEPGRAM_API_KEY not configured');

    const audioBuffer = await readFile(wavPath);

    const dgRes = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&paragraphs=true&utterances=true&language=en',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': 'audio/wav',
        },
        body: audioBuffer,
      }
    );

    if (!dgRes.ok) {
      const errText = await dgRes.text().catch(() => '');
      throw new Error(`Deepgram API error ${dgRes.status}: ${errText}`);
    }

    const dgJson = await dgRes.json() as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
    const transcript = dgJson?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    if (!transcript) throw new Error('Deepgram returned empty transcript');

    // Save raw transcript
    await supabase.from('video_knowledge').update({ transcript_text: transcript }).eq('id', jobId);

    // ── Step 4: Extract knowledge with OpenAI ────────────────────────────
    await onProgress('building_knowledge', 60);

    const openai = getOpenAI();
    const extractionPrompt = buildVideoExtractionPrompt(transcript, job.title ?? 'Video');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: extractionPrompt }],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });

    let extracted: { summary?: string; takeaways?: string[]; tags?: string[] } = {};
    try {
      extracted = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    } catch { /* use empty */ }

    // ── Step 5: Create knowledge document + chunk + embed ─────────────────
    await onProgress('embedding', 75);

    // Insert into knowledge_documents so it's searchable via existing RAG
    const { data: doc } = await supabase.from('knowledge_documents').insert({
      user_id: userId,
      title: job.title ?? 'Video Knowledge',
      source_type: 'training',
      raw_text: transcript,
      status: 'processing',
    }).select('id').single();

    if (doc) {
      // Update video job with document link and AI outputs
      await supabase.from('video_knowledge').update({
        document_id: doc.id,
        ai_summary: extracted.summary ?? null,
        key_takeaways: extracted.takeaways ?? [],
        tags: extracted.tags ?? [],
      }).eq('id', jobId);

      // Chunk and embed
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

      // Insert in batches of 50
      for (let i = 0; i < queueRows.length; i += 50) {
        await supabase.from('knowledge_chunks').insert(queueRows.slice(i, i + 50));
      }

      // Mark document ready
      await supabase.from('knowledge_documents').update({ status: 'ready' }).eq('id', doc.id);
    }

    await onProgress('complete', 100);

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
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
