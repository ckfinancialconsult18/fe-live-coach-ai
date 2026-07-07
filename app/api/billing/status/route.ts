import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';

export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
export type PlanName = 'professional' | 'agency' | null;

export interface BillingStatusResponse {
  status: SubscriptionStatus;
  planName: PlanName;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  hasCustomer: boolean;
}

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  // Check beta access first — bypasses Stripe entirely
  const { data: userData } = await (supabase as any)
    .from('users')
    .select('beta_access')
    .eq('id', user.id)
    .single();

  if (userData?.beta_access) {
    return NextResponse.json({
      status: 'trialing',
      planName: 'professional',
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      hasCustomer: false,
    } satisfies BillingStatusResponse);
  }

  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('status, plan_name, trial_ends_at, current_period_end, cancel_at_period_end, canceled_at, stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  const result: BillingStatusResponse = {
    status: (sub?.status as SubscriptionStatus) ?? 'none',
    planName: (sub?.plan_name as PlanName) ?? null,
    trialEndsAt: sub?.trial_ends_at ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    canceledAt: sub?.canceled_at ?? null,
    hasCustomer: !!sub?.stripe_customer_id,
  };

  return NextResponse.json(result);
}
