'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type AgencyInfo = { id: string; name: string; owner_id: string };

function JoinContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [status, setStatus] = useState<'loading' | 'valid' | 'error' | 'joining' | 'joined'>('loading');
  const [agency, setAgency] = useState<AgencyInfo | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No invite token in URL.'); return; }
    fetch(`/api/agency/invite?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) { setAgency(d.agency); setStatus('valid'); }
        else { setStatus('error'); setMessage(d.error ?? 'Invalid invite'); }
      })
      .catch(() => { setStatus('error'); setMessage('Failed to validate invite.'); });
  }, [token]); // eslint-disable-line react-hooks/set-state-in-effect

  const join = async () => {
    setStatus('joining');
    const res = await fetch('/api/agency/invite', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const d = await res.json();
    if (res.ok) {
      setStatus('joined');
      setTimeout(() => router.push('/agency'), 1500);
    } else {
      setStatus('error');
      setMessage(d.error ?? 'Failed to join agency');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0c1020] to-[#090d18] px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/8 bg-white/3 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)' }}>
          <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
        </div>

        {status === 'loading' && (
          <>
            <div className="w-8 h-8 border-2 border-t-[#D4AF37] border-white/10 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Validating invite&hellip;</p>
          </>
        )}

        {status === 'valid' && agency && (
          <>
            <h2 className="text-xl font-bold text-slate-100 mb-2">You&rsquo;re invited!</h2>
            <p className="text-slate-400 text-sm mb-6">
              You&rsquo;ve been invited to join <span className="text-[#D4AF37] font-semibold">{agency.name}</span> on FE Live Coach AI.
            </p>
            <button
              onClick={join}
              className="w-full py-3 rounded-xl font-semibold text-black"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)' }}
            >
              Join Agency
            </button>
          </>
        )}

        {status === 'joining' && (
          <>
            <div className="w-8 h-8 border-2 border-t-[#D4AF37] border-white/10 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Joining agency&hellip;</p>
          </>
        )}

        {status === 'joined' && (
          <>
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">Welcome to the team!</h2>
            <p className="text-slate-400 text-sm">Redirecting to your agency dashboard&hellip;</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">Invalid Invite</h2>
            <p className="text-slate-400 text-sm mb-6">{message}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-2 rounded-xl border border-white/10 text-slate-300 hover:text-white text-sm"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  );
}
