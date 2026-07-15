'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CARRIERS } from '@/lib/carrier-rules';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useSubscription } from '@/hooks/useSubscription';
import type { PlanId } from '@/app/api/billing/checkout/route';

// ── Types ─────────────────────────────────────────────────────────────────────

type SettingsTab = 'profile' | 'agency' | 'ai' | 'coaching' | 'billing';

interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  licenseNumber: string;
  defaultState: string;
  bio: string;
}

interface AgencyForm {
  agencyName: string;
  agencyPhone: string;
  agencyEmail: string;
  agencyWebsite: string;
  agencyTaxId: string;
  agencyAddress: string;
  agencyCity: string;
  agencyState: string;
}

interface AiPreferences {
  coaching_style: 'supportive' | 'direct' | 'balanced';
  response_detail: 'concise' | 'detailed';
  auto_suggestions: boolean;
  focus_objections: boolean;
  focus_closing: boolean;
  focus_rapport: boolean;
  focus_needs_assessment: boolean;
  focus_product_knowledge: boolean;
  /** Carriers the agent is appointed/contracted with. Empty = show all. */
  appointed_carriers: string[];
}

interface CoachingPreferences {
  real_time_tips: boolean;
  post_call_summary: boolean;
  silence_alerts: boolean;
  filler_word_tracking: boolean;
  objection_alerts: boolean;
  talk_ratio_target: number;
}

const DEFAULT_AI_PREFS: AiPreferences = {
  coaching_style: 'balanced',
  response_detail: 'concise',
  auto_suggestions: true,
  focus_objections: true,
  focus_closing: true,
  focus_rapport: false,
  focus_needs_assessment: false,
  focus_product_knowledge: false,
  appointed_carriers: [],
};

const DEFAULT_COACHING_PREFS: CoachingPreferences = {
  real_time_tips: true,
  post_call_summary: true,
  silence_alerts: true,
  filler_word_tracking: true,
  objection_alerts: true,
  talk_ratio_target: 40,
};

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

const tabs: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'profile',       label: 'Profile',       icon: '👤' },
  { id: 'agency',        label: 'Agency',         icon: '🏢' },
  { id: 'ai',           label: 'AI Settings',    icon: '🤖' },
  { id: 'coaching',     label: 'Coaching',       icon: '🎯' },
  { id: 'billing',       label: 'Billing',        icon: '💳' },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Read ?tab= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as SettingsTab | null;
    if (tab && tabs.some((t) => t.id === tab)) setActiveTab(tab); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex gap-1 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile'       && <ProfileTab />}
      {activeTab === 'agency'        && <AgencyTab />}
      {activeTab === 'ai'            && <AiPreferencesTab />}
      {activeTab === 'coaching'      && <CoachingPreferencesTab />}
      {activeTab === 'billing'       && <BillingTab />}
    </div>
  );
}

// ── Shared save state helpers ─────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useSaveState() {
  const [state, setState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (fn: () => Promise<void>) => {
    setState('saving');
    setErrorMsg(null);
    try {
      await fn();
      setState('saved');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setState('idle'), 3000);
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save');
    }
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { state, errorMsg, save };
}

