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

  // 4. OpenAI Realtime — try each model in priority order.
  //    A 404 means that model is unavailable on this account; try the next one.
  //    If all fail, the app automatically falls back to Web Speech API — NOT an error.
  const REALTIME_MODELS = [
    process.env.OPENAI_REALTIME_MODEL,
    'gpt-4o-realtime-preview',
    'gpt-4o-mini-realtime-preview',
    'gpt-4o-realtime-preview-2024-10-01',
  ].filter(Boolean) as string[];

  if (apiKey) {
    let realtimeOk = false;
    let realtimeModel = '';
    const realtimeTried: string[] = [];

    for (const model of REALTIME_MODELS) {
      try {
        const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, modalities: ['audio', 'text'], instructions: 'Status check' }),
        });
        realtimeTried.push(`${model} → HTTP ${res.status}`);
        if (res.ok) { realtimeOk = true; realtimeModel = model; break; }
        // 401/429 are account-level failures — no point trying more models.
        if (res.status === 401 || res.status === 429) break;
      } catch (err) {
        realtimeTried.push(`${model} → network error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (realtimeOk) {
      checks.openai_realtime = {
        ok: true,
        message: `OpenAI Realtime API working — using model: ${realtimeModel}`,
      };
    } else {
      // Not a hard failure — the app automatically uses Web Speech API as fallback.
      checks.openai_realtime = {
        ok: false,
        message:
          `No Realtime model available on this account (tried: ${realtimeTried.join('; ')}). ` +
          'Live transcription will automatically use the browser Web Speech API instead. ' +
          'To use OpenAI Realtime, set OPENAI_REALTIME_MODEL to a model your account can access, ' +
          'or upgrade your OpenAI plan at platform.openai.com.',
      };
    }
  } else {
    checks.openai_realtime = {
      ok: false,
      message: 'Skipped — OPENAI_API_KEY not configured.',
    };
  }

  // "ok" means everything needed for SOME form of live transcription is working.
  // Realtime being unavailable is NOT a blocker when Web Speech API fallback is active.
  const hardFailures = ['openai_api_key', 'supabase_url', 'supabase_auth'];
  const allOk = hardFailures.every((k) => checks[k]?.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 422 });
}
