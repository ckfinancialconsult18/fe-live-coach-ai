'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Live call state lifted here so TopNav can display it
  const [isLive, setIsLive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [micActive, setMicActive] = useState(false);

  const pathname = usePathname();
  const isLivePage = pathname === '/live-call';

  const handleEndCall = useCallback(() => {
    setIsLive(false);
    setCallDuration(0);
    setMicActive(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#090d18' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-50
        lg:z-auto lg:flex
        ${mobileOpen ? 'flex' : 'hidden lg:flex'}
        transition-transform duration-300
      `}>
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopNav
          onMenuToggle={() => setMobileOpen((o) => !o)}
          isLive={isLive}
          callDuration={callDuration}
          onEndCall={handleEndCall}
          micActive={micActive}
        />
        <main className={`flex-1 min-h-0 ${isLivePage ? 'overflow-hidden' : 'overflow-y-auto p-5'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
