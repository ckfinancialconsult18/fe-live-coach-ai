import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Pre-flight status check for the live call feature. Checks every requirement
 * independently so all failures surface at once with exact, actionable messages.
 * Visit /api/live-call-status in your browser for a full diagnostic report.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; message: string }> = {};

  // 1. OPENAI_API_KEY present
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    checks.openai_api_key = {
      ok: false,
      message:
        'OPENAI_API_KEY is not set. Add it in Vercel → Project Settings → Environment Variables ' +
        '(server-only, no NEXT_PUBLIC_ prefix), or in .env.local for local development.',
    };
  } else {
    checks.openai_api_key = { ok: true, message: 'OPENAI_API_KEY is configured.' };
  }

  // 2. Supabase URL format — must be the bare project URL, no path suffix.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!supabaseUrl) {
    checks.supabase_url = { ok: false, message: 'NEXT_PUBLIC_SUPABASE_URL is not set.' };
  } else if (supabaseUrl.includes('/rest/v1') || supabaseUrl.includes('/auth/v1')) {
    checks.supabase_url = {
      ok: false,
      message:
        `NEXT_PUBLIC_SUPABASE_URL contains a path suffix ("${supabaseUrl}"). ` +
        'It must be the base URL only, e.g. https://your-project.supabase.co — ' +
        'no trailing path. This causes every auth call to fail with 401.',
    };
  } else {
    checks.supabase_url = { ok: true, message: `Supabase URL looks correct: ${supabaseUrl}` };
  }

  // 3. Supabase authentication
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      checks.supabase_auth = {
        ok: false,
        message:
          'Not authenticated. You must be logged in to use Live Call. ' +
          (error ? `Auth error: ${error.message}` : 'No active session found.'),
      };
    } else {
      checks.supabase_auth = { ok: true, message: `Authenticated as ${user.email}` };
    }
  } catch (err) {
    checks.supabase_auth = {
      ok: false,
      message: `Auth check threw an exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Deepgram — Nova-3 speech-to-text. Not a hard failure: if unconfigured,
  //    transcription falls back to the browser's Web Speech API automatically.
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  const deepgramProjectId = process.env.DEEPGRAM_PROJECT_ID;

  if (!deepgramKey || !deepgramProjectId) {
    checks.deepgram = {
      ok: false,
      message:
        (!deepgramKey ? 'DEEPGRAM_API_KEY is not set. ' : 'DEEPGRAM_PROJECT_ID is not set. ') +
        'Create a free account at console.deepgram.com. ' +
        'Transcription will fall back to the browser Web Speech API (Chrome/Edge only) until this is configured.',
    };
  } else {
    try {
      const res = await fetch(`https://api.deepgram.com/v1/projects/${deepgramProjectId}/keys`, {
        method: 'POST',
        headers: { Authorization: `Token ${deepgramKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'status-check', scopes: ['usage:write'], time_to_live_in_seconds: 10 }),
      });
      if (res.ok) {
        checks.deepgram = { ok: true, message: 'Deepgram Nova-3 is reachable and the API key is valid.' };
      } else {
        const text = await res.text().catch(() => '');
        checks.deepgram = {
          ok: false,
          message: `Deepgram key validation failed (HTTP ${res.status}): ${text.slice(0, 200)}. ` +
            'Verify DEEPGRAM_API_KEY and DEEPGRAM_PROJECT_ID at console.deepgram.com.',
        };
      }
    } catch (err) {
      checks.deepgram = {
        ok: false,
        message: `Could not reach Deepgram: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Hard failures block live call entirely. Deepgram being unavailable is NOT a
  // hard failure — Web Speech API fallback handles it automatically.
  const hardFailures = ['openai_api_key', 'supabase_url', 'supabase_auth'];
  const allOk = hardFailures.every((k) => checks[k]?.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 422 });
}
