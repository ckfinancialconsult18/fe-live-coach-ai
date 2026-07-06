"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_node_http = require("node:http");
var import_node_fs = require("node:fs");
var import_node_url = require("node:url");
var import_next = __toESM(require("next"));
var import_ws2 = require("ws");

// lib/transcribe-ws-server.ts
var import_ws = require("ws");
var import_supabase_js = require("@supabase/supabase-js");

// lib/rate-limit.ts
var limiters = /* @__PURE__ */ new Map();
function createRateLimiter(name, maxRequests, windowMs) {
  if (!limiters.has(name)) {
    limiters.set(name, { maxRequests, windowMs, buckets: /* @__PURE__ */ new Map() });
  }
  return limiters.get(name);
}
function checkRateLimit(limiter, key) {
  const now = Date.now();
  const { maxRequests, windowMs } = limiter;
  let bucket = limiter.buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: new Array(maxRequests).fill(0), head: 0 };
    limiter.buckets.set(key, bucket);
  }
  const windowStart = now - windowMs;
  let count = 0;
  let oldestInWindow = now;
  for (const ts of bucket.timestamps) {
    if (ts > windowStart) {
      count++;
      if (ts < oldestInWindow) oldestInWindow = ts;
    }
  }
  if (count >= maxRequests) {
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1e3) };
  }
  bucket.timestamps[bucket.head] = now;
  bucket.head = (bucket.head + 1) % maxRequests;
  return { allowed: true };
}
var cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const limiter of limiters.values()) {
      for (const [key, bucket] of limiter.buckets) {
        const hasActive = bucket.timestamps.some((ts) => ts > now - limiter.windowMs);
        if (!hasActive) limiter.buckets.delete(key);
      }
    }
  }, 6e4);
}
scheduleCleanup();
var coachLimiter = createRateLimiter("coach", 20, 6e4);
var interimCoachLimiter = createRateLimiter("coach-interim", 60, 6e4);
var transcribeLimiter = createRateLimiter("transcribe", 120, 6e4);
var wsConnectionLimiter = createRateLimiter("ws-connect", 10, 6e4);
var roleplayLimiter = createRateLimiter("roleplay", 60, 6e4);

