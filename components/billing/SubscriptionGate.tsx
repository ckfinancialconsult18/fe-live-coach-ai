'use client';

import { ReactNode, useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import type { PlanId } from '@/app/api/billing/checkout/route';

interface SubscriptionGateProps {
  children: ReactNode;
  featureName?: string;
  featureDescription?: string;
}

export function SubscriptionGate({
  children,
  featureName = 'This Feature',
  featureDescription = 'Upgrade to access this feature.',
}: SubscriptionGateProps) {
  const { isActive, loading } = useSubscription();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isActive) {
    return <UpgradePrompt featureName={featureName} featureDescription={featureDescription} />;
  }

  return <>{children}</>;
}

const PLANS: { id: PlanId; name: string; price: number; desc: string; features: string[] }[] = [
  {
    id: 'professional',
    name: 'Professional',
    price: 99,
    desc: 'For individual agents',
    features: [
      'Real-time AI coaching during live calls',
      'Deepgram streaming transcription',
      'AI Role Play training with 22 personas',
      'Post-call performance reports',
      'Knowledge base & carrier recommendations',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 249,
    desc: 'For agencies & teams',
    features: [
      'Everything in Professional',
      'Multi-user agency management',
      'Team performance analytics',
      'Priority support',
      'Custom AI coaching personas',
    ],
  },
];

function UpgradePrompt({
  featureName,
  featureDescription,
}: {
  featureName: string;
  featureDescription: string;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('professional');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan, returnPath: '/settings?tab=billing' }),
      });
      const data = await r.json() as { url?: string; error?: string };
      if (!r.ok || !data.url) throw new Error(data.error ?? 'Failed to start checkout');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[500px] p-8">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded-full px-4 py-1.5 text-sm font-medium">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            Premium Feature
          </div>
          <h2 className="text-2xl font-bold text-slate-100">{featureName}</h2>
          <p className="text-slate-400">{featureDescription}</p>
        </div>

        <p className="text-sm text-amber-400 text-center font-medium">
          7-day free trial · No credit card required to start
        </p>

        <div className="grid grid-cols-2 gap-4">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`rounded-2xl p-5 text-left transition-all border-2 ${
                selectedPlan === plan.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/8'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-slate-100">{plan.name}</p>
                  <p className="text-xs text-slate-500">{plan.desc}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-2xl font-bold text-slate-100">${plan.price}</span>
                  <span className="text-xs text-slate-500">/mo</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-xs text-slate-400">
                    <svg className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
              {selectedPlan === plan.id && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-400 font-medium">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  </div>
                  Selected
                </div>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-center">
            {error}
          </p>
        )}

        <button
          onClick={() => void startCheckout()}
          disabled={loading}
          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {loading ? 'Redirecting to checkout…' : `Start 7-Day Free Trial — ${PLANS.find(p => p.id === selectedPlan)?.name}`}
        </button>

        <p className="text-xs text-slate-600 text-center">
          Already subscribed?{' '}
          <a href="/settings?tab=billing" className="text-blue-400 hover:underline">
            Manage your subscription
          </a>
        </p>
      </div>
    </div>
  );
}
