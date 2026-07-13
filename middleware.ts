import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Pages that never get paywalled
const PAYWALL_EXEMPT_PREFIXES = [
  '/upgrade',
  '/settings',
  '/api/',
  '/_next/',
  '/favicon',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/',
];

function isPaywallExempt(pathname: string) {
  return PAYWALL_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  // Auth session refresh (also handles unauthenticated redirects)
  const authResponse = await updateSession(request);

  // If updateSession already redirected (e.g. to /login), honour it
  if (authResponse.status === 302 || authResponse.status === 307) return authResponse;

  // Skip paywall check for exempt paths
  if (isPaywallExempt(request.nextUrl.pathname)) return authResponse;

  // Build a Supabase client using the refreshed cookies from authResponse
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return authResponse; // updateSession already handles this

  // Check beta access first (bypasses Stripe entirely)
  const { data: userData } = await supabase
    .from('users')
    .select('beta_access')
    .eq('id', user.id)
    .single();

  if (userData?.beta_access) return authResponse;

  // Check subscription status
  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .single();

  const status = sub?.status as string | undefined;
  const isActive = status === 'active' || status === 'trialing';

  if (!isActive) {
    const url = request.nextUrl.clone();
    url.pathname = '/upgrade';
    return NextResponse.redirect(url);
  }

  return authResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
