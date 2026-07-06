import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

// Stripe sends the raw body — do NOT let Next.js parse it.
// App Router gives us access to the raw stream via req.text().

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key);
}

function periodEnd(subscription: Stripe.Subscription): string {
  const ts = subscription.items.data[0]?.current_period_end ?? subscription.billing_cycle_anchor;
  return new Date(ts * 1000).toISOString();
}

function resolvePlanName(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_AGENCY) return 'agency';
  if (priceId === process.env.STRIPE_PRICE_ID_PROFESSIONAL) return 'professional';
  // Fallback: treat any configured price as professional
  return 'professional';
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[billing/webhook] signature verification failed:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error('[billing/webhook] admin client unavailable:', err);
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    await handleEvent(stripe, supabase, event);
  } catch (err) {
    console.error(`[billing/webhook] handler error for ${event.type}:`, err);
    // Return 200 so Stripe doesn't retry indefinitely on logic errors
    return NextResponse.json({ received: true, warning: 'Handler error — check server logs' });
  }

  return NextResponse.json({ received: true });
}

async function upsertSubscription(
  supabase: any,
  userId: string,
  fields: Record<string, unknown>,
) {
  await supabase.from('subscriptions').upsert(
    { user_id: userId, ...fields, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

async function handleEvent(
  stripe: Stripe,
  supabase: any,
  event: Stripe.Event,
) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') break;

      const userId = session.metadata?.userId;
      if (!userId) {
        console.error('[billing/webhook] checkout.session.completed: missing userId in metadata');
        break;
      }

      const subscriptionId = session.subscription as string;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id ?? null;

      await upsertSubscription(supabase, userId, {
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscriptionId,
        status: subscription.status,
        plan_name: resolvePlanName(priceId),
        price_id: priceId,
        trial_ends_at: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        current_period_end: periodEnd(subscription),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: null,
      });
      console.log(`[billing/webhook] checkout complete — userId=${userId} status=${subscription.status}`);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', subscription.customer as string)
        .single();

      if (!sub?.user_id) {
        console.warn('[billing/webhook] subscription.updated: no matching user for customer', subscription.customer);
        break;
      }

      const priceId = subscription.items.data[0]?.price.id ?? null;

      await upsertSubscription(supabase, sub.user_id as string, {
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        plan_name: resolvePlanName(priceId),
        price_id: priceId,
        trial_ends_at: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        current_period_end: periodEnd(subscription),
        cancel_at_period_end: subscription.cancel_at_period_end,
      });
      console.log(`[billing/webhook] subscription updated — userId=${sub.user_id} status=${subscription.status}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', subscription.customer as string)
        .single();

      if (!sub?.user_id) break;

      await upsertSubscription(supabase, sub.user_id as string, {
        status: 'canceled',
        cancel_at_period_end: false,
        canceled_at: new Date().toISOString(),
      });
      console.log(`[billing/webhook] subscription canceled — userId=${sub.user_id}`);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceSubId = invoice.parent?.subscription_details?.subscription;
      if (!invoiceSubId) break;
      const subIdStr = typeof invoiceSubId === 'string' ? invoiceSubId : invoiceSubId.id;

      const subscription = await stripe.subscriptions.retrieve(subIdStr);
      const priceId = subscription.items.data[0]?.price.id ?? null;

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', invoice.customer as string)
        .single();

      if (!sub?.user_id) break;

      await upsertSubscription(supabase, sub.user_id as string, {
        status: subscription.status,
        plan_name: resolvePlanName(priceId),
        current_period_end: periodEnd(subscription),
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', invoice.customer as string)
        .single();

      if (!sub?.user_id) break;

      await upsertSubscription(supabase, sub.user_id as string, { status: 'past_due' });
      console.warn(`[billing/webhook] payment failed — userId=${sub.user_id}`);
      break;
    }

    default:
      break;
  }
}
