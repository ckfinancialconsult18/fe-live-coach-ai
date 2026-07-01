import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

/**
 * Issues a short-lived (5-minute) Deepgram API key scoped to usage:write only.
 * The client uses this key to open a WebSocket directly to Deepgram for audio
 * streaming — no audio ever passes through our server, minimising latency.
 *
 * Required env vars (server-only, no NEXT_PUBLIC_ prefix):
 *   DEEPGRAM_API_KEY      — your Deepgram API key
 *   DEEPGRAM_PROJECT_ID   — your Deepgram project ID (found in the console)
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  const projectId = process.env.DEEPGRAM_PROJECT_ID;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'DEEPGRAM_API_KEY is not configured. Add it in Vercel → Project Settings → Environment Variables.' },
      { status: 503 }
    );
  }
  if (!projectId) {
    return NextResponse.json(
      { error: 'DEEPGRAM_PROJECT_ID is not configured. Find your project ID at console.deepgram.com.' },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comment: 'live-coaching-session',
        scopes: ['usage:write'],
        time_to_live_in_seconds: 300,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Deepgram key creation failed (HTTP ${res.status}): ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json() as { key?: string };
    if (!data.key) {
      return NextResponse.json({ error: 'Deepgram response missing key field' }, { status: 502 });
    }

    return NextResponse.json({ key: data.key });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach Deepgram: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
