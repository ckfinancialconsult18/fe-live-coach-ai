/**
 * Per-connection Deepgram streaming WebSocket proxy.
 *
 * Called by server.ts for each browser connection to /api/transcribe-ws.
 *
 * ── Authentication flow (post-connect, not URL query param) ──────────
 * 1. Browser connects — no token in the URL.
 * 2. Server waits up to AUTH_TIMEOUT_MS for the first message.
 * 3. Browser sends { type: 'auth', token: '<supabase-access-token>' }.
 * 4. Server validates with Supabase; if valid opens the Deepgram WS.
 * 5. Server sends { type: 'connected' } when Deepgram is ready.
 * 6. Browser starts sending audio blobs.
 *
 * ── Wire protocol (server → browser) ────────────────────────────────
 *   { type: 'auth_required' }                — sent immediately on connect
 *   { type: 'connected' }                    — Deepgram session ready
 *   { type: 'interim', transcript, serverTs }
 *   { type: 'final',   transcript, serverTs }
 *   { type: 'speech-started', serverTs }
 *   { type: 'error',   message }
 *
 * ── Keepalive ────────────────────────────────────────────────────────
 * Server sends a Deepgram KeepAlive JSON frame every KEEPALIVE_INTERVAL_MS
 * when no audio has flowed. Prevents Deepgram from closing the WS after
 * ~10s of silence while the agent is listening.
 *
 * ── Ping/pong heartbeat ──────────────────────────────────────────────
 * Server sends a WebSocket ping every PING_INTERVAL_MS. If no pong arrives
 * within PONG_TIMEOUT_MS, the connection is terminated as stale.
 */

import type { WebSocket as WsSocket } from 'ws';
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, wsConnectionLimiter } from './rate-limit';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DgWord {
  word: string;
  punctuated_word?: string;
  speaker?: number;
  confidence?: number;
}

