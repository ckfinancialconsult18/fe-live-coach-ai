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

  console.log('[deepgram-token] creating ephemeral key — projectId:', projectId,
    '| apiKey prefix:', apiKey.slice(0, 8) + '...');

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

    const responseText = await res.text().catch(() => '');
    console.log('[deepgram-token] Deepgram response — status:', res.status,
      '| body:', responseText.slice(0, 500));

    if (!res.ok) {
      const msg = `Deepgram key creation failed (HTTP ${res.status}): ${responseText.slice(0, 300)}`;
      console.error('[deepgram-token]', msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    let data: { key?: string; api_key?: { key?: string } };
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[deepgram-token] failed to parse Deepgram JSON:', responseText.slice(0, 200));
      return NextResponse.json({ error: 'Deepgram returned non-JSON response' }, { status: 502 });
    }

    // Deepgram API v1 returns the key at top-level `key` field
    const ephemeralKey = data.key ?? data.api_key?.key;
    if (!ephemeralKey) {
      console.error('[deepgram-token] key field missing from response — full body:', responseText.slice(0, 500));
      return NextResponse.json({ error: 'Deepgram response missing key field' }, { status: 502 });
    }

    console.log('[deepgram-token] ephemeral key issued — prefix:', ephemeralKey.slice(0, 8) + '...');
    return NextResponse.json({ key: ephemeralKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[deepgram-token] fetch to Deepgram threw:', msg);
    return NextResponse.json(
      { error: `Failed to reach Deepgram: ${msg}` },
      { status: 500 }
    );
  }
}
