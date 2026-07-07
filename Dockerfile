# ── Stage 1: install all dependencies (including devDeps for build) ───────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: build Next.js + compile server.ts → server.js ───────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js application (output: standalone)
RUN npm run build

# Compile server.ts and its TypeScript imports into a single server.js.
# --packages=external keeps all node_modules as runtime require() calls.
# --bundle folds in lib/transcribe-ws-server.ts and app/api/health/route.ts.
# No tsx, no on-the-fly transpilation in production.
RUN node_modules/.bin/esbuild server.ts \
      --bundle \
      --platform=node \
      --target=node20 \
      --packages=external \
      --outfile=server.js

# Strip devDependencies (tsx, typescript, eslint, tailwindcss, etc.) from node_modules
# BEFORE copying to the runner stage. tsx must not be present at runtime because
# its main export auto-registers a Node.js ESM hook that hijacks server.js → server.ts.
RUN npm prune --production

# ── Stage 3: minimal production runner ────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# yt-dlp (YouTube downloader) and ffmpeg (audio extraction) for video pipeline
RUN apk add --no-cache ffmpeg python3 py3-pip \
 && pip3 install --break-system-packages yt-dlp

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next.js standalone output (includes its own minimal node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Compiled server entry point (no tsx needed — plain Node.js)
COPY --from=builder --chown=nextjs:nodejs /app/server.js ./server.js

# Runtime node_modules for server.js dependencies (ws, next, @supabase/*, stripe, etc.)
# devDependencies (including tsx) were pruned in the builder stage — not present here.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Plain Node.js — no tsx, no TypeScript runtime overhead
CMD ["node", "server.js"]
