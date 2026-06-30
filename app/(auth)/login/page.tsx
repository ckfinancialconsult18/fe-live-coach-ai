'use client';

import { Suspense, useActionState, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, resendVerificationEmail, type AuthFormState } from '../actions';

const initialState: AuthFormState = { error: null };

function ResendVerification() {
  const [state, formAction, pending] = useActionState(resendVerificationEmail, initialState);
  const [sent, setSent] = useState(false);

  if (sent) {
    return <p className="text-[10px] text-green-400 mt-1">Confirmation email resent — check your inbox.</p>;
  }

  return (
    <form
      action={(formData) => { setSent(true); formAction(formData); }}
      className="flex items-center gap-2 mt-2"
    >
      <input
        name="email" type="email" required placeholder="you@agency.com"
        className="h-7 flex-1 bg-white/5 border border-white/8 rounded-lg px-2 text-[10px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
      />
      <button
        type="submit" disabled={pending}
        className="text-[10px] font-semibold text-[#D4AF37] hover:underline shrink-0 disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Resend confirmation'}
      </button>
      {state.error && <span className="text-[10px] text-red-400">{state.error}</span>}
    </form>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const searchParams = useSearchParams();
  const justConfirmed = searchParams.get('confirm') === '1';
  const justReset = searchParams.get('reset') === '1';
  const unconfirmedError = state.error?.toLowerCase().includes('confirm');

  return (
    <div className="glass-card rounded-2xl p-6">
      <h1 className="text-lg font-bold text-slate-100 mb-1">Sign in</h1>
      <p className="text-xs text-slate-500 mb-6">Welcome back — let&apos;s get coaching.</p>

      {justConfirmed && (
        <div className="mb-4 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          <p>Account created — check your email to confirm, then sign in.</p>
          <ResendVerification />
        </div>
      )}
      {justReset && (
        <p className="mb-4 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          Password updated — sign in with your new password.
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Email</label>
          <input
            name="email" type="email" required autoComplete="email"
            className="mt-1 w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
            placeholder="you@agency.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Password</label>
            <Link href="/forgot-password" className="text-[10px] text-[#D4AF37] hover:underline">Forgot password?</Link>
          </div>
          <input
            name="password" type="password" required autoComplete="current-password"
            className="mt-1 w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
            placeholder="••••••••"
          />
        </div>

        {state.error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <p>{state.error}</p>
            {unconfirmedError && <ResendVerification />}
          </div>
        )}

        <button
          type="submit" disabled={pending}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #9a7a0a)', color: '#090d18', boxShadow: '0 4px 16px rgba(212,175,55,0.3)' }}
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-xs text-slate-500 text-center mt-5">
        No account? <Link href="/signup" className="text-[#D4AF37] hover:underline">Create one</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="glass-card rounded-2xl p-6 h-[360px]" />}>
      <LoginForm />
    </Suspense>
  );
}
