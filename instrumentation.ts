import * as Sentry from '@sentry/nextjs';

export async function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
