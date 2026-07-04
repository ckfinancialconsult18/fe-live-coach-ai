import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

// Models tried in order — nova-3 first (newest, fastest); fallback chain if not on plan.
const DG_MODELS = ['nova-3', 'nova-2', 'nova-2-general', 'nova', 'base'];

interface DgAttempt {
  model: string;
  status: number; // 0 = network-level failure (fetch threw)
  body: string;
}

// ── Container-format sniffing ────────────────────────────────────────────────
// Every blob the current client produces is a complete file (WebM, Ogg, MP4 or
// WAV) and therefore starts with a container magic number. A payload with no
// recognizable header is a raw media segment — the signature of the old
// timeslice-based recorder (stale client bundle). Deepgram can never decode
// those, so we reject them with an exact diagnosis instead of burning four
// doomed Deepgram calls per chunk.
function sniffContainer(buf: ArrayBuffer): { format: string | null; magicHex: string } {
  const b = new Uint8Array(buf.slice(0, 16));
  const magicHex = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(' ');
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return { format: 'webm (EBML)', magicHex };
  }
  if (b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) {
    return { format: 'ogg', magicHex };
  }
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return { format: 'mp4/m4a', magicHex };
  }
  if (b.length >= 4 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    return { format: 'wav (RIFF)', magicHex };
  }
  return { format: null, magicHex };
}

async function callDeepgramWithModel(
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

    if (dgRes.ok) {
      console.log(`[transcribe][3] model=${model} → HTTP ${dgRes.status} OK`);
      return { ok: true, dgText };
    }
    // FULL error body — never truncated. This is the exact Deepgram error.
    console.error(`[transcribe][3] model=${model} → HTTP ${dgRes.status} | FULL DEEPGRAM ERROR BODY:\n${dgText}`);
    return { ok: false, status: dgRes.status, body: dgText };
  } catch (err) {
    const stack = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error(`[transcribe][3] model=${model} → fetch threw: ${stack}`);
    return { ok: false, status: 0, body: `fetch threw: ${stack}` };
  }
}

/** Pull the human-readable message out of a Deepgram error body if it's JSON. */
function extractDgMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { err_msg?: string; error?: string; message?: string; reason?: string };
    return parsed.err_msg ?? parsed.error ?? parsed.message ?? parsed.reason ?? body;
  } catch {
    return body;
  }
}

export async function POST(req: NextRequest) {
  const routeStart = Date.now();
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
  const clientPipelineVersion = req.headers.get('x-pipeline-version') ?? 'unknown (old bundle — header absent)';
  const chunkSeq = req.headers.get('x-chunk-seq') ?? '?';

  // ── Step 2.5: verify the payload is a real container file ──────────────────
  const { format, magicHex } = sniffContainer(audioBuffer);
  console.log('[transcribe][2] contentType raw:', rawContentType, '| normalized:', contentType,
    '| bytes:', audioBuffer.byteLength,
    '| container:', format ?? 'UNRECOGNIZED',
    '| first bytes:', magicHex,
    '| chunkSeq:', chunkSeq,
    '| clientPipeline:', clientPipelineVersion);

  if (!format) {
    console.error('[transcribe][2] REJECTED (422): payload has NO container header — this is a raw ' +
      'media segment produced by MediaRecorder.start(timeslice). The browser is running a stale ' +
      'client bundle. Deepgram would return 400 "corrupt or unsupported data" for this payload. ' +
      `First 16 bytes: ${magicHex} | clientPipeline: ${clientPipelineVersion}`);
    return NextResponse.json(
      {
        error: 'Audio chunk has no container header (not WebM/Ogg/MP4/WAV). The browser sent a raw ' +
          'media segment — the old timeslice-based recorder is still running. Hard-refresh the page ' +
          '(Cmd/Ctrl+Shift+R) to load the current client bundle.',
        firstBytesHex: magicHex,
        clientPipelineVersion,
      },
      { status: 422 }
    );
  }

  // ── Step 3: try Deepgram models in order ────────────────────────────────────
  const attempts: DgAttempt[] = [];
  for (const model of DG_MODELS) {
    const result = await callDeepgramWithModel(apiKey, model, audioBuffer, contentType);

    if (!result.ok) {
      attempts.push({ model, status: result.status, body: result.body });
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
      console.error('[transcribe][4] JSON.parse threw:', msg, '| FULL raw body:\n', result.dgText);
      return NextResponse.json(
        { error: `Deepgram returned unparseable JSON (model=${model}): ${result.dgText}` },
        { status: 502 }
      );
    }

    // ── Step 5: extract transcript ─────────────────────────────────────────
    const alternative = data.results?.channels?.[0]?.alternatives?.[0];
    if (!alternative) {
      console.warn('[transcribe][5] no alternatives in Deepgram response — model:', model,
        '| FULL body:\n', result.dgText);
      return NextResponse.json({ transcript: '', words: [] });
    }

    console.log('[transcribe][5] success — model:', model,
      '| transcript length:', alternative.transcript?.length ?? 0,
      '| words:', alternative.words?.length ?? 0,
      '| confidence:', alternative.confidence);

    const durationMs = Date.now() - routeStart;
    return NextResponse.json(
      { transcript: alternative.transcript ?? '', words: alternative.words ?? [], confidence: alternative.confidence ?? 0 },
      { headers: { 'X-Transcribe-Duration-Ms': String(durationMs) } }
    );
  }

  // ── All models exhausted: return the ACTUAL Deepgram error, not a generic 502
  console.error(`[transcribe][3] ALL MODELS FAILED — ${attempts.length} attempt(s). Full error bodies:`);
  for (const a of attempts) {
    console.error(`[transcribe][3]   model=${a.model} HTTP ${a.status} FULL BODY:\n${a.body}`);
  }

  const primary = attempts[0];
  // Pass Deepgram's real HTTP status through. 0 means our fetch to Deepgram
  // failed at the network level — that (and only that) is a true 502.
  const status = primary && primary.status >= 400 ? primary.status : 502;
  let deepgramBody: unknown = primary?.body ?? '';
  try { deepgramBody = JSON.parse(primary?.body ?? ''); } catch { /* keep raw string */ }

  return NextResponse.json(
    {
      error: primary
        ? `Deepgram error (model=${primary.model}, HTTP ${primary.status}): ${extractDgMessage(primary.body)}`
        : 'Deepgram transcription failed with no recorded attempts.',
      deepgramStatus: primary?.status ?? null,
      deepgramBody,
      attempts,
      requestBytes: audioBuffer.byteLength,
      contentType,
      container: format,
      clientPipelineVersion,
    },
    { status }
  );
}
