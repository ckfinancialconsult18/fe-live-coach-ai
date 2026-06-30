'use client';

import type { UnderwritingProfile, CarrierMatch } from '@/lib/types';

interface Props {
  profile: UnderwritingProfile;
  carriers: CarrierMatch[];
}

type BoolField = {
  key: keyof UnderwritingProfile;
  label: string;
};

const BOOL_FIELDS: BoolField[] = [
  { key: 'tobacco',       label: 'Tobacco' },
  { key: 'diabetes',      label: 'Diabetes' },
  { key: 'cancer',        label: 'Cancer' },
  { key: 'copd',          label: 'COPD' },
  { key: 'chf',           label: 'CHF' },
  { key: 'stroke',        label: 'Stroke' },
  { key: 'kidneyDisease', label: 'Kidney Disease' },
  { key: 'oxygen',        label: 'Oxygen' },
  { key: 'walker',        label: 'Walker' },
  { key: 'wheelchair',    label: 'Wheelchair' },
];

export function UnderwritingPanel({ profile, carriers }: Props) {
  const hasAnyData = profile.age || profile.gender || profile.tobacco !== null;

  return (
    <div className="space-y-3 px-4 py-3">
      {/* Underwriting Profile */}
      <div className="glass-card rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Underwriting Profile</p>
          {hasAnyData && (
            <span className="text-[9px] text-[#D4AF37] font-medium">Auto-building</span>
          )}
        </div>

        {/* Demographics */}
        <div className="grid grid-cols-3 gap-1.5">
          <InfoChip label="Age"    value={profile.age} />
          <InfoChip label="Gender" value={profile.gender} />
          <InfoChip label="Weight" value={profile.weight ? `${profile.weight} lbs` : ''} />
          <InfoChip label="Height" value={
            profile.heightFt ? `${profile.heightFt}'${profile.heightIn ?? 0}"` : ''
          } />
        </div>

        {/* Medical conditions */}
        <div className="grid grid-cols-2 gap-1">
          {BOOL_FIELDS.map((f) => (
            <ConditionBadge key={f.key} label={f.label} value={profile[f.key] as boolean | null} />
          ))}
        </div>

        {/* Text fields */}
        {profile.hospitalizations && (
          <TextRow label="Hospitalizations" value={profile.hospitalizations} />
        )}
        {profile.currentMedications && (
          <TextRow label="Medications" value={profile.currentMedications} />
        )}

        {!hasAnyData && (
          <p className="text-[10px] text-slate-600 text-center py-2">
            Health information will appear as the conversation progresses
          </p>
        )}
      </div>

      {/* Carrier Matches */}
      <div className="glass-card rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Possible Products</p>
          <span className="text-[9px] text-slate-600 italic">Not an underwriting decision</span>
        </div>

        {carriers.length === 0 && (
          <p className="text-[10px] text-slate-600 text-center py-2">
            Carrier suggestions appear after health info is captured
          </p>
        )}

        {carriers.map((c) => (
          <div key={c.name} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/4 border border-white/6">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{c.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{c.product}</p>
              {c.notes && <p className="text-[9px] text-slate-600 truncate mt-0.5">{c.notes}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold" style={{ color: confidenceColor(c.confidence) }}>
                {c.confidence}%
              </p>
              <p className="text-[9px] text-slate-600">match</p>
            </div>
          </div>
        ))}

        <p className="text-[9px] text-slate-600 text-center italic pt-1">
          Suggestions only — not a guarantee of approval
        </p>
      </div>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5 bg-white/4 border border-white/6">
      <p className="text-[9px] text-slate-600">{label}</p>
      <p className="text-xs font-semibold text-slate-200 truncate">{value || '—'}</p>
    </div>
  );
}

function ConditionBadge({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
      value === true
        ? 'bg-red-500/8 border-red-500/20'
        : value === false
        ? 'bg-green-500/8 border-green-500/20'
        : 'bg-white/3 border-white/5'
    }`}>
      <span className="text-[10px]">
        {value === true ? '⚠️' : value === false ? '✓' : '·'}
      </span>
      <span className={`text-[10px] font-medium ${
        value === true ? 'text-red-400' : value === false ? 'text-green-400' : 'text-slate-600'
      }`}>
        {label}
      </span>
    </div>
  );
}

function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-white/4 border border-white/6">
      <p className="text-[9px] text-slate-600">{label}</p>
      <p className="text-[10px] text-slate-300 mt-0.5 leading-relaxed">{value}</p>
    </div>
  );
}

function confidenceColor(pct: number) {
  if (pct >= 75) return '#22c55e';
  if (pct >= 50) return '#D4AF37';
  return '#f59e0b';
}
