const { withSentryConfig } = require('@sentry/nextjs');

// Allow next/image to serve avatars and logos uploaded to Supabase storage.
// Hostname is derived from the env so it tracks whichever project is configured.
let supabaseHostname;
try {
  supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
} catch {
  supabaseHostname = undefined;
}

// Deepgram and OpenAI Realtime are proxied through the server — no direct
// browser connections needed. Only 'self' required for WebSockets.
const CSP = [
  "default-src 'self'",
  // Next.js requires unsafe-inline for App Router script injection (no nonce middleware).
  // unsafe-eval is required by Turbopack in production.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  // next/font/google self-hosts fonts — no external font CDN needed.
  "font-src 'self' data:",
  // Supabase storage for user avatars; blob: for audio recording previews.
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
  // API calls and WebSocket proxy (all browser WS goes to same origin via server.ts).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://o4511785348628480.ingest.us.sentry.io",
  // Stripe Checkout / 3DS iframes.
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  // MediaRecorder produces blob: URLs; service workers need worker-src.
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: CSP },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles server files into .next/standalone for Docker.
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  // Prevent Next.js from bundling these Node-only packages into the Edge runtime
  serverExternalPackages: ['openai', 'mammoth', 'pdf-parse'],
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Suppress source map upload when DSN is not configured (local dev).
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableLogger: true,
  // Don't auto-instrument — keep bundle size down; we call Sentry.captureException manually.
  autoInstrumentServerFunctions: false,
});
