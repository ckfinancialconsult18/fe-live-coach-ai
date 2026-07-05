/**
 * Per-connection Deepgram streaming WebSocket proxy.
 *
 * Called by server.ts for each browser connection to /api/transcribe-ws.
 * Each connection gets its own Deepgram WS so sessions are isolated.
 *
 * Wire protocol (server → browser):
 *   { type: 'connected' }
 *   { type: 'interim', transcript: string, words: DgWord[], confidence: number }
 *   { type: 'final',   transcript: string, words: DgWord[], confidence: number }
 *   { type: 'error',   message: string }
 *
 * Browser → server: raw binary audio blobs (WebM/Opus from MediaRecorder timeslice)
 */

import type { WebSocket as WsSocket } from 'ws';
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { parse } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DgWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

interface DgEvent {
  type: string;
  // Results event fields
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives: Array<{
      transcript: string;
      confidence: number;
      words: DgWord[];
    }>;
  };
}

type ClientMsg =
  | { type: 'connected' }
  | { type: 'interim'; transcript: string; words: DgWord[]; confidence: number; serverTs: number }
  | { type: 'final';   transcript: string; words: DgWord[]; confidence: number; serverTs: number }
  | { type: 'speech-started'; serverTs: number }
  | { type: 'error';   message: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const DG_STREAMING_URL = 'wss://api.deepgram.com/v1/listen';
// Models tried in order on connection failure
const DG_MODELS = ['nova-3', 'nova-2', 'nova-2-general', 'base'];
const MAX_AUDIO_BUFFER_BYTES = 5 * 1024 * 1024; // 5 MB queued while DG connects

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendToClient(ws: WsSocket, msg: ClientMsg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function verifySupabaseToken(token: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('[transcribe-ws] Supabase env vars missing — cannot verify token');
    return null;
  }
  try {
    // createClient with the anon key validates the JWT against the project secret.
    const sb = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch (err) {
    console.error('[transcribe-ws] token verification threw:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleTranscribeWs(
  clientWs: WsSocket,
  req: IncomingMessage,
): Promise<void> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    sendToClient(clientWs, { type: 'error', message: 'DEEPGRAM_API_KEY not configured on server' });
    clientWs.close(1011, 'Server misconfiguration');
    return;
  }

  // ── Auth: access token passed in ?token= query param ──────────────────────
  // The browser hook calls supabase.auth.getSession() and sends the short-lived
  // JWT as a URL param. We verify it here without touching Next.js APIs.
  const { query } = parse(req.url ?? '', true);
  const rawToken = Array.isArray(query['token']) ? query['token'][0] : query['token'];

  if (!rawToken) {
    sendToClient(clientWs, { type: 'error', message: 'No auth token provided' });
    clientWs.close(4001, 'Unauthorized');
    return;
  }

  const userId = await verifySupabaseToken(rawToken);
  if (!userId) {
    sendToClient(clientWs, { type: 'error', message: 'Invalid or expired auth token' });
    clientWs.close(4001, 'Unauthorized');
    return;
  }

  console.log(`[transcribe-ws] authenticated — userId=${userId}`);

  // ── Deepgram streaming parameters ─────────────────────────────────────────
  // No `encoding` param — Deepgram auto-detects from the WebM container header
  // in the first audio chunk. `interim_results` enables real-time partials.
  const dgParams = new URLSearchParams({
    model: DG_MODELS[0],
    language: 'en-US',
    diarize: 'true',
    smart_format: 'true',
    punctuate: 'true',
    interim_results: 'true',
    endpointing: '300',       // Final after 300 ms of silence
    utterance_end_ms: '1000', // Additional grace window
    vad_events: 'true',
  });

  // ── Per-connection state ───────────────────────────────────────────────────
  let dgWs: WebSocket | null = null;
  let dgOpen = false;
  let audioQueue: Buffer[] = []; // pre-connect buffer
  let audioQueueBytes = 0;

  function openDeepgramWs(modelIndex = 0): void {
    if (modelIndex >= DG_MODELS.length) {
      const msg = 'All Deepgram models failed to connect';
      console.error(`[transcribe-ws] ${msg} — userId=${userId}`);
      sendToClient(clientWs, { type: 'error', message: msg });
      clientWs.close(1011, 'Deepgram unavailable');
      return;
    }

    dgParams.set('model', DG_MODELS[modelIndex]);
    const model = DG_MODELS[modelIndex];
    const url = `${DG_STREAMING_URL}?${dgParams}`;

    console.log(`[transcribe-ws] connecting to Deepgram — model=${model} userId=${userId}`);

    const dg = new WebSocket(url, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    dgWs = dg;

    dg.on('open', () => {
      dgOpen = true;
      console.log(`[transcribe-ws] Deepgram connected — model=${model} userId=${userId}`);
      sendToClient(clientWs, { type: 'connected' });

      // Drain pre-connect audio buffer
      for (const chunk of audioQueue) {
        if (dg.readyState === dg.OPEN) dg.send(chunk);
      }
      audioQueue = [];
      audioQueueBytes = 0;
    });

    dg.on('message', (raw) => {
      let event: DgEvent;
      try {
        event = JSON.parse(raw.toString()) as DgEvent;
      } catch {
        return; // non-JSON keepalive or status frame
      }

      // SpeechStarted: Deepgram VAD detected voice — forward so client can
      // measure time-from-first-audio-to-speech-detected.
      if (event.type === 'SpeechStarted') {
        sendToClient(clientWs, { type: 'speech-started', serverTs: Date.now() });
        return;
      }

      if (event.type !== 'Results') return;

      const alt = event.channel?.alternatives?.[0];
      if (!alt?.transcript?.trim()) return;

      sendToClient(clientWs, {
        type: event.is_final === true ? 'final' : 'interim',
        transcript: alt.transcript,
        words: alt.words ?? [],
        confidence: alt.confidence ?? 0,
        // Server timestamp lets the client compute network+Deepgram latency
        // independently of the browser→server leg.
        serverTs: Date.now(),
      });
    });

    dg.on('error', (err) => {
      console.error(`[transcribe-ws] Deepgram WS error — model=${model} userId=${userId}:`, err.message);
      if (!dgOpen) {
        // Connection failed before open — try next model
        openDeepgramWs(modelIndex + 1);
      }
    });

    dg.on('close', (code, reason) => {
      console.log(`[transcribe-ws] Deepgram WS closed — code=${code} reason=${reason.toString()} userId=${userId}`);
      dgWs = null;
      dgOpen = false;
      if (clientWs.readyState === clientWs.OPEN && code !== 1000) {
        clientWs.close(1011, 'Deepgram connection lost');
      }
    });
  }

  openDeepgramWs();

  // ── Proxy audio: browser → Deepgram ───────────────────────────────────────
  clientWs.on('message', (data, isBinary) => {
    // Ignore text control frames; only pass binary audio
    if (!isBinary) return;

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (buf.length === 0) return; // zero-byte = end-of-stream signal

    if (dgOpen && dgWs !== null && dgWs.readyState === dgWs.OPEN) {
      dgWs.send(buf);
    } else if (audioQueueBytes < MAX_AUDIO_BUFFER_BYTES) {
      audioQueue.push(buf);
      audioQueueBytes += buf.length;
    }
    // If buffer full, drop the chunk — Deepgram will catch up when it connects
  });

  // ── Clean up when client disconnects ──────────────────────────────────────
  clientWs.on('close', (code) => {
    console.log(`[transcribe-ws] client closed — code=${code} userId=${userId}`);
    audioQueue = [];
    audioQueueBytes = 0;
    if (dgWs && (dgWs.readyState === dgWs.OPEN || dgWs.readyState === dgWs.CONNECTING)) {
      // Zero-byte signals end-of-stream to Deepgram, then close cleanly
      try { if (dgOpen) dgWs.send(new Uint8Array(0)); } catch { /* ignore */ }
      dgWs.close(1000, 'Client disconnected');
    }
  });

  clientWs.on('error', (err) => {
    console.error(`[transcribe-ws] client WS error — userId=${userId}:`, err.message);
    audioQueue = [];
    audioQueueBytes = 0;
    if (dgWs !== null && dgWs.readyState === dgWs.OPEN) {
      dgWs.close(1001, 'Client error');
    }
  });
}