interface DgEvent {
  type: string;
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
  | { type: 'auth_required' }
  | { type: 'connected' }
  | { type: 'interim'; transcript: string; words: DgWord[]; confidence: number; serverTs: number }
  | { type: 'final';   transcript: string; words: DgWord[]; confidence: number; serverTs: number }
  | { type: 'speech-started'; serverTs: number }
  | { type: 'error';   message: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const DG_STREAMING_URL = 'wss://api.deepgram.com/v1/listen';
const DG_MODELS = ['nova-3', 'nova-2', 'nova-2-general', 'base'];
const MAX_AUDIO_BUFFER_BYTES = 5 * 1024 * 1024;

const AUTH_TIMEOUT_MS   = 5_000;   // close if no auth within 5s
const KEEPALIVE_INTERVAL_MS = 8_000;   // Deepgram KeepAlive every 8s of silence
const PING_INTERVAL_MS  = 30_000;  // WS ping every 30s
const PONG_TIMEOUT_MS   = 10_000;  // close if no pong within 10s

// ── Active connection registry (for graceful shutdown) ────────────────────────

const activeConnections = new Set<() => void>();

export function getActiveConnectionCount(): number {
  return activeConnections.size;
}

export function closeAllConnections(reason = 'Server shutting down'): void {
  for (const close of activeConnections) {
    close();
  }
  activeConnections.clear();
  console.log(`[transcribe-ws] closed all ${activeConnections.size} connections — reason: ${reason}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendToClient(ws: WsSocket, msg: ClientMsg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

async function verifySupabaseToken(token: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('[transcribe-ws] Supabase env vars missing');
    return null;
  }
  try {
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

  const clientIp = getClientIp(req);

  // ── IP-based connection rate limit ────────────────────────────────────────
  const rl = checkRateLimit(wsConnectionLimiter, clientIp);
  if (!rl.allowed) {
    sendToClient(clientWs, { type: 'error', message: 'Too many connections from your IP. Please wait before reconnecting.' });
    clientWs.close(4029, 'Rate limited');
    return;
  }

  // ── Per-connection state ───────────────────────────────────────────────────
  let dgWs: WebSocket | null = null;
  let dgOpen = false;
  let audioQueue: Buffer[] = [];
  let audioQueueBytes = 0;
  let userId: string | null = null;
  let authenticated = false;
  let lastAudioAt = 0;          // Date.now() when last audio blob arrived
  let pongTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let authTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Teardown ───────────────────────────────────────────────────────────────
  function teardown(code: number, reason: string) {
    if (keepaliveTimer)    { clearInterval(keepaliveTimer);    keepaliveTimer = null; }
    if (pingTimer)         { clearInterval(pingTimer);         pingTimer = null; }
    if (pongTimeoutHandle) { clearTimeout(pongTimeoutHandle);  pongTimeoutHandle = null; }
    if (authTimer)      { clearTimeout(authTimer);       authTimer = null; }
    audioQueue = [];
    audioQueueBytes = 0;
    if (dgWs && (dgWs.readyState === dgWs.OPEN || dgWs.readyState === dgWs.CONNECTING)) {
      try { if (dgOpen) dgWs.send(new Uint8Array(0)); } catch { /* ignore */ }
      dgWs.close(1000, reason);
    }
    dgWs = null;
    if (clientWs.readyState === clientWs.OPEN || clientWs.readyState === clientWs.CONNECTING) {
      clientWs.close(code, reason);
    }
    activeConnections.delete(teardownBound);
  }
  function teardownBound() { teardown(1001, 'Server-initiated close'); }

  activeConnections.add(teardownBound);

  // ── Step 1: announce that auth is required ────────────────────────────────
  sendToClient(clientWs, { type: 'auth_required' });

  // Close if no auth arrives within AUTH_TIMEOUT_MS
  authTimer = setTimeout(() => {
    if (!authenticated) {
      console.warn(`[transcribe-ws] auth timeout — ip=${clientIp}`);
      sendToClient(clientWs, { type: 'error', message: 'Authentication timeout' });
      teardown(4001, 'Auth timeout');
    }
  }, AUTH_TIMEOUT_MS);

  // ── Deepgram connection ────────────────────────────────────────────────────
  const dgParams = new URLSearchParams({
    model: DG_MODELS[0],
    language: 'en-US',
    diarize: 'true',
    smart_format: 'true',
    punctuate: 'true',
    interim_results: 'true',
    endpointing: '300',
    utterance_end_ms: '1000',
    vad_events: 'true',
  });

  function startKeepalive() {
    if (keepaliveTimer) return;
    keepaliveTimer = setInterval(() => {
      if (!dgOpen || !dgWs || dgWs.readyState !== dgWs.OPEN) return;
      const silentMs = Date.now() - lastAudioAt;
      if (silentMs >= KEEPALIVE_INTERVAL_MS) {
        // No audio for KEEPALIVE_INTERVAL_MS — send Deepgram KeepAlive
        try {
          dgWs.send(JSON.stringify({ type: 'KeepAlive' }));
        } catch {
          // Deepgram closed — handled by dg.on('close')
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  function startPingPong() {
    if (pingTimer) return;

    clientWs.on('pong', () => {
      // Pong received — cancel the stale-connection timeout
      if (pongTimeoutHandle) { clearTimeout(pongTimeoutHandle); pongTimeoutHandle = null; }
    });

    pingTimer = setInterval(() => {
      if (clientWs.readyState !== clientWs.OPEN) return;
      clientWs.ping();
      // Schedule teardown if pong doesn't arrive within PONG_TIMEOUT_MS
      pongTimeoutHandle = setTimeout(() => {
        console.warn(`[transcribe-ws] pong timeout — userId=${userId} ip=${clientIp}`);
        teardown(1001, 'Pong timeout');
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  function openDeepgramWs(modelIndex = 0): void {
    if (modelIndex >= DG_MODELS.length) {
      const msg = 'All Deepgram models failed to connect';
      console.error(`[transcribe-ws] ${msg} — userId=${userId}`);
      sendToClient(clientWs, { type: 'error', message: msg });
      teardown(1011, 'Deepgram unavailable');
      return;
    }

    dgParams.set('model', DG_MODELS[modelIndex]);
    const model = DG_MODELS[modelIndex];
    const url = `${DG_STREAMING_URL}?${dgParams}`;
    console.log(`[transcribe-ws] connecting to Deepgram — model=${model} userId=${userId}`);

    const dg = new WebSocket(url, { headers: { Authorization: `Token ${apiKey}` } });
    dgWs = dg;

    dg.on('open', () => {
      dgOpen = true;
      lastAudioAt = Date.now();
      console.log(`[transcribe-ws] Deepgram connected — model=${model} userId=${userId}`);
      sendToClient(clientWs, { type: 'connected' });

      // Drain pre-connect audio buffer
      for (const chunk of audioQueue) {
        if (dg.readyState === dg.OPEN) dg.send(chunk);
      }
      audioQueue = [];
      audioQueueBytes = 0;

      startKeepalive();
    });

    dg.on('message', (raw) => {
      let event: DgEvent;
      try { event = JSON.parse(raw.toString()) as DgEvent; }
      catch { return; }

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
        serverTs: Date.now(),
      });
    });

    dg.on('error', (err) => {
      console.error(`[transcribe-ws] Deepgram WS error — model=${model} userId=${userId}:`, err.message);
      if (!dgOpen) openDeepgramWs(modelIndex + 1);
    });

    dg.on('close', (code, reason) => {
      console.log(`[transcribe-ws] Deepgram WS closed — code=${code} reason=${reason.toString()} userId=${userId}`);
      dgWs = null;
      dgOpen = false;
      if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
      if (clientWs.readyState === clientWs.OPEN && code !== 1000) {
        clientWs.close(1011, 'Deepgram connection lost');
      }
    });
  }

  // ── Message handler ────────────────────────────────────────────────────────
  clientWs.on('message', async (data, isBinary) => {
    // ── Auth phase: expect { type: 'auth', token: '...' } as first text frame
    if (!authenticated) {
      if (isBinary) {
        // Audio before auth — reject
        sendToClient(clientWs, { type: 'error', message: 'Authentication required before sending audio' });
        teardown(4001, 'Unauthorized');
        return;
      }

      let msg: { type: string; token?: string };
      try { msg = JSON.parse(data.toString()) as { type: string; token?: string }; }
      catch {
        sendToClient(clientWs, { type: 'error', message: 'Invalid auth message format' });
        teardown(4001, 'Invalid auth message');
        return;
      }

      if (msg.type !== 'auth' || !msg.token) {
        sendToClient(clientWs, { type: 'error', message: 'Expected { type: "auth", token: "..." }' });
        teardown(4001, 'Invalid auth message');
        return;
      }

      const id = await verifySupabaseToken(msg.token);
      if (!id) {
        sendToClient(clientWs, { type: 'error', message: 'Invalid or expired auth token' });
        teardown(4001, 'Unauthorized');
        return;
      }

      // Auth successful
      if (authTimer) { clearTimeout(authTimer); authTimer = null; }
      userId = id;
      authenticated = true;
      console.log(`[transcribe-ws] authenticated — userId=${userId} ip=${clientIp}`);

      startPingPong();
      openDeepgramWs();
      return;
    }

    // ── Audio phase: only binary blobs after auth ─────────────────────────
    if (!isBinary) return; // ignore stray text frames after auth

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (buf.length === 0) return;

    lastAudioAt = Date.now();

    if (dgOpen && dgWs !== null && dgWs.readyState === dgWs.OPEN) {
      dgWs.send(buf);
    } else if (audioQueueBytes < MAX_AUDIO_BUFFER_BYTES) {
      audioQueue.push(buf);
      audioQueueBytes += buf.length;
    }
  });

  // ── Client disconnect ──────────────────────────────────────────────────────
  clientWs.on('close', (code) => {
    console.log(`[transcribe-ws] client closed — code=${code} userId=${userId ?? 'unauthenticated'}`);
    teardown(1000, 'Client disconnected');
  });

  clientWs.on('error', (err) => {
    console.error(`[transcribe-ws] client WS error — userId=${userId ?? 'unauthenticated'}:`, err.message);
    teardown(1001, 'Client error');
  });
}
