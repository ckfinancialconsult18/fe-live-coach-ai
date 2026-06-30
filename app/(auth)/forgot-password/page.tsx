'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, type AuthFormState } from '../actions';

const initialState: AuthFormState = { error: null };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="glass-card rounded-2xl p-6">
      <h1 className="text-lg font-bold text-slate-100 mb-1">Reset your password</h1>
      <p className="text-xs text-slate-500 mb-6">We&apos;ll email you a link to set a new password.</p>

      {submitted ? (
        <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          If an account exists for that email, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form
          action={(formData) => { setSubmitted(true); formAction(formData); }}
          className="space-y-4"
        >
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Email</label>
            <input
              name="email" type="email" required autoComplete="email"
              className="mt-1 w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
              placeholder="you@agency.com"
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
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="text-xs text-slate-500 text-center mt-5">
        <Link href="/login" className="text-[#D4AF37] hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
