'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLiveCallBridge } from '@/lib/live-call-bridge';

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
}

export function TopNav({ onMenuToggle }: TopNavProps) {
  const pathname = usePathname();
  const [time, setTime] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [duration, setDuration] = useState(0);
  const bridge = useLiveCallBridge();

  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Track live state + duration via custom events dispatched by live-call page
  useEffect(() => {
    function onLiveChange(e: Event) {
      const { live, duration: d } = (e as CustomEvent).detail;
      setIsLive(live);
      setDuration(d ?? 0);
    }
    window.addEventListener('live-call-state', onLiveChange);
    return () => window.removeEventListener('live-call-state', onLiveChange);
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
        <h1 className="text-sm font-semibold text-slate-100">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Clock */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/4 border border-white/8">
          <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className="text-xs font-mono text-slate-300">{time}</span>
        </div>

        {/* Start / End Call — only on live-call page */}
        {onLivePage && !isLive && (
          <button
            onClick={() => bridge.startCall()}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-100"
            style={{
              background: 'linear-gradient(135deg, #D4AF37, #9a7a0a)',
              boxShadow: '0 4px 16px rgba(212,175,55,0.35)',
              color: '#090d18',
            }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/>
            </svg>
            Start Call
          </button>
        )}

        {onLivePage && isLive && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-live" />
              <span className="text-xs font-semibold text-green-400">LIVE · {fmtDur(duration)}</span>
            </div>
            <button
              onClick={() => bridge.endCall()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(135deg)' }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/>
              </svg>
              End Call
            </button>
          </div>
        )}

        {/* User avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#090d18] text-xs font-extrabold cursor-pointer ml-1"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #b8940f)' }}
        >
          CK
        </div>
      </div>
    </header>
  );
}
