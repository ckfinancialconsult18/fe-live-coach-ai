'use client';

import { useState } from 'react';

const PLANS = [
  {
    id: 'professional' as const,
    name: 'Professional',
    price: 49,
    description: 'For individual Final Expense agents',
    features: [
      'Unlimited live AI coaching',
      'Real-time transcript & stage detection',
      'Objection handling suggestions',
      'Post-call reports & scoring',
      'Knowledge base (upload brochures & scripts)',
      'Role play trainer',
      'Carrier guide',
    ],
  },
  {
    id: 'agency' as const,
    name: 'Agency',
    price: 99,
    description: 'For teams & agency managers',
    features: [
      'Everything in Professional',
      'Multi-agent seats',
      'Agency-wide analytics',
      'Team performance dashboard',
      'Priority support',
    ],
    highlighted: true,
  },
];

export default function UpgradePage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(planId: 'professional' | 'agency') {
    setLoading(planId);
    setError(null);
    try {
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, returnPath: '/upgrade' }),
      });
      const d = await r.json() as { url?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error ?? 'Failed to start checkout');
      window.location.href = d.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: '#090d18' }}>

      {/* Logo */}
      <div className="mb-10 text-center">
        <p className="text-xs font-semibold tracking-[0.25em] uppercase mb-2"
          style={{ color: '#D4AF37' }}>FE Live Coach AI</p>
        <h1 className="text-3xl font-bold text-slate-100">Your trial has ended</h1>
        <p className="text-slate-400 mt-2 text-sm max-w-sm mx-auto">
          Subscribe to keep coaching on every call. Cancel anytime.
        </p>
      </div>

      {/* Trial badge */}
      <div className="mb-8 px-4 py-2 rounded-full border text-sm font-medium"
        style={{ borderColor: '#D4AF37', color: '#D4AF37', background: 'rgba(212,175,55,0.08)' }}>
        🎉 7-day free trial included — no charge today
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm max-w-md w-full text-center">
          {error}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="rounded-2xl p-6 border flex flex-col"
            style={{
              background: plan.highlighted ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.03)',
              borderColor: plan.highlighted ? '#D4AF37' : 'rgba(255,255,255,0.08)',
            }}
          >
            {plan.highlighted && (
              <span className="self-start text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-3"
                style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>
                Most Popular
              </span>
            )}

            <p className="text-lg font-bold text-slate-100">{plan.name}</p>
            <p className="text-slate-500 text-xs mt-0.5 mb-4">{plan.description}</p>

            <div className="flex items-end gap-1 mb-5">
              <span className="text-4xl font-extrabold text-slate-100">${plan.price}</span>
              <span className="text-slate-500 text-sm mb-1">/month</span>
            </div>

            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mt-0.5 shrink-0"
                    style={{ color: '#D4AF37' }}>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => void handleCheckout(plan.id)}
              disabled={loading !== null}
              className="w-full h-11 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              style={plan.highlighted
                ? { background: '#D4AF37', color: '#090d18' }
                : { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' }
              }
            >
              {loading === plan.id && (
                <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              )}
              Start 7-Day Free Trial
            </button>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-slate-600 text-center">
        Secure payments by Stripe · Cancel anytime · No hidden fees
      </p>

      {/* Allow access to billing settings */}
      <a href="/settings?tab=billing"
        className="mt-4 text-xs text-slate-600 hover:text-slate-400 transition-colors underline underline-offset-2">
        Already subscribed? Manage billing →
      </a>
    </div>
  );
}
