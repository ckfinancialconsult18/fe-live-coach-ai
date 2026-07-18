'use client';

import { useState, useMemo } from 'react';
import type {
  EnhancedCarrierMatch,
  UnderwritingProfile,
  MissingUnderwritingQuestion,
  ApprovalLikelihood,
} from '@/lib/types';
import { matchCarriersEnhanced, getMissingUWQuestions } from '@/lib/carrier-rules';

interface PortalEntry { portal_url: string; portal_username?: string }

interface Props {
  carriers: EnhancedCarrierMatch[];
  underwriting: UnderwritingProfile;
  carrierPortals?: Record<string, PortalEntry>;
}

// ── Approval config ───────────────────────────────────────────────────────────
const APPROVAL_CONFIG: Record<ApprovalLikelihood, { label: string; color: string; bg: string; border: string }> = {
  very_high: { label: 'Very High',  color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)' },
  high:      { label: 'High',       color: '#D4AF37', bg: 'rgba(212,175,55,0.1)',  border: 'rgba(212,175,55,0.3)' },
  moderate:  { label: 'Moderate',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)' },
  low:       { label: 'Low',        color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.3)' },
  decline:   { label: 'Likely Decline', color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
};

const PRIORITY_CONFIG = {
  critical: { color: '#f87171', label: 'Critical' },
  high:     { color: '#fb923c', label: 'High' },
  normal:   { color: '#94a3b8', label: 'Normal' },
};

function fitColor(fit: number): string {
  if (fit >= 80) return '#4ade80';
  if (fit >= 60) return '#D4AF37';
  if (fit >= 35) return '#fb923c';
  return '#f87171';
}

function ProfileBadge({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined ? '#94a3b8' : positive ? '#4ade80' : '#f87171';
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold"
      style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}>
      {label}: {value}
    </div>
  );
}

// ── What If panel ─────────────────────────────────────────────────────────────
const WHAT_IF_FIELDS: { field: keyof UnderwritingProfile; label: string }[] = [
  { field: 'tobacco',       label: 'Tobacco' },
  { field: 'diabetes',      label: 'Diabetes' },
  { field: 'cancer',        label: 'Cancer' },
  { field: 'copd',          label: 'COPD' },
  { field: 'chf',           label: 'CHF / Heart Failure' },
  { field: 'stroke',        label: 'Stroke' },
  { field: 'heartAttack',   label: 'Heart Attack' },
  { field: 'kidneyDisease', label: 'Kidney Disease' },
  { field: 'dialysis',      label: 'Dialysis' },
  { field: 'oxygen',        label: 'Oxygen Use' },
  { field: 'walker',        label: 'Walker / Aid' },
  { field: 'wheelchair',    label: 'Wheelchair' },
  { field: 'dui',           label: 'DUI / DWI' },
  { field: 'felony',        label: 'Felony' },
  { field: 'bankruptcy',    label: 'Bankruptcy' },
  { field: 'veteran',       label: 'Veteran' },
];

interface WhatIfPanelProps {
  baseProfile: UnderwritingProfile;
}

