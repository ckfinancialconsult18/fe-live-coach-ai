import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireUser } from '@/lib/api/guard';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key);
}

export async function POST() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const stripe = getStripe();
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  const customerId = sub?.stripe_customer_id as string | null;
  if (!customerId) {
    return NextResponse.json(
      { error: 'No subscription found. Please subscribe first.' },
      { status: 404 },
    );
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/settings?tab=billing`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to open billing portal' }, { status: 500 });
  }
}
