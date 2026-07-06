/**
 * Custom Next.js server with WebSocket support for Deepgram streaming.
 *
 * WHY a custom server?
 * Next.js App Router route handlers cannot handle WebSocket upgrades — the
 * HTTP upgrade mechanism requires access to the raw TCP socket before any
 * response is written, which the App Router abstracts away. A custom server
 * intercepts the upgrade event before Next.js sees it, handles /api/transcribe-ws
 * as a persistent WebSocket proxy to Deepgram, and passes everything else to
 * Next.js as normal.
 *
 * Audio flow (continuous streaming):
 *
 *   Browser mic
 *     → MediaRecorder.start(250ms timeslice)  — no stop/restart, no gaps
 *     → ondataavailable(blob) every 250ms
 *     → ws.send(blob)                         — one persistent WebSocket
 *     → /api/transcribe-ws  (this server)
 *     → Deepgram streaming WS (server-side, DEEPGRAM_API_KEY never leaves server)
 *     → Results event (interim / final)
 *     → server relays → browser WS
 *     → browser: interim → setPartial(), final → addLine()
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'node:url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handleTranscribeWs, closeAllConnections, getActiveConnectionCount } from './lib/transcribe-ws-server';
import { markShuttingDown } from './app/api/health/route';

// Load .env.local into process.env before anything else.
// Next.js does this automatically for its own route handlers, but server.ts
// is a separate Node.js entry point — we must do it manually.
function loadEnvLocal() {
  const envPath = '.env.local';
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

// ── Global error handlers ──────────────────────────────────────────────────
// Prevent an unhandled rejection from crashing the process in production.
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
});

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME ?? (dev ? 'localhost' : '0.0.0.0');
const port = parseInt(process.env.PORT ?? '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    void handle(req, res, parsedUrl);
  });

  // WebSocket server handles /api/transcribe-ws upgrades on the same port.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '');
    if (pathname === '/api/transcribe-ws') {
      wss.handleUpgrade(req, socket as never, head, (ws) => {
        void handleTranscribeWs(ws, req);
      });
    }
    // Other WebSocket paths (e.g. /_next/webpack-hmr for HMR) are left
    // unhandled here — Next.js attaches its own upgrade listener.
    // Do NOT destroy them — that would break hot reload in development.
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port} [${dev ? 'development' : 'production'}]`);
    console.log('> Deepgram streaming WS endpoint: /api/transcribe-ws');
    if (!dev) {
      console.log('> Health check: GET /api/health');
    }
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  // SIGTERM is sent by Railway, Fly.io, Docker, and Kubernetes on stop/deploy.
  // SIGINT is Ctrl+C in development.
  //
  // Shutdown sequence:
  //  1. Tell health check to return 503 so load balancer stops routing here.
  //  2. Stop accepting new WebSocket connections.
  //  3. Notify all connected WS clients ("server shutting down").
  //  4. Close client WS and Deepgram WS connections.
  //  5. Close HTTP server (drain existing keep-alive connections).
  //  6. Exit with code 0.

  const SHUTDOWN_TIMEOUT_MS = 15_000; // force-exit after 15s if draining stalls

  async function gracefulShutdown(signal: string) {
    console.log(`\n[server] received ${signal} — starting graceful shutdown`);

    // Step 1: health check → 503
    markShuttingDown();

    // Step 2 + 3 + 4: close all WebSocket connections
    const count = getActiveConnectionCount();
    if (count > 0) {
      console.log(`[server] notifying ${count} active WebSocket client(s)…`);
    }
    closeAllConnections('Server shutting down');

    // Force-exit guard
    const forceExit = setTimeout(() => {
      console.error('[server] shutdown timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref(); // don't keep event loop alive just for this

    // Step 5: close HTTP server (stops accepting new connections, drains existing)
    await new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) console.error('[server] httpServer.close error:', err);
        resolve();
      });
    });

    clearTimeout(forceExit);
    console.log('[server] shutdown complete — exiting');
    process.exit(0);
  }

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => void gracefulShutdown('SIGINT'));

}).catch((err: unknown) => {
  console.error('Failed to start custom server:', err);
  process.exit(1);
});
