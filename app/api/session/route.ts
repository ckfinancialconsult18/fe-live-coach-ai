import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

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
          'or in .env.local for local development. Restart the server after adding it.',
      },
      { status: 500 }
    );
  }

  try {
    const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        modalities: ['audio', 'text'],
        instructions: 'You are a transcription assistant. Transcribe all speech accurately, capturing every word spoken by both parties.',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      let hint = '';
      if (res.status === 401) {
        hint = ' The OPENAI_API_KEY is invalid or expired. Generate a new key at platform.openai.com/api-keys.';
      } else if (res.status === 403) {
        hint =
          ' Your OpenAI account does not have access to the Realtime API. ' +
          'Enable it at platform.openai.com/settings/organization/billing or contact OpenAI support.';
      } else if (res.status === 404) {
        hint =
          ' Model gpt-4o-realtime-preview-2024-12-17 is not available on your account. ' +
          'Check your OpenAI plan — Realtime API requires an account with sufficient usage tier.';
      } else if (res.status === 429) {
        hint = ' OpenAI rate limit or quota exceeded. Check your usage at platform.openai.com/usage.';
      }
      return NextResponse.json(
        { error: `OpenAI Realtime API error ${res.status}.${hint} Raw: ${body.slice(0, 300)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          `Network error reaching OpenAI Realtime API: ${err instanceof Error ? err.message : String(err)}. ` +
          'Check your internet connection and that the Vercel deployment is not blocking outbound requests.',
      },
      { status: 500 }
    );
  }
}
