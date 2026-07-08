'use client';

import { createContext, useContext, useRef, useCallback } from 'react';

interface LiveCallBridge {
  register: (handlers: { startCall: () => void; endCall: () => void }) => void;
  startCall: () => void;
  endCall: () => void;
}

const Ctx = createContext<LiveCallBridge | null>(null);

export function LiveCallBridgeProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef<{ startCall: () => void; endCall: () => void } | null>(null);

  const register = useCallback((handlers: { startCall: () => void; endCall: () => void }) => {
    handlersRef.current = handlers;
    return () => { handlersRef.current = null; };
  }, []);

  const startCall = useCallback(() => handlersRef.current?.startCall(), []);
  const endCall   = useCallback(() => handlersRef.current?.endCall(),   []);

  return <Ctx.Provider value={{ register, startCall, endCall }}>{children}</Ctx.Provider>;
}

export function useLiveCallBridge() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLiveCallBridge must be used within LiveCallBridgeProvider');
  return ctx;
}
