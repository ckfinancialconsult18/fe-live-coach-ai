'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/(auth)/actions';
import { useSubscription } from '@/hooks/useSubscription';

type MeResponse = {
  user: { email: string; fullName: string | null; role: string; avatarUrl?: string | null };
  todayStats: { calls: number; appointments: number; policiesWritten: number; avgScore: number | null };
};

const navItems = [
  { href: '/dashboard',      label: 'Dashboard',      icon: GridIcon },
  { href: '/live-call',      label: 'Live Calls',     icon: PhoneIcon },
  { href: '/past-calls',     label: 'Past Calls',     icon: ClockIcon },
  { href: '/role-play',      label: 'Role Play',      icon: MicIcon },
  { href: '/reports',        label: 'Reports',        icon: ChartBarIcon },
  { href: '/agency',         label: 'Agency',         icon: AgencyIcon },
  { href: '/carrier-guide',  label: 'Carrier Guide',  icon: BuildingIcon },
  { href: '/learn-from-call',    label: 'Learn From Call',  icon: LearnIcon },
  { href: '/knowledge-base',     label: 'Knowledge',        icon: BookIcon },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const { status, planName, isActive, currentPeriodEnd } = useSubscription();

  useEffect(() => {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => setMe(null));
  }, []);

  const stats = [
    { label: "Today's Calls", value: me ? String(me.todayStats.calls) : '—' },
    { label: 'Avg Score',     value: me?.todayStats.avgScore != null ? `${me.todayStats.avgScore}%` : '—' },
  ];

  const displayName = me?.user.fullName || me?.user.email?.split('@')[0] || '—';
  const initials = displayName !== '—'
    ? displayName.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
    : '··';
  const roleLabel = me?.user.role ? me.user.role.charAt(0).toUpperCase() + me.user.role.slice(1) : 'Agent';

  return (
    <aside className={`
      flex flex-col h-full shrink-0
      ${collapsed ? 'w-16' : 'w-64'}
      transition-all duration-300
      border-r border-white/6
      bg-gradient-to-b from-[#0c1020] to-[#090d18]
    `}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/6">
        <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 shadow-lg flex items-center justify-center"
          style={{ boxShadow: '0 4px 16px rgba(212,175,55,0.35)' }}>
          <Image src="/logo.webp" alt="FE Live Coach AI" width={36} height={36} className="object-cover w-full h-full" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-100 leading-none tracking-tight">FE Live Coach</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#D4AF37' }}>AI · Final Expense</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-slate-600 hover:text-slate-400 transition-colors p-1 rounded hidden lg:block"
        >
          <ChevronIcon collapsed={collapsed} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const isLive = item.href === '/live-call';
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150
                ${active
                  ? 'text-[#D4AF37] bg-[rgba(212,175,55,0.10)] border-r-2 border-[#D4AF37]'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
              title={collapsed ? item.label : undefined}
            >
              <Icon active={active} />
              {!collapsed && (
                <span className="flex-1">{item.label}</span>
              )}
              {!collapsed && isLive && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-500/15 text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-live" />
                  LIVE
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Stats */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-white/6 space-y-2">
          <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-widest px-1 mb-2">Today&apos;s Stats</p>
          <div className="grid grid-cols-2 gap-1.5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg px-2.5 py-2 bg-white/4 border border-white/6">
                <p className="text-[10px] text-slate-500">{s.label}</p>
                <p className="text-sm font-bold text-slate-200 mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
          {isActive && (
            <div className="rounded-lg px-2.5 py-2 bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] mt-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-400">Subscription</p>
                <span className="text-[9px] font-bold text-[#D4AF37] bg-[rgba(212,175,55,0.15)] px-1.5 py-0.5 rounded-full">
                  {planName === 'agency' ? 'AGENCY' : 'PRO'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">
                {status === 'trialing' ? 'Trial' : 'Active'}
                {currentPeriodEnd ? ` — renews ${currentPeriodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* User */}
      <div className="p-3 border-t border-white/6">
        <form action={signOut}>
          <button
            type="submit"
            title={collapsed ? 'Sign out' : undefined}
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left ${collapsed ? 'justify-center' : ''}`}
          >
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[#090d18] text-xs font-extrabold"
              style={me?.user.avatarUrl ? {} : { background: 'linear-gradient(135deg, #D4AF37, #b8940f)' }}>
              {me?.user.avatarUrl
                ? <Image src={me.user.avatarUrl} alt={displayName} width={32} height={32} className="w-full h-full object-cover" />
                : initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate">{displayName}</p>
                <p className="text-[10px] text-slate-500 truncate">Final Expense {roleLabel}</p>
              </div>
            )}
            {!collapsed && <SignOutIcon />}
          </button>
        </form>
      </div>
    </aside>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ic(active: boolean) {
  return `w-4 h-4 shrink-0 transition-colors ${active ? 'text-[#D4AF37]' : 'text-slate-500'}`;
}

function LogoIcon() {
  return (
    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  );
}

function GridIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  );
}

function PhoneIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/>
    </svg>
  );
}

function ClockIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function MicIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}

function UsersIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function ChartBarIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  );
}

function TrendIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  );
}

function PerformanceIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20V10M18 20V4M6 20v-4"/>
    </svg>
  );
}

function BuildingIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/>
    </svg>
  );
}

function LearnIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  );
}

function KnowledgeCenterIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 12l10 5 10-5"/>
      <circle cx="12" cy="19" r="3"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
    </svg>
  );
}

function BookIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  );
}

function SettingsIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function AgencyIcon({ active = false }: { active?: boolean }) {
  return (
    <svg className={ic(active)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      <line x1="19" y1="8" x2="19" y2="14"/>
      <line x1="22" y1="11" x2="16" y2="11"/>
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {collapsed ? <polyline points="9 18 15 12 9 6"/> : <polyline points="15 18 9 12 15 6"/>}
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
