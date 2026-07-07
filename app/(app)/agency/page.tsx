'use client';

import { useState, useEffect, useCallback } from 'react';

type AgencyMember = {
  user: { id: string; email: string; full_name: string | null; avatar_url: string | null };
  role: 'owner' | 'agent';
  joinedAt: string;
  stats: {
    callCount: number;
    scoredCalls: number;
    avgScore: number | null;
    closeRate: number | null;
    policies: number;
    strongestStage: string | null;
    weakestStage: string | null;
    trend: 'up' | 'down' | 'flat';
    scoreDots: { date: string; score: number }[];
  };
};

type AgencyData = {
  agency: { id: string; name: string; owner_id: string; created_at: string };
  window: number;
  aggregate: { avgScore: number | null; totalCalls: number; policies: number; closeRate: number | null };
  members: AgencyMember[];
};

type MyAgency = {
  agency: { id: string; name: string; owner_id: string } | null;
  role: 'owner' | 'agent' | null;
};

type InviteResult = { token: string; link: string; expiresAt: string };

const STAGE_LABELS: Record<string, string> = {
  introduction: 'Intro', permission: 'Permission', discovery: 'Discovery',
  existingCoverage: 'Existing Coverage', health: 'Health', budget: 'Budget',
  presentation: 'Presentation', objections: 'Objections', closing: 'Closing',
};

const WINDOWS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span className="text-emerald-400 font-bold">↑</span>;
  if (trend === 'down') return <span className="text-red-400 font-bold">↓</span>;
  return <span className="text-slate-500">→</span>;
}

