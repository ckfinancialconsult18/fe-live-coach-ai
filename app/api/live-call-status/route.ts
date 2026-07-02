import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Builds a minimal valid WAV file (0.25s of 8kHz 16-bit mono silence) used to
 * test the full Deepgram /v1/listen pipeline. If this request succeeds, the
 * API key, plan, credits, and nova-2 model access are ALL verified — so any
 * failure in /api/transcribe afterwards must be the audio payload itself.
 */
function buildTestWav(): ArrayBuffer {
  const sampleRate = 8000;
  const samples = sampleRate / 4; // 0.25s
  const dataSize = samples * 2;
  const buf = new Uint8Array(44 + dataSize); // data section stays zero = silence
  const view = new DataView(buf.buffer);
  const ascii = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) buf[offset + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, dataSize, true);
  return view.buffer as ArrayBuffer;
}

/**
 * Pre-flight status check for the live call feature. Checks every requirement
 * independently so all failures surface at once with exact, actionable messages.
 * Visit /api/live-call-status in your browser for a full diagnostic report.
 */
export async function GET() {
  // Auth-gate the diagnostics: this endpoint reveals configuration state
  // (which env vars are set, the Supabase URL, provider error bodies) and must
  // not be readable by anonymous visitors.
  try {
    const supabaseGate = await createClient();
    const { data: { user: gateUser } } = await supabaseGate.auth.getUser();
    if (!gateUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  // 4. Deepgram — verified with a REAL test transcription (tiny silent WAV),
  //    not just a key check. If this passes, the key, plan, credits, and
  //    nova-2 model access are all confirmed working — any later failure in
  //    /api/transcribe is then provably an audio-payload problem, not account
  //    config. Not a hard failure: if unconfigured, transcription falls back
  //    to the browser's Web Speech API automatically.
  const deepgramKey = process.env.DEEPGRAM_API_KEY;

  if (!deepgramKey) {
    checks.deepgram = {
      ok: false,
      message:
        'DEEPGRAM_API_KEY is not set. Create a free account at console.deepgram.com. ' +
        'Transcription will fall back to the browser Web Speech API (Chrome/Edge only) until this is configured.',
    };
  } else {
    try {
      const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2', {
        method: 'POST',
        headers: { Authorization: `Token ${deepgramKey}`, 'Content-Type': 'audio/wav' },
        body: buildTestWav(),
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        checks.deepgram = {
          ok: true,
          message: 'Deepgram accepted a real test transcription (API key, plan/credits, and nova-2 model access all verified).',
        };
      } else {
        console.error(`[live-call-status] Deepgram test transcription failed — HTTP ${res.status} | FULL BODY:\n${text}`);
        checks.deepgram = {
          ok: false,
          message: `Deepgram rejected a real test transcription (HTTP ${res.status}): ${text}. ` +
            'This is the exact error /api/transcribe hits on every chunk. ' +
            'Check the API key, plan/credits, and model access at console.deepgram.com.',
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
