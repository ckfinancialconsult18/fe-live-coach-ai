import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

// Models tried in order — nova-3 may not be on all plans.
const DG_MODELS = ['nova-2', 'nova-2-general', 'nova', 'base'];

async function callDeegramWithModel(
  apiKey: string,
  model: string,
  audioBuffer: ArrayBuffer,
  contentType: string,
): Promise<{ ok: true; dgText: string } | { ok: false; status: number; body: string }> {
  const params = new URLSearchParams({
    model,
    language: 'en-US',
    diarize: 'true',
    smart_format: 'true',
    punctuate: 'true',
  });

  try {
    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: audioBuffer,
    });

    const dgText = await dgRes.text().catch(() => '');

    console.log(`[transcribe][3] model=${model} → HTTP ${dgRes.status} | body preview: ${dgText.slice(0, 300)}`);

    if (dgRes.ok) return { ok: true, dgText };
    return { ok: false, status: dgRes.status, body: dgText };
  } catch (err) {
    const stack = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error(`[transcribe][3] model=${model} → fetch threw: ${stack}`);
    return { ok: false, status: 0, body: `fetch threw: ${stack}` };
  }
}

export async function POST(req: NextRequest) {
  // ── Step 0: auth ────────────────────────────────────────────────────────────
  const { user, response: authResponse } = await requireUser();
  if (!user) {
    console.error('[transcribe][0] auth failed');
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
    const stack = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error('[transcribe][2] req.arrayBuffer() threw:', stack);
    return NextResponse.json({ error: `Failed to read request body: ${stack}` }, { status: 500 });
  }

  if (!audioBuffer.byteLength) {
    console.warn('[transcribe][2] empty body — returning empty transcript');
    return NextResponse.json({ transcript: '', words: [] });
  }

  // Normalize Content-Type: strip codec params (e.g. "audio/webm;codecs=opus" → "audio/webm")
  const rawContentType = req.headers.get('content-type') ?? 'audio/webm';
  const contentType = rawContentType.split(';')[0].trim();
  console.log('[transcribe][2] contentType raw:', rawContentType, '| normalized:', contentType,
    '| bytes:', audioBuffer.byteLength);

  // ── Step 3: try Deepgram models in order ────────────────────────────────────
  let lastError = '';
  for (const model of DG_MODELS) {
    const result = await callDeegramWithModel(apiKey, model, audioBuffer, contentType);

    if (!result.ok) {
      lastError = `model=${model} HTTP ${result.status}: ${result.body}`;
      // 401 = auth failure — no point trying other models
      if (result.status === 401) {
        console.error('[transcribe][3] auth failure from Deepgram — stopping model fallback');
        break;
      }
      // 0 = network error — stop
      if (result.status === 0) break;
      // 400/404 might be model-not-available — try next model
      console.warn(`[transcribe][3] model=${model} failed (${result.status}) — trying next model`);
      continue;
    }

    // ── Step 4: parse JSON ─────────────────────────────────────────────────
    let data: { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: DeepgramWord[]; confidence?: number }> }> } };
    try {
      data = JSON.parse(result.dgText);
      console.log('[transcribe][4] JSON parsed OK — model:', model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[transcribe][4] JSON.parse threw:', msg, '| raw body:', result.dgText.slice(0, 300));
      return NextResponse.json(
        { error: `Deepgram returned unparseable JSON (model=${model}): ${result.dgText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    // ── Step 5: extract transcript ─────────────────────────────────────────
    const alternative = data.results?.channels?.[0]?.alternatives?.[0];
    if (!alternative) {
      console.warn('[transcribe][5] no alternatives in Deepgram response — model:', model,
        '| full body:', result.dgText.slice(0, 500));
      return NextResponse.json({ transcript: '', words: [] });
    }

    console.log('[transcribe][5] success — model:', model,
      '| transcript length:', alternative.transcript?.length ?? 0,
      '| words:', alternative.words?.length ?? 0,
      '| confidence:', alternative.confidence);

    return NextResponse.json({
      transcript: alternative.transcript ?? '',
      words: alternative.words ?? [],
      confidence: alternative.confidence ?? 0,
    });
  }

  // All models exhausted
  console.error('[transcribe][3] all models failed — last error:', lastError);
  return NextResponse.json(
    { error: `Deepgram transcription failed after trying all models. Last error: ${lastError}` },
    { status: 502 }
  );
}
