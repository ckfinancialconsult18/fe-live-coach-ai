import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Pre-flight status check for the live call feature. Called by the live-call
 * UI before the user clicks Start Call so every missing requirement surfaces
 * with an exact, actionable message rather than a generic failure mid-call.
 *
 * Each check is independent — a failure in one does not prevent the others
 * from running.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; message: string }> = {};

  // 1. OPENAI_API_KEY present
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    checks.openai_api_key = {
      ok: false,
      message:
        'OPENAI_API_KEY is not set. Add it in Vercel → Project Settings → Environment Variables, ' +
        'or in .env.local for local development.',
    };
  } else {
    checks.openai_api_key = { ok: true, message: 'OPENAI_API_KEY is configured.' };
  }

  // 2. Supabase URL format — must be base URL without /rest/v1/
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!supabaseUrl) {
    checks.supabase_url = { ok: false, message: 'NEXT_PUBLIC_SUPABASE_URL is not set.' };
  } else if (supabaseUrl.includes('/rest/v1') || supabaseUrl.includes('/auth/v1')) {
    checks.supabase_url = {
      ok: false,
      message:
        `NEXT_PUBLIC_SUPABASE_URL has a path suffix ("${supabaseUrl}"). ` +
        'It must be the base URL only, e.g. https://your-project.supabase.co — ' +
        'no trailing path. This causes every auth call to fail with 401.',
    };
  } else {
    checks.supabase_url = { ok: true, message: `Supabase URL: ${supabaseUrl}` };
  }

  // 3. Supabase auth — verify the current request is from an authenticated user
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

  // 4. OpenAI Realtime sessions endpoint reachable
  if (apiKey) {
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
          instructions: 'Transcription test',
        }),
      });
      if (res.ok) {
        checks.openai_realtime = { ok: true, message: 'OpenAI Realtime API reachable and key is valid.' };
      } else {
        const text = await res.text();
        checks.openai_realtime = {
          ok: false,
          message:
            `OpenAI Realtime returned HTTP ${res.status}. ` +
            (res.status === 401
              ? 'API key is invalid or expired.'
              : res.status === 403
              ? 'API key does not have Realtime API access. Ensure your OpenAI account has gpt-4o-realtime access enabled.'
              : res.status === 404
              ? 'Model gpt-4o-realtime-preview-2024-12-17 not found. Check OpenAI Realtime model availability for your account.'
              : `Unexpected error: ${text.slice(0, 200)}`),
        };
      }
    } catch (err) {
      checks.openai_realtime = {
        ok: false,
        message: `Could not reach OpenAI Realtime API: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else {
    checks.openai_realtime = { ok: false, message: 'Skipped — OPENAI_API_KEY not configured.' };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 422 });
}
