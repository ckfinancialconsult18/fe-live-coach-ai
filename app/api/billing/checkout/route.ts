import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireUser } from '@/lib/api/guard';

export type PlanId = 'professional' | 'agency';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key);
}

function getPriceId(planId: PlanId): string {
  const id = planId === 'agency'
    ? process.env.STRIPE_PRICE_ID_AGENCY
    : process.env.STRIPE_PRICE_ID_PROFESSIONAL;
  if (!id) throw new Error(`STRIPE_PRICE_ID_${planId.toUpperCase()} is not configured`);
  return id;
}

export async function POST(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const stripe = getStripe();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const trialDays = parseInt(process.env.STRIPE_TRIAL_DAYS ?? '7', 10);

  const body = await req.json().catch(() => ({})) as { planId?: PlanId; returnPath?: string };
  const planId: PlanId = body.planId === 'agency' ? 'agency' : 'professional';
  const returnPath = body.returnPath ?? '/settings?tab=billing';

  let priceId: string;
  try {
    priceId = getPriceId(planId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Plan not configured' }, { status: 500 });
  }

  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('user_id', user.id)
    .single();

  const existingCustomerId = sub?.stripe_customer_id as string | null;
  const hasActiveOrTrialing = sub?.status === 'active' || sub?.status === 'trialing';

  // If already subscribed, send to portal instead
  if (hasActiveOrTrialing && existingCustomerId) {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: existingCustomerId,
      return_url: `${siteUrl}${returnPath}`,
    });
    return NextResponse.json({ url: portalSession.url });
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDays,
      metadata: { planId },
    },
    success_url: `${siteUrl}/settings?tab=billing&checkout=success`,
    cancel_url: `${siteUrl}${returnPath}`,
    allow_promotion_codes: true,
    metadata: { userId: user.id, planId },
  };

  if (existingCustomerId) {
    sessionParams.customer = existingCustomerId;
  } else {
    sessionParams.customer_email = user.email ?? undefined;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return NextResponse.json({ url: session.url });
}
