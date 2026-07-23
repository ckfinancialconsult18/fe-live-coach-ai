'use client';

import * as Sentry from '@sentry/nextjs';

// Initialize Sentry once at module evaluation time (client bundle).
// Using module-level init avoids depending on instrumentation-client.ts
// which is not aliased in Next.js 16's Turbopack production build.
// DSN is a public value — safe to hardcode. It was not inlined at build time
// because Railway exposes NEXT_PUBLIC_* vars at runtime, not during next build.
const SENTRY_DSN = 'https://65fdd8f203fd822f6010b4733f018031@o4511785348628480.ingest.us.sentry.io/4511785352626176';

if (typeof window !== 'undefined') {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
    integrations: [
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: false }),
    ],
  });
}

export function SentryInit() {
  return null;
}
