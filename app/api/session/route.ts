import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

/**
 * Current OpenAI Realtime API models, in priority order.
 * The undated aliases (e.g. "gpt-4o-realtime-preview") are stable pointers
 * that OpenAI updates to the latest available model — they are always
 * preferred over hardcoded date-suffixed names, which break when OpenAI
 * deprecates a snapshot.
 *
 * You can override with OPENAI_REALTIME_MODEL env var if needed.
 *
 * If ALL models return 404/403, the endpoint returns { realtimeUnavailable: true }
 * and the client automatically falls back to the browser's Web Speech API.
 */
const REALTIME_MODELS = [
  process.env.OPENAI_REALTIME_MODEL,               // user-configurable override first
  'gpt-4o-realtime-preview',                        // current stable alias (no date)
  'gpt-4o-mini-realtime-preview',                   // mini variant — often available on more tiers
  'gpt-4o-realtime-preview-2024-10-01',             // first GA release, widest availability
].filter(Boolean) as string[];

async function tryRealtimeModel(apiKey: string, model: string): Promise<{ ok: true; data: unknown } | { ok: false; status: number; body: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        modalities: ['audio', 'text'],
        instructions: 'You are a transcription assistant. Transcribe all speech accurately, capturing every word spoken by both parties.',
      }),
    });
    if (res.ok) {
      return { ok: true, data: await res.json() };
    }
    return { ok: false, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) {
    return NextResponse.json(
      {
        error:
          'Not authenticated. You must be logged in to start a live call session. ' +
          'If you are logged in and seeing this error, NEXT_PUBLIC_SUPABASE_URL may be misconfigured — ' +
          'it must be https://your-project.supabase.co with no path suffix.',
      },
      { status: 401 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'OPENAI_API_KEY is not configured on the server. ' +
          'Add it in Vercel → Project Settings → Environment Variables (server-only, no NEXT_PUBLIC_ prefix), ' +
          'or in .env.local for local development.',
      },
      { status: 500 }
    );
  }

  const tried: { model: string; status: number; body: string }[] = [];

  // Try each Realtime model in priority order.
  for (const model of REALTIME_MODELS) {
    const result = await tryRealtimeModel(apiKey, model);
    if (result.ok) {
      return NextResponse.json({ ...result.data as object, modelUsed: model });
    }
    tried.push({ model, status: result.status, body: result.body.slice(0, 200) });

    // Stop trying on auth errors — those are account-level, not model-level.
    if (result.status === 401 || result.status === 429) break;
  }

  // All Realtime models failed. Check whether this is an auth failure or
  // a model-availability issue.
  const authFailed = tried.some((t) => t.status === 401);
  const quotaExceeded = tried.some((t) => t.status === 429);

  if (authFailed) {
    return NextResponse.json(
      {
        error:
          'OpenAI API key is invalid or expired. ' +
          'Generate a new key at platform.openai.com/api-keys and update OPENAI_API_KEY.',
      },
      { status: 401 }
    );
  }

  if (quotaExceeded) {
    return NextResponse.json(
      { error: 'OpenAI rate limit or quota exceeded. Check your usage at platform.openai.com/usage.' },
      { status: 429 }
    );
  }

  // All models returned 404/403 — Realtime API is not available on this account.
  // Signal the client to fall back to Web Speech API (browser built-in, no key needed).
  return NextResponse.json({
    realtimeUnavailable: true,
    reason:
      'OpenAI Realtime API is not available on this account. ' +
      'Tried: ' + tried.map((t) => `${t.model} (HTTP ${t.status})`).join(', ') + '. ' +
      'The browser Web Speech API will be used instead — live transcription will still work.',
    tried,
  });
}
