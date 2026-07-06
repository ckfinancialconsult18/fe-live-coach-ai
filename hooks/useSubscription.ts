'use client';

import { useState, useEffect } from 'react';
import type { BillingStatusResponse, SubscriptionStatus, PlanName } from '@/app/api/billing/status/route';

export type { SubscriptionStatus, PlanName };

export interface UseSubscriptionReturn {
  status: SubscriptionStatus;
  planName: PlanName;
  isActive: boolean;
  loading: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  hasCustomer: boolean;
  refetch: () => void;
}

// Module-level cache: avoids multiple simultaneous fetches when several components
// use useSubscription on the same page.
let cachedResult: BillingStatusResponse | null = null;
let cacheTs = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export function useSubscription(): UseSubscriptionReturn {
  const [data, setData] = useState<BillingStatusResponse | null>(cachedResult);
  const [loading, setLoading] = useState(cachedResult === null);

  function fetchStatus() {
    setLoading(true);
    fetch('/api/billing/status')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<BillingStatusResponse>;
      })
      .then((result) => {
        cachedResult = result;
        cacheTs = Date.now();
        setData(result);
      })
      .catch(() => {
        setData({
          status: 'none',
          planName: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          hasCustomer: false,
        });
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (cachedResult && Date.now() - cacheTs < CACHE_TTL_MS) return;
    fetchStatus(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const status = data?.status ?? 'none';
  const isActive = status === 'active' || status === 'trialing';

  return {
    status,
    planName: data?.planName ?? null,
    isActive,
    loading,
    trialEndsAt: data?.trialEndsAt ? new Date(data.trialEndsAt) : null,
    currentPeriodEnd: data?.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null,
    cancelAtPeriodEnd: data?.cancelAtPeriodEnd ?? false,
    canceledAt: data?.canceledAt ? new Date(data.canceledAt) : null,
    hasCustomer: data?.hasCustomer ?? false,
    refetch: () => { cachedResult = null; fetchStatus(); },
  };
}