function WhatIfPanel({ baseProfile }: WhatIfPanelProps) {
  const [overrides, setOverrides] = useState<Partial<UnderwritingProfile>>({});

  const whatIfProfile = useMemo((): UnderwritingProfile => ({
    ...baseProfile,
    ...overrides,
  }), [baseProfile, overrides]);

  const whatIfCarriers = useMemo(
    () => matchCarriersEnhanced(whatIfProfile).slice(0, 3),
    [whatIfProfile],
  );

  function toggle(field: keyof UnderwritingProfile, current: boolean | null | undefined) {
    setOverrides(prev => ({
      ...prev,
      [field]: !current,
    }));
  }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">⚗ What If Simulator</p>
        <button onClick={() => setOverrides({})}
          className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors">
          Reset
        </button>
      </div>
      <div className="px-3 py-2 flex flex-wrap gap-1.5">
        {WHAT_IF_FIELDS.map(({ field, label }) => {
          const base = baseProfile[field] as boolean | null | undefined;
          const current = (overrides[field] as boolean | null | undefined) ?? base;
          const isOverridden = field in overrides;
          return (
            <button key={field}
              onClick={() => toggle(field, current)}
              className="px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all"
              style={{
                background: current ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${current ? 'rgba(239,68,68,0.4)' : isOverridden ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: current ? '#f87171' : isOverridden ? '#a5b4fc' : '#64748b',
              }}>
              {label}{current ? ' ✓' : ''}
            </button>
          );
        })}
      </div>

      {Object.keys(overrides).length > 0 && (
        <div className="px-3 pb-3">
          <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5">Re-ranked Results</p>
          <div className="space-y-1.5">
            {whatIfCarriers.map((c, i) => {
              const ac = APPROVAL_CONFIG[c.approvalLikelihood];
              const fc = fitColor(c.fitPct);
              return (
                <div key={c.name} className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-[9px] text-slate-600 w-3 text-center font-bold">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-slate-200 truncate">{c.name}</p>
                    <p className="text-[9px] text-slate-500 truncate">{c.product}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-bold" style={{ color: fc }}>{c.fitPct}%</span>
                    <span className="text-[8px] font-semibold px-1 py-0.5 rounded"
                      style={{ background: ac.bg, color: ac.color, border: `1px solid ${ac.border}` }}>
                      {ac.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function LiveCarrierPanel({ carriers, underwriting, carrierPortals = {} }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAllQuestions, setShowAllQuestions] = useState(false);

  const top3 = carriers.slice(0, 3);
  const missingQuestions: MissingUnderwritingQuestion[] = useMemo(
    () => getMissingUWQuestions(underwriting),
    [underwriting],
  );

  const criticalMissing = missingQuestions.filter(q => q.priority === 'critical');
  const shownQuestions = showAllQuestions ? missingQuestions : missingQuestions.slice(0, 4);

  const bmi = (() => {
    const ft = parseInt(underwriting.heightFt ?? '');
    const inVal = parseInt(underwriting.heightIn ?? '0');
    const lbs = parseInt(underwriting.weight ?? '');
    if (isNaN(ft) || isNaN(lbs) || ft === 0) return null;
    const totalIn = ft * 12 + (isNaN(inVal) ? 0 : inVal);
    return Math.round((lbs / (totalIn * totalIn)) * 703);
  })();

  const hasProfile = !!underwriting.age;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center text-xs"
            style={{ background: 'rgba(212,175,55,0.15)' }}>
            🏥
          </div>
          <h2 className="text-sm font-semibold text-slate-200">Carrier Engine</h2>
          {criticalMissing.length > 0 && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              {criticalMissing.length} missing
            </span>
          )}
        </div>
        <span className="text-[9px] text-slate-600">{carriers.length} carriers scored</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">

        {/* UW Profile summary */}
        {hasProfile && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5">Profile Snapshot</p>
            <div className="flex flex-wrap gap-1">
              {underwriting.age && <ProfileBadge label="Age" value={underwriting.age} />}
              {underwriting.gender && <ProfileBadge label="Gender" value={underwriting.gender} />}
              {bmi !== null && <ProfileBadge label="BMI" value={String(bmi)} positive={bmi <= 35} />}
              {underwriting.tobacco === true && <ProfileBadge label="Tobacco" value="Yes" positive={false} />}
              {underwriting.tobacco === false && <ProfileBadge label="Tobacco" value="No" positive={true} />}
              {underwriting.diabetes === true && <ProfileBadge label="Diabetes" value="Yes" positive={false} />}
              {underwriting.copd === true && <ProfileBadge label="COPD" value="Yes" positive={false} />}
              {underwriting.chf === true && <ProfileBadge label="CHF" value="Yes" positive={false} />}
              {underwriting.oxygen === true && <ProfileBadge label="Oxygen" value="Yes" positive={false} />}
              {underwriting.heartAttack === true && <ProfileBadge label="Heart Attack" value="Yes" positive={false} />}
              {underwriting.dialysis === true && <ProfileBadge label="Dialysis" value="Yes" positive={false} />}
              {underwriting.walker === true && <ProfileBadge label="Walker" value="Yes" positive={false} />}
              {underwriting.veteran === true && <ProfileBadge label="Veteran" value="Yes" positive={true} />}
            </div>
          </div>
        )}

        {/* Missing UW questions */}
        {missingQuestions.length > 0 && (
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.2)' }}>
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-[9px] font-bold text-orange-400 uppercase tracking-wider">
                ❓ Ask These Questions ({missingQuestions.length} remaining)
              </p>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {shownQuestions.map(q => {
                const pc = PRIORITY_CONFIG[q.priority];
                return (
                  <div key={q.field} className="flex items-start gap-2">
                    <span className="text-[8px] font-bold shrink-0 mt-px" style={{ color: pc.color }}>
                      {pc.label.toUpperCase()}
                    </span>
                    <p className="text-[10px] text-slate-300 leading-snug">{q.question}</p>
                  </div>
                );
              })}
              {missingQuestions.length > 4 && (
                <button onClick={() => setShowAllQuestions(v => !v)}
                  className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors pt-0.5">
                  {showAllQuestions ? '▲ Show fewer' : `▼ Show ${missingQuestions.length - 4} more`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* No profile yet */}
        {!hasProfile && (
          <div className="rounded-xl border border-slate-800 bg-white/2 px-3 py-4 text-center">
            <p className="text-[11px] text-slate-500">No underwriting data yet.</p>
            <p className="text-[10px] text-slate-700 mt-1">Ask health and demographic questions to unlock carrier recommendations.</p>
          </div>
        )}

        {/* Top 3 carrier cards */}
        {top3.length > 0 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5">
              Top Carriers ({carriers.length} ranked)
            </p>
            <div className="space-y-2">
              {top3.map((c, i) => {
                const ac = APPROVAL_CONFIG[c.approvalLikelihood];
                const fc = fitColor(c.fitPct);
                const isOpen = expandedIdx === i;
                return (
                  <div key={c.name} className="rounded-xl overflow-hidden transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${i === 0 ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.07)'}` }}>

                    {/* Open Portal button — shown above the card header when a portal URL is saved */}
                    {carrierPortals[c.name]?.portal_url && (
                      <div className="px-3 pt-2.5 pb-0">
                        <a
                          href={carrierPortals[c.name].portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[11px] font-bold transition-all hover:opacity-90"
                          style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.35)', color: '#D4AF37' }}
                          title={carrierPortals[c.name].portal_username ? `Username: ${carrierPortals[c.name].portal_username}` : undefined}
                        >
                          🔑 Open Portal
                          {carrierPortals[c.name].portal_username && (
                            <span className="text-[10px] font-normal opacity-70 truncate max-w-[120px]">
                              — {carrierPortals[c.name].portal_username}
                            </span>
                          )}
                        </a>
                      </div>
                    )}

                    {/* Card header */}
                    <button
                      onClick={() => setExpandedIdx(isOpen ? null : i)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/3 transition-colors">
                      {/* Rank */}
                      <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-extrabold"
                        style={{ background: i === 0 ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.05)', color: i === 0 ? '#D4AF37' : '#475569' }}>
                        {i + 1}
                      </div>

                      {/* Name + product */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] font-bold text-slate-200 truncate">{c.name}</p>
                          {i === 0 && <span className="text-[8px] font-bold text-[#D4AF37] shrink-0">★ BEST FIT</span>}
                        </div>
                        <p className="text-[9px] text-slate-500 truncate">{c.product}</p>
                      </div>

                      {/* Fit % + approval */}
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-[13px] font-extrabold" style={{ color: fc }}>{c.fitPct}%</span>
                        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: ac.bg, color: ac.color, border: `1px solid ${ac.border}` }}>
                          {ac.label}
                        </span>
                      </div>

                      <span className="text-[9px] text-slate-700 ml-1">{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {/* Fit bar */}
                    <div className="px-3 pb-1">
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${c.fitPct}%`,
                          background: fc,
                          transition: 'width 0.7s ease',
                        }} />
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2.5 border-t border-white/5 pt-2.5">
                        {/* Reasons */}
                        {c.reasons.length > 0 && (
                          <div>
                            <p className="text-[8px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Why This Carrier</p>
                            <div className="space-y-0.5">
                              {c.reasons.map((r, ri) => (
                                <div key={ri} className="flex items-start gap-1.5">
                                  <span className="text-[9px] text-emerald-500 shrink-0 mt-px">✓</span>
                                  <p className="text-[10px] text-slate-300 leading-snug">{r}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Concerns */}
                        {c.concerns.length > 0 && (
                          <div>
                            <p className="text-[8px] font-bold text-orange-400 uppercase tracking-wider mb-1">Watch Out For</p>
                            <div className="space-y-0.5">
                              {c.concerns.map((r, ri) => (
                                <div key={ri} className="flex items-start gap-1.5">
                                  <span className="text-[9px] text-orange-500 shrink-0 mt-px">⚠</span>
                                  <p className="text-[10px] text-slate-300 leading-snug">{r}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Missing for decision */}
                        {c.missingForDecision.length > 0 && (
                          <div>
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Need to Know</p>
                            <div className="flex flex-wrap gap-1">
                              {c.missingForDecision.map((m, mi) => (
                                <span key={mi} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-500">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* What If panel */}
        {hasProfile && <WhatIfPanel baseProfile={underwriting} />}

        <p className="text-[9px] text-slate-700 text-center pt-1 border-t border-white/5 leading-relaxed">
          Rankings update live as UW profile fills in.<br/>
          General guidelines only — not a guarantee of approval.
        </p>
      </div>
    </div>
  );
}
