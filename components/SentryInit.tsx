'use client';

import * as Sentry from '@sentry/nextjs';

// Initialize Sentry once at module evaluation time (client bundle).
// Using module-level init avoids depending on instrumentation-client.ts
// which is not aliased in Next.js 16's Turbopack production build.
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
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
