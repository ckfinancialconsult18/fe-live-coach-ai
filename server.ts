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
import { handleTranscribeWs } from './lib/transcribe-ws-server';

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

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME ?? 'localhost';
const port = parseInt(process.env.PORT ?? '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    void handle(req, res, parsedUrl);
  });

  // WebSocket server handles /api/transcribe-ws upgrades on the same port.
  // All other upgrade requests (HMR socket, etc.) are destroyed.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '');
    if (pathname === '/api/transcribe-ws') {
      wss.handleUpgrade(req, socket as never, head, (ws) => {
        void handleTranscribeWs(ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, () => {
    console.log(
      `> Ready on http://${hostname}:${port} [${dev ? 'development' : 'production'}]`
    );
    console.log('> Deepgram streaming WS endpoint: /api/transcribe-ws');
  });
}).catch((err: unknown) => {
  console.error('Failed to start custom server:', err);
  process.exit(1);
});