async function patchMe(body: Record<string, unknown>) {
  const r = await fetch('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({})) as { error?: string };
    throw new Error(d.error ?? 'Save failed');
  }
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function AvatarUpload({ currentUrl, label, bucket, pathPrefix, onUploaded }: {
  currentUrl: string | null;
  label: string;
  bucket: string;
  pathPrefix: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setPreview(currentUrl); }, [currentUrl]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Max 5 MB'); return; }
    setError(null);
    setUploading(true);
    try {
      const res = await fetch(`/api/upload/avatar?bucket=${bucket}&path=${pathPrefix}/${file.name}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Upload failed');
      setPreview(d.url);
      onUploaded(d.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative group w-24 h-24 rounded-2xl overflow-hidden border-2 border-white/10 hover:border-[#D4AF37]/50 transition-colors"
        style={{ background: preview ? 'transparent' : 'linear-gradient(135deg,#1e293b,#0f172a)' }}
      >
        {preview
          ? <img src={preview} alt={label} className="w-full h-full object-cover" />
          : <span className="text-3xl text-slate-500">+</span>
        }
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-xs text-white font-semibold">{uploading ? 'Uploading…' : 'Change'}</span>
        </div>
      </button>
      <p className="text-[11px] text-slate-500">{label}</p>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function ProfileTab() {
  const [form, setForm] = useState<ProfileForm>({
    firstName: '', lastName: '', phone: '', licenseNumber: '', defaultState: '', bio: '',
  });
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { state, errorMsg, save } = useSaveState();

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d: { user?: { id?: string; fullName?: string; email?: string; phone?: string; licenseNumber?: string; defaultState?: string; bio?: string; avatarUrl?: string; agencyLogoUrl?: string } }) => {
        const u = d.user ?? {};
        const parts = (u.fullName ?? '').trim().split(' ');
        setForm({
          firstName:     parts[0] ?? '',
          lastName:      parts.slice(1).join(' '),
          phone:         u.phone ?? '',
          licenseNumber: u.licenseNumber ?? '',
          defaultState:  u.defaultState ?? '',
          bio:           u.bio ?? '',
        });
        setEmail(u.email ?? '');
        setUserId(u.id ?? '');
        setAvatarUrl(u.avatarUrl ?? null);
        setAgencyLogoUrl(u.agencyLogoUrl ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(key: keyof ProfileForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSave() {
    await save(async () => {
      await patchMe({
        fullName:      `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone:         form.phone,
        licenseNumber: form.licenseNumber,
        defaultState:  form.defaultState,
        bio:           form.bio,
        avatarUrl,
        agencyLogoUrl,
      });
    });
  }

  if (loading) return <LoadingSkeleton />;

  const displayName = `${form.firstName} ${form.lastName}`.trim() || 'Your Profile';

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Profile Settings</h2>

      {/* Photo uploads */}
      <div className="flex items-start gap-8">
        <AvatarUpload
          currentUrl={avatarUrl}
          label="Profile photo"
          bucket="avatars"
          pathPrefix={userId}
          onUploaded={(url) => setAvatarUrl(url)}
        />
        <AvatarUpload
          currentUrl={agencyLogoUrl}
          label="Agency logo"
          bucket="avatars"
          pathPrefix={userId}
          onUploaded={(url) => setAgencyLogoUrl(url)}
        />
        <div className="pt-1">
          <p className="font-semibold text-slate-200">{displayName}</p>
          <p className="text-sm text-slate-500">{email}</p>
          <p className="text-xs text-slate-600 mt-2">Click either image to upload.<br />Max 5 MB · JPG, PNG, or WebP.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="First Name" value={form.firstName} onChange={set('firstName')} placeholder="First name" />
        <Input label="Last Name"  value={form.lastName}  onChange={set('lastName')}  placeholder="Last name" />
        <Input label="Email" type="email" value={email} disabled placeholder="you@agency.com"
          className="opacity-60 cursor-not-allowed" />
        <Input label="Phone" value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" />
        <Input label="License Number" value={form.licenseNumber} onChange={set('licenseNumber')} placeholder="State license number" />
        <Select label="Default State" value={form.defaultState} onChange={set('defaultState')}>
          <option value="">Select a state…</option>
          {US_STATES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>
      <Textarea label="Bio" rows={3} value={form.bio} onChange={set('bio')}
        placeholder="Life insurance agent specializing in Final Expense…" />
      <SaveBar state={state} errorMsg={errorMsg} onSave={() => void handleSave()} />
    </div>
  );
}

// ── Agency Tab ────────────────────────────────────────────────────────────────

