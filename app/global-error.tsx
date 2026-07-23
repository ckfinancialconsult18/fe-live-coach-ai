'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="h-full dark">
      <body className="h-full antialiased flex items-center justify-center" style={{ background: '#090d18' }}>
        <div className="text-center space-y-4 px-6">
          <p className="text-4xl">⚠️</p>
          <h1 className="text-xl font-semibold text-slate-100">Something went wrong</h1>
          <p className="text-sm text-slate-500">An unexpected error occurred. Our team has been notified.</p>
          <button
            onClick={reset}
            className="inline-block mt-2 px-5 py-2 rounded-lg text-sm font-medium text-slate-900 transition-colors"
            style={{ background: '#D4AF37' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
