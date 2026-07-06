# Deployment Guide — fe-live-coach-ai

This application requires a **persistent Node.js server** (not serverless) because it uses
a custom WebSocket proxy for Deepgram streaming transcription. Vercel is not compatible.

Deploy to **Railway** — the sole supported target platform.

---

## Quick Start — Railway

1. Push this repository to GitHub.
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo.
3. Set environment variables (see below).
4. Railway will detect `railway.toml` and deploy automatically using the Dockerfile.

---

## Environment Variables

Copy `.env.example` to `.env.local` for local development. In production, set these
in the Railway dashboard — **never commit real values to the repository**.

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI API key for coaching and post-call analysis |
| `DEEPGRAM_API_KEY` | ✅ | Deepgram API key for real-time transcription — **server-side only, never expose to browser** |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL (no path suffix) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key (safe to expose) |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Your public-facing Railway URL (for auth redirect emails) |
| `NODE_ENV` | ✅ | Set to `production` |
| `HOSTNAME` | ✅ | Set to `0.0.0.0` (bind to all interfaces in a container) |
| `PORT` | optional | Server port (default: 3000) |
| `OPENAI_COACH_MODEL` | optional | Override default coaching model (default: `gpt-4.1`) |

---

## Deploying to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Set secrets
railway variables set OPENAI_API_KEY=sk-proj-...
railway variables set DEEPGRAM_API_KEY=...
railway variables set NEXT_PUBLIC_SUPABASE_URL=https://...
railway variables set NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
railway variables set NEXT_PUBLIC_SITE_URL=https://your-domain.up.railway.app
railway variables set NODE_ENV=production
railway variables set HOSTNAME=0.0.0.0

# Deploy
railway up
```

Health check: `GET /api/health` — Railway polls this to determine readiness.

---

## Architecture Notes

### Why a custom server?

Next.js App Router route handlers cannot handle raw WebSocket upgrades. `server.ts`
intercepts HTTP upgrade requests before Next.js sees them, routes `/api/transcribe-ws`
to the Deepgram streaming proxy, and passes everything else to Next.js.

### WebSocket authentication

Tokens are sent as the **first WebSocket message** after connect, not in the URL.
This keeps the Supabase access token out of server access logs and browser history.

### Scaling beyond one instance

At ~500+ concurrent agents, consider vertical scaling first (Railway large instances).
For horizontal scale, sticky sessions are required because WebSocket state is in-process:

- **Railway:** Not yet supported natively — use a single large instance or migrate to a
  platform with sticky-session load balancing (Fly.io with `[http_service] sticky = true`).

For true horizontal scaling without sticky sessions, move WebSocket state to Redis
Pub/Sub so any instance can proxy audio to the correct Deepgram session.

---

## Security Checklist

Before going to production:

- [ ] Rotate all API keys if they were ever committed to git or shared
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your real production domain
- [ ] Enable Supabase Row Level Security on all tables (already done — 27/27 tables)
- [ ] Set up Supabase auth redirect allowlist to your production domain only
- [ ] Consider adding Cloudflare in front of the app for DDoS protection
- [ ] Review Deepgram account concurrency limits for your expected agent count
- [ ] Enable OpenAI spend limits / alerts to cap unexpected costs

---

## Health & Version Endpoints

`GET /api/health` returns:

```json
{
  "status": "ok",
  "timestamp": "2026-07-06T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

Returns `503` during graceful shutdown so Railway stops routing before the process exits.

`GET /api/version` returns:

```json
{
  "version": "1.0.0",
  "node": "v22.0.0",
  "environment": "production"
}
```
