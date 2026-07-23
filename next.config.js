const { withSentryConfig } = require('@sentry/nextjs');

// Allow next/image to serve avatars and logos uploaded to Supabase storage.
// Hostname is derived from the env so it tracks whichever project is configured.
let supabaseHostname;
try {
  supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
} catch {
  supabaseHostname = undefined;
}

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
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