function Sparkline({ dots }: { dots: { score: number }[] }) {
  if (!dots.length) return <span className="text-slate-600 text-xs">no data</span>;
  const max = Math.max(...dots.map((d) => d.score), 100);
  const min = Math.min(...dots.map((d) => d.score), 0);
  const range = max - min || 1;
  const w = 60, h = 20;
  const pts = dots.map((d, i) => {
    const x = (i / Math.max(dots.length - 1, 1)) * w;
    const y = h - ((d.score - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) return <div className="w-16 h-16 rounded-full border-2 border-white/10 flex items-center justify-center text-slate-500 text-xs">N/A</div>;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#D4AF37' : '#ef4444';
  const r = 24, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

export default function AgencyPage() {
  const [myAgency, setMyAgency] = useState<MyAgency | null>(null);
  const [agencyData, setAgencyData] = useState<AgencyData | null>(null);
  const [window_, setWindow] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadMyAgency = useCallback(async () => {
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    const res = await fetch('/api/agency');
    if (res.ok) {
      const data = await res.json();
      setMyAgency(data);
    } else {
      setError('Failed to load agency data');
    }
    setLoading(false);
  }, []);

  const loadMembers = useCallback(async () => {
    if (!myAgency?.agency || myAgency.role !== 'owner') return;
    const res = await fetch(`/api/agency/members?window=${window_}`);
    if (res.ok) {
      setAgencyData(await res.json());
    }
  }, [myAgency, window_]);

  useEffect(() => {
    loadMyAgency();
  }, [loadMyAgency]); // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    if (myAgency?.role === 'owner') loadMembers();
  }, [myAgency, loadMembers, window_]); // eslint-disable-line react-hooks/set-state-in-effect

  const createAgency = async () => {
    if (!agencyName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/agency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: agencyName.trim() }),
    });
    if (res.ok) {
      await loadMyAgency();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Failed to create agency');
    }
    setCreating(false);
  };

  const generateInvite = async () => {
    setInviting(true);
    const res = await fetch('/api/agency/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      setInvite(await res.json());
    }
    setInviting(false);
  };

  const copyLink = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const removeMember = async (userId: string) => {
    setRemovingId(userId);
    await fetch('/api/agency/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setRemovingId(null);
    loadMembers();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-t-[#D4AF37] border-white/10 rounded-full animate-spin" />
      </div>
    );
  }

  // No agency yet — offer to create one
  if (!myAgency?.agency) {
    return (
      <div className="max-w-lg mx-auto mt-20 px-4">
        <div className="rounded-2xl border border-white/8 bg-white/3 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)' }}>
            <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Create Your Agency</h2>
          <p className="text-slate-400 text-sm mb-6">
            As an agency owner you can invite agents, track their performance, and coach your team.
          </p>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <input
            type="text"
            placeholder="Agency name (e.g. CK Life Group)"
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createAgency()}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#D4AF37]/40 mb-3"
          />
          <button
            onClick={createAgency}
            disabled={creating || !agencyName.trim()}
            className="w-full py-3 rounded-xl font-semibold text-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)' }}
          >
            {creating ? 'Creating…' : 'Create Agency'}
          </button>
        </div>
      </div>
    );
  }

  // Agent view (not owner)
  if (myAgency.role === 'agent') {
    return (
      <div className="max-w-lg mx-auto mt-20 px-4">
        <div className="rounded-2xl border border-white/8 bg-white/3 p-8 text-center">
          <h2 className="text-xl font-bold text-slate-100 mb-2">{myAgency.agency.name}</h2>
          <p className="text-slate-400 text-sm">You are a member of this agency. Your performance is visible to the agency owner.</p>
        </div>
      </div>
    );
  }

  // Owner dashboard
  const agg = agencyData?.aggregate;
  const members = agencyData?.members ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{myAgency.agency.name}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Window selector */}
          <div className="flex rounded-xl overflow-hidden border border-white/8">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => setWindow(w.value)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${window_ === w.value ? 'text-black' : 'text-slate-400 hover:text-slate-200 bg-transparent'}`}
                style={window_ === w.value ? { background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)' } : {}}
              >
                {w.label}
              </button>
            ))}
          </div>
          {/* Invite */}
          <button
            onClick={generateInvite}
            disabled={inviting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {inviting ? 'Generating…' : 'Invite Agent'}
          </button>
        </div>
      </div>

      {/* Invite link banner */}
      {invite && (
        <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-4 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-1">Invite link (expires {new Date(invite.expiresAt).toLocaleDateString()})</p>
            <p className="text-sm text-slate-200 font-mono truncate">{invite.link}</p>
          </div>
          <button
            onClick={copyLink}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button onClick={() => setInvite(null)} className="text-slate-500 hover:text-slate-300 p-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Agency aggregate */}
      {agg && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Avg Score', value: agg.avgScore != null ? `${agg.avgScore}` : '—', suffix: agg.avgScore != null ? '/100' : '' },
            { label: 'Total Calls', value: String(agg.totalCalls), suffix: '' },
            { label: 'Policies', value: String(agg.policies), suffix: '' },
            { label: 'Close Rate', value: agg.closeRate != null ? `${agg.closeRate}%` : '—', suffix: '' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/8 bg-white/3 p-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-slate-100">
                {s.value}<span className="text-sm text-slate-500">{s.suffix}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Member cards */}
      <div className="space-y-3">
        {members.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">No members yet. Invite your first agent above.</p>
        )}
        {members.map((m) => {
          const name = m.user.full_name || m.user.email?.split('@')[0] || 'Unknown';
          const initials = name.split(/[\s.]+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
          return (
            <div key={m.user.id} className="rounded-2xl border border-white/8 bg-white/3 p-5">
              <div className="flex items-start gap-4 flex-wrap">
                {/* Avatar + info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-black shrink-0"
                    style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)' }}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-100 truncate">{name}</p>
                      {m.role === 'owner' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] uppercase tracking-wider shrink-0">Owner</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{m.user.email}</p>
                    <p className="text-xs text-slate-600 mt-0.5">Joined {new Date(m.joinedAt).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-5 flex-wrap">
                  <ScoreRing score={m.stats.avgScore} />
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <TrendIcon trend={m.stats.trend} />
                      <span>{m.stats.callCount} call{m.stats.callCount !== 1 ? 's' : ''}</span>
                      {m.stats.closeRate !== null && (
                        <span className="text-slate-500">· {m.stats.closeRate}% close</span>
                      )}
                    </div>
                    {m.stats.strongestStage && (
                      <p className="text-xs text-slate-500">
                        Best: <span className="text-emerald-400">{STAGE_LABELS[m.stats.strongestStage] ?? m.stats.strongestStage}</span>
                        {m.stats.weakestStage && m.stats.weakestStage !== m.stats.strongestStage && (
                          <> · Weak: <span className="text-red-400">{STAGE_LABELS[m.stats.weakestStage] ?? m.stats.weakestStage}</span></>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Sparkline dots={m.stats.scoreDots} />
                    <p className="text-[10px] text-slate-600">Last {m.stats.scoreDots.length} calls</p>
                  </div>
                </div>

                {/* Remove button (not self) */}
                {m.role !== 'owner' && (
                  <button
                    onClick={() => removeMember(m.user.id)}
                    disabled={removingId === m.user.id}
                    className="ml-auto text-slate-600 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-400/10 disabled:opacity-50"
                    title="Remove member"
                  >
                    {removingId === m.user.id ? (
                      <div className="w-4 h-4 border border-t-red-400 border-white/10 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
