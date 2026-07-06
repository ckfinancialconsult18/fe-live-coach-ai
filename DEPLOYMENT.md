# Deployment Guide — fe-live-coach-ai

This application requires a **persistent Node.js server** (not serverless) because it uses
a custom WebSocket proxy for Deepgram streaming transcription. Vercel is not compatible.

---

## Quick Start — Railway (Recommended)

1. Push this repository to GitHub.
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo.
3. Set environment variables (see below).
4. Railway will detect `railway.toml` and deploy automatically.

---

## Environment Variables

Copy `.env.example` to `.env.local` for local development. In production, set these
in your platform's dashboard — **never commit real values to the repository**.

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI API key for coaching and post-call analysis |
| `DEEPGRAM_API_KEY` | ✅ | Deepgram API key for real-time transcription — **server-side only, never expose to browser** |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL (no path suffix) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key (safe to expose) |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Your public-facing URL (for auth redirect emails) |
| `NODE_ENV` | ✅ | Set to `production` |
| `HOSTNAME` | ✅ | Set to `0.0.0.0` (bind to all interfaces in a container) |
| `PORT` | optional | Server port (default: 3000) |
| `OPENAI_COACH_MODEL` | optional | Override default coaching model (default: `gpt-4.1`) |

---

## Platform Instructions

### Railway

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

Health check: `GET /api/health` — Railway uses this to determine readiness.

---

### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Authenticate and create app
fly auth login
fly launch --no-deploy   # creates fly.toml (already in repo — skip if prompted)

# Set secrets
fly secrets set OPENAI_API_KEY=sk-proj-...
fly secrets set DEEPGRAM_API_KEY=...
fly secrets set NEXT_PUBLIC_SUPABASE_URL=https://...
fly secrets set NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
fly secrets set NEXT_PUBLIC_SITE_URL=https://your-app.fly.dev

# Deploy
fly deploy
```

> **WebSocket note:** With multiple Fly machines, enable session affinity so all WebSocket
> requests from one browser route to the same machine:
> `fly proxy --sticky` (or set `[http_service] sticky = true` in fly.toml).

---

### Render

1. Connect your GitHub repo at [render.com](https://render.com).
2. Select "Web Service" — **not** "Static Site".
3. Render will detect `render.yaml` automatically.
4. Set environment variables in the Render dashboard.
5. **Use a paid plan** (Starter $7/mo minimum) — the free tier has a 15-minute idle
   spin-down that kills active WebSocket connections mid-call.

---

### Docker (any VPS / ECS / GKE)

```bash
# Build
docker build -t fe-live-coach-ai .

# Run
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e HOSTNAME=0.0.0.0 \
  -e OPENAI_API_KEY=sk-proj-... \
  -e DEEPGRAM_API_KEY=... \
  -e NEXT_PUBLIC_SUPABASE_URL=https://... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  -e NEXT_PUBLIC_SITE_URL=https://your-domain.com \
  --name live-coach \
  fe-live-coach-ai
```

The Docker image includes a `HEALTHCHECK` directive that probes `GET /api/health`.

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

At ~500+ concurrent agents, run 2+ instances with sticky-session load balancing:
- **Railway:** Not yet supported natively — use a single large instance or migrate to Fly.io.
- **Fly.io:** Set `[http_service] sticky = true` in `fly.toml`.
- **AWS ALB:** Enable `stickiness.enabled = true` with `lb_cookie` stickiness.
- **nginx:** `ip_hash` upstream directive.

For true horizontal scaling without sticky sessions, move WebSocket state to Redis
Pub/Sub so any instance can proxy audio to the correct Deepgram session.

---

## Security Checklist

Before going to production:

- [ ] Rotate all API keys if they were ever committed to git or shared
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your real production domain
- [ ] Enable Supabase Row Level Security on all tables
- [ ] Set up Supabase auth redirect allowlist to your production domain only
- [ ] Consider adding a WAF (Cloudflare, AWS WAF) in front of the app for DDoS protection
- [ ] Review Deepgram account concurrency limits for your expected agent count
- [ ] Enable OpenAI spend limits / alerts to cap unexpected costs

---

## Health Check

`GET /api/health` returns:

```json
{
  "status": "ok",
  "timestamp": "2026-07-05T12:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

Returns `503` during graceful shutdown so load balancers stop routing before the
process exits.
