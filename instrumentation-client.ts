import * as Sentry from '@sentry/nextjs';

console.log('[sentry] instrumentation-client loaded, DSN:', process.env.NEXT_PUBLIC_SENTRY_DSN ? 'present' : 'MISSING');

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.0,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: false }),
  ],
});
