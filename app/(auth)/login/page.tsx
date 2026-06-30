'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, type AuthFormState } from '../actions';

const initialState: AuthFormState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const searchParams = useSearchParams();
  const justConfirmed = searchParams.get('confirm') === '1';

  return (
    <div className="glass-card rounded-2xl p-6">
      <h1 className="text-lg font-bold text-slate-100 mb-1">Sign in</h1>
      <p className="text-xs text-slate-500 mb-6">Welcome back — let's get coaching.</p>

      {justConfirmed && (
        <p className="mb-4 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          Account created — check your email to confirm, then sign in.
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
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Password</label>
          <input
            name="password" type="password" required autoComplete="current-password"
            className="mt-1 w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
            placeholder="••••••••"
          />
        </div>

        {state.error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{state.error}</p>
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
