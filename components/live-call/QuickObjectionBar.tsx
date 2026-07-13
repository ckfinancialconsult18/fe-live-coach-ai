'use client';

import { useState, useEffect, useRef } from 'react';
import type { ObjectionKey } from '@/lib/types';
import { OBJECTION_RESPONSES } from '@/lib/objection-responses';

const BUTTONS: { key: ObjectionKey; label: string; emoji: string }[] = [
  { key: 'already_insured',  label: 'Already Insured', emoji: '🛡️' },
  { key: 'think_about_it',   label: 'Think About It',  emoji: '🤔' },
  { key: 'too_expensive',    label: 'Too Expensive',   emoji: '💸' },
  { key: 'call_later',       label: 'Call Me Later',   emoji: '📅' },
  { key: 'need_spouse',      label: 'Need Spouse',     emoji: '👫' },
  { key: 'busy',             label: 'Too Busy',        emoji: '⏰' },
  { key: 'not_interested',   label: 'Not Interested',  emoji: '🚫' },
];

interface Props {
  transcript?: string;
}

export function QuickObjectionBar({ transcript }: Props = {}) {
  const [active, setActive] = useState<ObjectionKey | null>(null);
  const [kbScript, setKbScript] = useState<string | null>(null);
  const [kbLoading, setKbLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active) { setKbScript(null); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setKbScript(null);
    setKbLoading(true);

    fetch('/api/objection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectionKey: active, transcript }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d: { script: string | null }) => { if (!controller.signal.aborted) setKbScript(d.script); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setKbLoading(false); });

    return () => controller.abort();
  }, [active, transcript]);

  const response = active ? OBJECTION_RESPONSES[active] : null;

  return (
    <div className="shrink-0 border-t border-white/6 bg-[#090d18]/80 backdrop-blur-md">
      {/* Buttons */}
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
        <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider shrink-0">Quick Objections:</span>
        {BUTTONS.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setActive((k) => k === btn.key ? null : btn.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border shrink-0 ${
              active === btn.key
                ? 'bg-[rgba(212,175,55,0.15)] border-[rgba(212,175,55,0.4)] text-[#D4AF37]'
                : 'bg-white/4 border-white/8 text-slate-400 hover:text-slate-200 hover:bg-white/8'
            }`}
          >
            <span>{btn.emoji}</span>
            {btn.label}
          </button>
        ))}
      </div>

      {/* Framework panel */}
      {response && active && (
        <div className="mx-4 mb-3 rounded-xl p-4 border border-[rgba(212,175,55,0.25)] bg-[rgba(212,175,55,0.05)] animate-alert">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#D4AF37]">{response.title}</h3>
            <button onClick={() => setActive(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line mb-3">
            {response.framework}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-bold text-green-400 uppercase tracking-wider mb-1.5">Say These</p>
              <div className="space-y-1">
                {response.keyPhrases.map((p: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-green-400 text-[10px] shrink-0">✓</span>
                    <p className="text-[10px] text-slate-300 italic">&quot;{p}&quot;</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-1.5">Avoid</p>
              <div className="space-y-1">
                {response.avoidPhrases.map((p: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-red-400 text-[10px] shrink-0">✕</span>
                    <p className="text-[10px] text-slate-500 italic">&quot;{p}&quot;</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Knowledge base script — pulled live from uploaded materials */}
          {(kbLoading || kbScript) && (
            <div className="mt-3 pt-3 border-t border-white/8">
              <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#D4AF37' }}>
                📚 From Your Scripts
              </p>
              {kbLoading && !kbScript ? (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 border border-[#D4AF37]/40 border-t-[#D4AF37] rounded-full animate-spin" />
                  <span className="text-[10px] text-slate-500">Pulling from knowledge base…</span>
                </div>
              ) : (
                <p className="text-[10px] text-slate-200 leading-relaxed italic whitespace-pre-line">{kbScript}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
