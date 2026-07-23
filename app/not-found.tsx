import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="en" className="h-full dark">
      <body className="h-full antialiased flex items-center justify-center" style={{ background: '#090d18' }}>
        <div className="text-center space-y-4 px-6">
          <p className="text-5xl font-bold" style={{ color: '#D4AF37' }}>404</p>
          <h1 className="text-xl font-semibold text-slate-100">Page not found</h1>
          <p className="text-sm text-slate-500">This page doesn&apos;t exist or has been moved.</p>
          <Link
            href="/"
            className="inline-block mt-2 px-5 py-2 rounded-lg text-sm font-medium text-slate-900 transition-colors"
            style={{ background: '#D4AF37' }}
          >
            Go home
          </Link>
        </div>
      </body>
    </html>
  );
}