// lib/transcribe-ws-server.ts
var DG_STREAMING_URL = "wss://api.deepgram.com/v1/listen";
var DG_MODELS = ["nova-3", "nova-2", "nova-2-general", "base"];
var MAX_AUDIO_BUFFER_BYTES = 5 * 1024 * 1024;
var AUTH_TIMEOUT_MS = 5e3;
var KEEPALIVE_INTERVAL_MS = 8e3;
var PING_INTERVAL_MS = 3e4;
var PONG_TIMEOUT_MS = 1e4;
var activeConnections = /* @__PURE__ */ new Set();
function getActiveConnectionCount() {
  return activeConnections.size;
}
function closeAllConnections(reason = "Server shutting down") {
  for (const close of activeConnections) {
    close();
  }
  activeConnections.clear();
  console.log(`[transcribe-ws] closed all ${activeConnections.size} connections \u2014 reason: ${reason}`);
}
function sendToClient(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}
async function verifySupabaseToken(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("[transcribe-ws] Supabase env vars missing");
    return null;
  }
  try {
    const sb = (0, import_supabase_js.createClient)(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch (err) {
    console.error("[transcribe-ws] token verification threw:", err instanceof Error ? err.message : err);
    return null;
  }
}
async function handleTranscribeWs(clientWs, req) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    sendToClient(clientWs, { type: "error", message: "DEEPGRAM_API_KEY not configured on server" });
    clientWs.close(1011, "Server misconfiguration");
    return;
  }
  const clientIp = getClientIp(req);
  const rl = checkRateLimit(wsConnectionLimiter, clientIp);
  if (!rl.allowed) {
    sendToClient(clientWs, { type: "error", message: "Too many connections from your IP. Please wait before reconnecting." });
    clientWs.close(4029, "Rate limited");
    return;
  }
  let dgWs = null;
  let dgOpen = false;
  let audioQueue = [];
  let audioQueueBytes = 0;
  let userId = null;
  let authenticated = false;
  let lastAudioAt = 0;
  let pongTimeoutHandle = null;
  let keepaliveTimer = null;
  let pingTimer = null;
  let authTimer = null;
  function teardown(code, reason) {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (pongTimeoutHandle) {
      clearTimeout(pongTimeoutHandle);
      pongTimeoutHandle = null;
    }
    if (authTimer) {
      clearTimeout(authTimer);
      authTimer = null;
    }
    audioQueue = [];
    audioQueueBytes = 0;
    if (dgWs && (dgWs.readyState === dgWs.OPEN || dgWs.readyState === dgWs.CONNECTING)) {
      try {
        if (dgOpen) dgWs.send(new Uint8Array(0));
      } catch {
      }
      dgWs.close(1e3, reason);
    }
    dgWs = null;
    if (clientWs.readyState === clientWs.OPEN || clientWs.readyState === clientWs.CONNECTING) {
      clientWs.close(code, reason);
    }
    activeConnections.delete(teardownBound);
  }
  function teardownBound() {
    teardown(1001, "Server-initiated close");
  }
  activeConnections.add(teardownBound);
  sendToClient(clientWs, { type: "auth_required" });
  authTimer = setTimeout(() => {
    if (!authenticated) {
      console.warn(`[transcribe-ws] auth timeout \u2014 ip=${clientIp}`);
      sendToClient(clientWs, { type: "error", message: "Authentication timeout" });
      teardown(4001, "Auth timeout");
    }
  }, AUTH_TIMEOUT_MS);
  const dgParams = new URLSearchParams({
    model: DG_MODELS[0],
    language: "en-US",
    diarize: "true",
    smart_format: "true",
    punctuate: "true",
    interim_results: "true",
    endpointing: "300",
    utterance_end_ms: "1000",
    vad_events: "true"
  });
  function startKeepalive() {
    if (keepaliveTimer) return;
    keepaliveTimer = setInterval(() => {
      if (!dgOpen || !dgWs || dgWs.readyState !== dgWs.OPEN) return;
      const silentMs = Date.now() - lastAudioAt;
      if (silentMs >= KEEPALIVE_INTERVAL_MS) {
        try {
          dgWs.send(JSON.stringify({ type: "KeepAlive" }));
        } catch {
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }
  function startPingPong() {
    if (pingTimer) return;
    clientWs.on("pong", () => {
      if (pongTimeoutHandle) {
        clearTimeout(pongTimeoutHandle);
        pongTimeoutHandle = null;
      }
    });
    pingTimer = setInterval(() => {
      if (clientWs.readyState !== clientWs.OPEN) return;
      clientWs.ping();
      pongTimeoutHandle = setTimeout(() => {
        console.warn(`[transcribe-ws] pong timeout \u2014 userId=${userId} ip=${clientIp}`);
        teardown(1001, "Pong timeout");
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }
  function openDeepgramWs(modelIndex = 0) {
    if (modelIndex >= DG_MODELS.length) {
      const msg = "All Deepgram models failed to connect";
      console.error(`[transcribe-ws] ${msg} \u2014 userId=${userId}`);
      sendToClient(clientWs, { type: "error", message: msg });
      teardown(1011, "Deepgram unavailable");
      return;
    }
    dgParams.set("model", DG_MODELS[modelIndex]);
    const model = DG_MODELS[modelIndex];
    const url = `${DG_STREAMING_URL}?${dgParams}`;
    console.log(`[transcribe-ws] connecting to Deepgram \u2014 model=${model} userId=${userId}`);
    const dg = new import_ws.WebSocket(url, { headers: { Authorization: `Token ${apiKey}` } });
    dgWs = dg;
    dg.on("open", () => {
      dgOpen = true;
      lastAudioAt = Date.now();
      console.log(`[transcribe-ws] Deepgram connected \u2014 model=${model} userId=${userId}`);
      sendToClient(clientWs, { type: "connected" });
      for (const chunk of audioQueue) {
        if (dg.readyState === dg.OPEN) dg.send(chunk);
      }
      audioQueue = [];
      audioQueueBytes = 0;
      startKeepalive();
    });
    dg.on("message", (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (event.type === "SpeechStarted") {
        sendToClient(clientWs, { type: "speech-started", serverTs: Date.now() });
        return;
      }
      if (event.type !== "Results") return;
      const alt = event.channel?.alternatives?.[0];
      if (!alt?.transcript?.trim()) return;
      sendToClient(clientWs, {
        type: event.is_final === true ? "final" : "interim",
        transcript: alt.transcript,
        words: alt.words ?? [],
        confidence: alt.confidence ?? 0,
        serverTs: Date.now()
      });
    });
    dg.on("error", (err) => {
      console.error(`[transcribe-ws] Deepgram WS error \u2014 model=${model} userId=${userId}:`, err.message);
      if (!dgOpen) openDeepgramWs(modelIndex + 1);
    });
    dg.on("close", (code, reason) => {
      console.log(`[transcribe-ws] Deepgram WS closed \u2014 code=${code} reason=${reason.toString()} userId=${userId}`);
      dgWs = null;
      dgOpen = false;
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
      if (clientWs.readyState === clientWs.OPEN && code !== 1e3) {
        clientWs.close(1011, "Deepgram connection lost");
      }
    });
  }
  clientWs.on("message", async (data, isBinary) => {
    if (!authenticated) {
      if (isBinary) {
        sendToClient(clientWs, { type: "error", message: "Authentication required before sending audio" });
        teardown(4001, "Unauthorized");
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        sendToClient(clientWs, { type: "error", message: "Invalid auth message format" });
        teardown(4001, "Invalid auth message");
        return;
      }
      if (msg.type !== "auth" || !msg.token) {
        sendToClient(clientWs, { type: "error", message: 'Expected { type: "auth", token: "..." }' });
        teardown(4001, "Invalid auth message");
        return;
      }
      const id = await verifySupabaseToken(msg.token);
      if (!id) {
        sendToClient(clientWs, { type: "error", message: "Invalid or expired auth token" });
        teardown(4001, "Unauthorized");
        return;
      }
      if (authTimer) {
        clearTimeout(authTimer);
        authTimer = null;
      }
      userId = id;
      authenticated = true;
      console.log(`[transcribe-ws] authenticated \u2014 userId=${userId} ip=${clientIp}`);
      startPingPong();
      openDeepgramWs();
      return;
    }
    if (!isBinary) {
      let reauth;
      try {
        reauth = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (reauth.type === "reauth" && reauth.token) {
        const newId = await verifySupabaseToken(reauth.token);
        if (newId && newId === userId) {
          console.log(`[transcribe-ws] token refreshed \u2014 userId=${userId}`);
        } else {
          console.warn(`[transcribe-ws] reauth failed \u2014 closing \u2014 userId=${userId}`);
          sendToClient(clientWs, { type: "error", message: "Token refresh failed \u2014 please restart the call." });
          teardown(4001, "Reauth failed");
        }
      }
      return;
    }
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length === 0) return;
    lastAudioAt = Date.now();
    if (dgOpen && dgWs !== null && dgWs.readyState === dgWs.OPEN) {
      dgWs.send(buf);
    } else if (audioQueueBytes < MAX_AUDIO_BUFFER_BYTES) {
      audioQueue.push(buf);
      audioQueueBytes += buf.length;
    }
  });
  clientWs.on("close", (code) => {
    console.log(`[transcribe-ws] client closed \u2014 code=${code} userId=${userId ?? "unauthenticated"}`);
    teardown(1e3, "Client disconnected");
  });
  clientWs.on("error", (err) => {
    console.error(`[transcribe-ws] client WS error \u2014 userId=${userId ?? "unauthenticated"}:`, err.message);
    teardown(1001, "Client error");
  });
}

// app/api/health/route.ts
var import_server = require("next/server");
var shuttingDown = false;
function markShuttingDown() {
  shuttingDown = true;
}

// server.ts
function loadEnvLocal() {
  const envPath = ".env.local";
  if (!(0, import_node_fs.existsSync)(envPath)) return;
  for (const raw of (0, import_node_fs.readFileSync)(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();
process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
});
var dev = process.env.NODE_ENV !== "production";
var hostname = process.env.HOSTNAME ?? (dev ? "localhost" : "0.0.0.0");
var port = parseInt(process.env.PORT ?? "3000", 10);
var app = (0, import_next.default)({ dev, hostname, port });
var handle = app.getRequestHandler();
app.prepare().then(() => {
  const httpServer = (0, import_node_http.createServer)((req, res) => {
    const parsedUrl = (0, import_node_url.parse)(req.url, true);
    void handle(req, res, parsedUrl);
  });
  const wss = new import_ws2.WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = (0, import_node_url.parse)(req.url ?? "");
    if (pathname === "/api/transcribe-ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        void handleTranscribeWs(ws, req);
      });
    }
  });
  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port} [${dev ? "development" : "production"}]`);
    console.log("> Deepgram streaming WS endpoint: /api/transcribe-ws");
    if (!dev) {
      console.log("> Health check: GET /api/health");
    }
  });
  const SHUTDOWN_TIMEOUT_MS = 15e3;
  async function gracefulShutdown(signal) {
    console.log(`
[server] received ${signal} \u2014 starting graceful shutdown`);
    markShuttingDown();
    const count = getActiveConnectionCount();
    if (count > 0) {
      console.log(`[server] notifying ${count} active WebSocket client(s)\u2026`);
    }
    closeAllConnections("Server shutting down");
    const forceExit = setTimeout(() => {
      console.error("[server] shutdown timed out \u2014 forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();
    await new Promise((resolve) => {
      httpServer.close((err) => {
        if (err) console.error("[server] httpServer.close error:", err);
        resolve();
      });
    });
    clearTimeout(forceExit);
    console.log("[server] shutdown complete \u2014 exiting");
    process.exit(0);
  }
  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
}).catch((err) => {
  console.error("Failed to start custom server:", err);
  process.exit(1);
});
