'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const breadcrumbMap: Record<string, string> = {
  '/dashboard':      'Dashboard',
  '/live-call':      'Live Call',
  '/past-calls':     'Past Calls',
  '/role-play':      'Role Play',
  '/contacts':       'Contacts',
  '/reports':        'Reports',
  '/analytics':      'Analytics',
  '/carrier-guide':  'Carrier Guide',
  '/knowledge-base': 'Knowledge Base',
  '/settings':       'Settings',
};

interface TopNavProps {
  onMenuToggle?: () => void;
  isLive?: boolean;
  callDuration?: number;
  onEndCall?: () => void;
  micActive?: boolean;
}

export function TopNav({ onMenuToggle, isLive, callDuration, onEndCall, micActive }: TopNavProps) {
  const pathname = usePathname();
  const [time, setTime] = useState('');

  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const title = breadcrumbMap[pathname] ?? breadcrumbMap[`/${pathname.split('/')[1]}`] ?? 'FE Live Coach AI';
  const onLivePage = pathname === '/live-call';

  function fmtDur(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-white/6 bg-[#090d18]/80 backdrop-blur-md shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div>
          <h1 className="text-sm font-semibold text-slate-100">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Clock */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/4 border border-white/8">
          <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className="text-xs font-mono text-slate-300">{time}</span>
        </div>

        {/* Live badge */}
        {onLivePage && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
            isLive
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-white/4 border-white/8 text-slate-500'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-400 animate-live' : 'bg-slate-600'}`} />
            {isLive ? `LIVE · ${fmtDur(callDuration ?? 0)}` : 'STANDBY'}
          </div>
        )}

        {/* Mic status */}
        {onLivePage && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
            micActive
              ? 'bg-[rgba(212,175,55,0.08)] border-[rgba(212,175,55,0.25)] text-[#D4AF37]'
              : 'bg-white/4 border-white/8 text-slate-500'
          }`}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
            {micActive ? 'MIC ON' : 'MIC OFF'}
          </div>
        )}

        {/* End call */}
        {onLivePage && isLive && (
          <button
            onClick={onEndCall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            End Call
          </button>
        )}

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[#090d18] text-xs font-extrabold cursor-pointer ml-1"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #b8940f)' }}>
          CK
        </div>
      </div>
    </header>
  );
}