function AgencyTab() {
  const [form, setForm] = useState<AgencyForm>({
    agencyName: '', agencyPhone: '', agencyEmail: '', agencyWebsite: '',
    agencyTaxId: '', agencyAddress: '', agencyCity: '', agencyState: '',
  });
  const [loading, setLoading] = useState(true);
  const { state, errorMsg, save } = useSaveState();

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d: { user?: Record<string, string> }) => {
        const u = d.user ?? {};
        setForm({
          agencyName:    u.agencyName    ?? '',
          agencyPhone:   u.agencyPhone   ?? '',
          agencyEmail:   u.agencyEmail   ?? '',
          agencyWebsite: u.agencyWebsite ?? '',
          agencyTaxId:   u.agencyTaxId   ?? '',
          agencyAddress: u.agencyAddress ?? '',
          agencyCity:    u.agencyCity    ?? '',
          agencyState:   u.agencyState   ?? '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(key: keyof AgencyForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Agency Settings</h2>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Agency Name"  value={form.agencyName}  onChange={set('agencyName')}  placeholder="Agency name"         className="col-span-2" />
        <Input label="Agency Phone" value={form.agencyPhone} onChange={set('agencyPhone')} placeholder="(555) 000-0000" />
        <Input label="Agency Email" value={form.agencyEmail} onChange={set('agencyEmail')} placeholder="info@agency.com" />
        <Input label="Website"      value={form.agencyWebsite} onChange={set('agencyWebsite')} placeholder="agency.com" />
        <Input label="Tax ID / EIN" value={form.agencyTaxId} onChange={set('agencyTaxId')} placeholder="XX-XXXXXXX" />
        <Input label="Address"      value={form.agencyAddress} onChange={set('agencyAddress')} placeholder="Street address"  className="col-span-2" />
        <Input label="City"         value={form.agencyCity}  onChange={set('agencyCity')}  placeholder="City" />
        <Input label="State"        value={form.agencyState} onChange={set('agencyState')} placeholder="State" />
      </div>
      <SaveBar state={state} errorMsg={errorMsg} onSave={() => void save(async () => patchMe(form as unknown as Record<string, unknown>))} />
    </div>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

// ── AI Preferences Tab ────────────────────────────────────────────────────────

function AiPreferencesTab() {
  const [prefs, setPrefs] = useState<AiPreferences>(DEFAULT_AI_PREFS);
  const [loading, setLoading] = useState(true);
  const [customCarrier, setCustomCarrier] = useState('');
  const { state, errorMsg, save } = useSaveState();

  const addCustomCarrier = () => {
    const name = customCarrier.trim().slice(0, 80);
    if (!name) return;
    setPrefs((p) =>
      p.appointed_carriers.some((n) => n.toLowerCase() === name.toLowerCase())
        ? p
        : { ...p, appointed_carriers: [...p.appointed_carriers, name] }
    );
    setCustomCarrier('');
  };

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d: { user?: { aiPreferences?: Partial<AiPreferences> } }) => {
        const saved = d.user?.aiPreferences ?? {};
        setPrefs({ ...DEFAULT_AI_PREFS, ...(saved as Partial<AiPreferences>) });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">AI Preferences</h2>
        <p className="text-sm text-slate-500 mt-1">Customize how your AI coaching assistant behaves during calls.</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Coaching Style</label>
          <div className="grid grid-cols-3 gap-3">
            {(['balanced', 'supportive', 'direct'] as const).map((style) => (
              <button
                key={style}
                onClick={() => setPrefs((p) => ({ ...p, coaching_style: style }))}
                className={`p-3 rounded-xl border text-sm font-medium transition-colors capitalize ${
                  prefs.coaching_style === style
                    ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/8'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-2">
            {prefs.coaching_style === 'supportive' && 'Encouraging, positive reinforcement focused'}
            {prefs.coaching_style === 'direct' && 'Concise, actionable feedback without sugarcoating'}
            {prefs.coaching_style === 'balanced' && 'Mix of encouragement and direct improvement tips'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Response Detail</label>
          <div className="grid grid-cols-2 gap-3">
            {(['concise', 'detailed'] as const).map((detail) => (
              <button
                key={detail}
                onClick={() => setPrefs((p) => ({ ...p, response_detail: detail }))}
                className={`p-3 rounded-xl border text-sm font-medium transition-colors capitalize ${
                  prefs.response_detail === detail
                    ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/8'
                }`}
              >
                {detail === 'concise' ? 'Concise (1–2 sentences)' : 'Detailed (full explanation)'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-white/6">
          <div>
            <p className="text-sm font-medium text-slate-200">Auto-Suggestions</p>
            <p className="text-xs text-slate-500">Automatically surface tips without waiting for you to ask</p>
          </div>
          <Toggle checked={prefs.auto_suggestions} onChange={() => setPrefs((p) => ({ ...p, auto_suggestions: !p.auto_suggestions }))} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Focus Areas</label>
          <div className="space-y-3">
            {([
              { key: 'focus_objections',        label: 'Objection Handling',  desc: 'Tips for handling common objections' },
              { key: 'focus_closing',            label: 'Closing Techniques',  desc: 'Prompts to identify closing opportunities' },
              { key: 'focus_rapport',            label: 'Rapport Building',    desc: 'Guidance on building trust and connection' },
              { key: 'focus_needs_assessment',   label: 'Needs Assessment',    desc: 'Questions to uncover the prospect\'s needs' },
              { key: 'focus_product_knowledge',  label: 'Product Knowledge',   desc: 'Carrier and product recommendation tips' },
            ] as { key: keyof AiPreferences; label: string; desc: string }[]).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-white/6 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-200">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
                <Toggle
                  checked={prefs[key] as boolean}
                  onChange={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">My Carriers</label>
          <p className="text-xs text-slate-500 mb-3">
            Select the carriers you're appointed with. Live-call carrier recommendations will only
            show these, so you're never pointed at an application you can't write.
            Leave all unselected to see every carrier.
          </p>
          <div className="flex flex-wrap gap-2">
            {CARRIERS.map((c) => {
              const selected = prefs.appointed_carriers.includes(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      appointed_carriers: selected
                        ? p.appointed_carriers.filter((n) => n !== c.name)
                        : [...p.appointed_carriers, c.name],
                    }))
                  }
                  title={c.product}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                    selected
                      ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/8'
                  }`}
                >
                  {selected ? '✓ ' : ''}{c.name}
                </button>
              );
            })}
          </div>
          {/* Custom carriers the agent added (not in the built-in engine list) */}
          {prefs.appointed_carriers.filter((n) => !CARRIERS.some((c) => c.name === n)).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {prefs.appointed_carriers
                .filter((n) => !CARRIERS.some((c) => c.name === n))
                .map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-500 bg-blue-500/15 text-blue-300 text-xs font-medium"
                  >
                    ✓ {name}
                    <button
                      onClick={() =>
                        setPrefs((p) => ({
                          ...p,
                          appointed_carriers: p.appointed_carriers.filter((n) => n !== name),
                        }))
                      }
                      className="text-blue-400 hover:text-red-400 font-bold"
                      title={`Remove ${name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={customCarrier}
              onChange={(e) => setCustomCarrier(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCarrier(); } }}
              placeholder="Appointed with a carrier not listed? Type its name…"
              className="flex-1 h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <button
              onClick={addCustomCarrier}
              disabled={!customCarrier.trim()}
              className="px-4 h-9 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-slate-300 hover:bg-white/8 disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-2">
            {prefs.appointed_carriers.length > 0 && (
              <>{prefs.appointed_carriers.length} carrier{prefs.appointed_carriers.length === 1 ? '' : 's'} selected. </>
            )}
            Custom carriers guide the AI coach's advice; for underwriting-fit scoring on them,
            upload the carrier's underwriting guide to your Knowledge Base.
          </p>
        </div>
      </div>

      <SaveBar
        state={state}
        errorMsg={errorMsg}
        onSave={() => void save(async () => patchMe({ aiPreferences: prefs as unknown as Record<string, unknown> }))}
      />
    </div>
  );
}

// ── Coaching Preferences Tab ──────────────────────────────────────────────────

function CoachingPreferencesTab() {
  const [prefs, setPrefs] = useState<CoachingPreferences>(DEFAULT_COACHING_PREFS);
  const [loading, setLoading] = useState(true);
  const { state, errorMsg, save } = useSaveState();

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d: { user?: { coachingPreferences?: Partial<CoachingPreferences> } }) => {
        const saved = d.user?.coachingPreferences ?? {};
        setPrefs({ ...DEFAULT_COACHING_PREFS, ...(saved as Partial<CoachingPreferences>) });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;

  const togglePref = (key: keyof CoachingPreferences) => {
    setPrefs((p) => ({ ...p, [key]: !(p[key] as boolean) }));
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Coaching Preferences</h2>
        <p className="text-sm text-slate-500 mt-1">Control what feedback and alerts appear during and after calls.</p>
      </div>

      <div className="space-y-1">
        {([
          { key: 'real_time_tips',       label: 'Real-Time Tips',         desc: 'Show coaching tips during live calls' },
          { key: 'post_call_summary',    label: 'Post-Call Summary',      desc: 'Generate an AI summary after each call ends' },
          { key: 'objection_alerts',     label: 'Objection Alerts',       desc: 'Highlight when a prospect raises an objection' },
          { key: 'silence_alerts',       label: 'Silence Alerts',         desc: 'Alert when silence exceeds 5 seconds' },
          { key: 'filler_word_tracking', label: 'Filler Word Tracking',   desc: 'Track "um", "uh", "like" and similar filler words' },
        ] as { key: keyof CoachingPreferences; label: string; desc: string }[]).map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between py-3 border-b border-white/6 last:border-0">
            <div>
              <p className="text-sm font-medium text-slate-200">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
            <Toggle checked={prefs[key] as boolean} onChange={() => togglePref(key)} />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Talk Ratio Target — Agent speaks {prefs.talk_ratio_target}% of the time
        </label>
        <input
          type="range"
          min={20}
          max={70}
          step={5}
          value={prefs.talk_ratio_target}
          onChange={(e) => setPrefs((p) => ({ ...p, talk_ratio_target: parseInt(e.target.value, 10) }))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>20% (let prospect talk)</span>
          <span>70% (agent-led)</span>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Recommended: 35–45% for final expense sales. You&apos;ll be alerted when you exceed the target.
        </p>
      </div>

      <SaveBar
        state={state}
        errorMsg={errorMsg}
        onSave={() => void save(async () => patchMe({ coachingPreferences: prefs as unknown as Record<string, unknown> }))}
      />
    </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────────────────

const PLAN_DETAILS: Record<string, { name: string; price: number }> = {
  professional: { name: 'Professional', price: 49 },
  agency:       { name: 'Agency',       price: 99 },
};

function BillingTab() {
  const { status, planName, isActive, loading, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, hasCustomer, refetch } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('professional');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setCheckoutSuccess(true); // eslint-disable-line react-hooks/set-state-in-effect
      refetch();
      window.history.replaceState({}, '', '/settings?tab=billing');
    }
  }, [refetch]);

  async function handleCheckout() {
    setActionLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan }),
      });
      const d = await r.json().catch(() => ({})) as { url?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error ?? 'Failed to start checkout');
      window.location.href = d.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setActionLoading(false);
    }
  }

  async function handlePortal() {
    setActionLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST' });
      const d = await r.json().catch(() => ({})) as { url?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error ?? 'Failed to open portal');
      window.location.href = d.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setActionLoading(false);
    }
  }

  if (loading) return <LoadingSkeleton />;

  const statusLabel: Record<string, { text: string; color: string }> = {
    trialing:  { text: 'Free Trial',  color: 'text-amber-400' },
    active:    { text: 'Active',      color: 'text-green-400' },
    past_due:  { text: 'Past Due',    color: 'text-red-400'   },
    canceled:  { text: 'Canceled',    color: 'text-slate-400' },
    unpaid:    { text: 'Unpaid',      color: 'text-red-400'   },
    none:      { text: 'No Plan',     color: 'text-slate-500' },
  };
  const { text: statusText, color: statusColor } = statusLabel[status] ?? statusLabel.none;
  const plan = planName ? PLAN_DETAILS[planName] : null;

  return (
    <div className="space-y-5">
      {checkoutSuccess && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/25 text-green-400 text-sm font-medium">
          ✓ Subscription activated! Welcome aboard.
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Current Plan</h2>

        {isActive ? (
          <div className="flex items-start gap-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <p className="font-bold text-blue-300 text-xl">
                  FE Live Coach {plan?.name ?? 'Pro'}
                </p>
                <span className={`text-sm font-semibold ${statusColor}`}>{statusText}</span>
              </div>
              <p className="text-sm text-slate-400">Unlimited live calls · AI coaching · Role play trainer · All features</p>
              {status === 'trialing' && trialEndsAt && (
                <p className="text-xs text-amber-400 mt-2">
                  Trial ends {trialEndsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
              {status === 'active' && currentPeriodEnd && (
                <p className="text-xs text-slate-500 mt-2">
                  {cancelAtPeriodEnd
                    ? `Cancels ${currentPeriodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                    : `Renews ${currentPeriodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-200">${plan?.price ?? 99}</p>
              <p className="text-xs text-slate-500">/month</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center space-y-2">
              <p className={`text-lg font-semibold ${statusColor}`}>{statusText}</p>
              <p className="text-sm text-slate-400">
                {status === 'canceled'
                  ? 'Your subscription has been canceled. Resubscribe to regain access.'
                  : status === 'past_due'
                  ? 'Your last payment failed. Update your payment method to restore access.'
                  : 'Subscribe to access Live Call AI and all premium features.'}
              </p>
              <p className="text-sm text-amber-400 font-medium">7-day free trial included</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(['professional', 'agency'] as PlanId[]).map((pid) => {
                const pd = PLAN_DETAILS[pid];
                return (
                  <button
                    key={pid}
                    onClick={() => setSelectedPlan(pid)}
                    className={`p-4 rounded-xl border-2 text-left transition-colors ${
                      selectedPlan === pid
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/8'
                    }`}
                  >
                    <p className="font-semibold text-slate-200">{pd.name}</p>
                    <p className="text-xl font-bold text-slate-100 mt-1">${pd.price}<span className="text-xs text-slate-500 font-normal">/mo</span></p>
                    {pid === 'agency' && <p className="text-xs text-slate-500 mt-1">Multi-user + priority support</p>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Manage Billing</h2>

        {!isActive && (
          <button
            onClick={() => void handleCheckout()}
            disabled={actionLoading}
            className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {actionLoading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {status === 'past_due' ? 'Update Payment Method' : `Start 7-Day Free Trial — ${PLAN_DETAILS[selectedPlan].name}`}
          </button>
        )}

        {hasCustomer && (
          <button
            onClick={() => void handlePortal()}
            disabled={actionLoading}
            className="w-full h-11 rounded-xl bg-white/8 hover:bg-white/12 disabled:opacity-50 text-slate-300 font-medium text-sm border border-white/10 transition-colors flex items-center justify-center gap-2"
          >
            {actionLoading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Manage Subscription &amp; Payment Method
          </button>
        )}

        <p className="text-xs text-slate-600 text-center">
          Payments processed securely by Stripe. Cancel anytime.
        </p>
      </div>
    </div>
  );
}

// ── Shared UI components ──────────────────────────────────────────────────────

function SaveBar({ state, errorMsg, onSave }: { state: SaveState; errorMsg: string | null; onSave: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      {state === 'error' && <p className="text-sm text-red-400">{errorMsg ?? 'Save failed'}</p>}
      {state === 'saved' && <p className="text-sm text-green-400">✓ Saved</p>}
      <Button onClick={onSave} disabled={state === 'saving'}>
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save Changes'}
      </Button>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-600' : 'bg-white/15'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4 animate-pulse">
      <div className="h-5 bg-white/10 rounded w-40" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-white/5 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
