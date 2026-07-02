import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

export async function POST(req: NextRequest) {
  // ── Step 0: auth ────────────────────────────────────────────────────────────
  const { user, response: authResponse } = await requireUser();
  if (!user) {
    console.error('[transcribe][0] auth failed — no authenticated user');
    return authResponse;
  }
  console.log('[transcribe][0] auth OK — userId:', user.id);

  // ── Step 1: env var check ───────────────────────────────────────────────────
  const apiKey = process.env.DEEPGRAM_API_KEY;
  console.log('[transcribe][1] DEEPGRAM_API_KEY present:', !!apiKey,
    '| prefix:', apiKey ? apiKey.slice(0, 8) + '...' : 'MISSING');

  if (!apiKey) {
    console.error('[transcribe][1] DEEPGRAM_API_KEY is not set — returning 503');
    return NextResponse.json(
      { error: 'DEEPGRAM_API_KEY is not configured on the server.' },
      { status: 503 }
    );
  }

  // ── Step 2: read request body ───────────────────────────────────────────────
  let audioBuffer: ArrayBuffer;
  try {
    audioBuffer = await req.arrayBuffer();
    console.log('[transcribe][2] body read — bytes:', audioBuffer.byteLength);
  } catch (err) {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error('[transcribe][2] req.arrayBuffer() threw:', stack);
    return NextResponse.json({ error: `Failed to read request body: ${stack}` }, { status: 500 });
  }

  if (!audioBuffer.byteLength) {
    console.warn('[transcribe][2] empty body — returning empty transcript');
    return NextResponse.json({ transcript: '', words: [] });
  }

  const rawContentType = req.headers.get('content-type') ?? 'audio/webm';
  const contentType = rawContentType.split(';')[0].trim();
  console.log('[transcribe][2] contentType raw:', rawContentType, '| normalized:', contentType);

  // ── Step 3: call Deepgram ───────────────────────────────────────────────────
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en-US',
    diarize: 'true',
    smart_format: 'true',
    punctuate: 'true',
  });
  const dgUrl = `https://api.deepgram.com/v1/listen?${params}`;
  console.log('[transcribe][3] sending to Deepgram — url:', dgUrl,
    '| contentType:', contentType,
    '| bytes:', audioBuffer.byteLength);

  let dgRes: Response;
  try {
    dgRes = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: audioBuffer,
    });
    console.log('[transcribe][3] Deepgram HTTP status:', dgRes.status, dgRes.statusText);
  } catch (err) {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error('[transcribe][3] fetch() to Deepgram threw:', stack);
    return NextResponse.json(
      { error: `Network error reaching Deepgram: ${stack}` },
      { status: 502 }
    );
  }

  // ── Step 4: read Deepgram response body ────────────────────────────────────
  let dgText = '';
  try {
    dgText = await dgRes.text();
    console.log('[transcribe][4] Deepgram body (first 500 chars):', dgText.slice(0, 500));
  } catch (err) {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error('[transcribe][4] dgRes.text() threw:', stack);
    return NextResponse.json(
      { error: `Failed to read Deepgram response body: ${stack}` },
      { status: 502 }
    );
  }

  if (!dgRes.ok) {
    console.error('[transcribe][4] Deepgram returned non-2xx:',
      '| status:', dgRes.status,
      '| statusText:', dgRes.statusText,
      '| body:', dgText);
    return NextResponse.json(
      { error: `Deepgram error (HTTP ${dgRes.status} ${dgRes.statusText}): ${dgText}` },
      { status: 502 }
    );
  }

  // ── Step 5: parse JSON ──────────────────────────────────────────────────────
  let data: { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: DeepgramWord[]; confidence?: number }> }> } };
  try {
    data = JSON.parse(dgText);
    console.log('[transcribe][5] JSON parsed OK');
  } catch (err) {
    const stack = err instanceof Error ? err.stack : String(err);
    console.error('[transcribe][5] JSON.parse threw:', stack, '| raw body:', dgText.slice(0, 300));
    return NextResponse.json(
      { error: `Deepgram returned unparseable JSON: ${dgText.slice(0, 200)}` },
      { status: 502 }
    );
  }

  // ── Step 6: extract transcript ──────────────────────────────────────────────
  const alternative = data.results?.channels?.[0]?.alternatives?.[0];
  if (!alternative) {
    console.warn('[transcribe][6] no alternatives in Deepgram response — full body:', dgText.slice(0, 500));
    return NextResponse.json({ transcript: '', words: [] });
  }

  console.log('[transcribe][6] success — transcript length:', alternative.transcript?.length ?? 0,
    '| words:', alternative.words?.length ?? 0,
    '| confidence:', alternative.confidence);

  return NextResponse.json({
    transcript: alternative.transcript ?? '',
    words: alternative.words ?? [],
    confidence: alternative.confidence ?? 0,
  });
}
