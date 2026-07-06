'use client';

import { useEffect, useRef, useState } from 'react';
import type { TranscriptLine } from '@/lib/types';
import type { PartialTranscript } from '@/hooks/useDeepgramTranscription';

interface Props {
  lines: TranscriptLine[];
  partial?: PartialTranscript | null;
  isListening: boolean;
  onCorrectSpeaker?: (lineId: string) => void;
}

export function LiveTranscript({ lines, partial, isListening, onCorrectSpeaker }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  // Track when a partial finalizes so the new final line can skip its fade-in
  // animation — otherwise there's a visible flash as partial disappears and
  // the final row fades in from opacity-0.
  const prevPartialRef = useRef<PartialTranscript | null>(null);
  const [skipFadeForId, setSkipFadeForId] = useState<string | null>(null);

  useEffect(() => {
    const wasPartial = prevPartialRef.current;
    prevPartialRef.current = partial ?? null;
    if (wasPartial && !partial && lines.length > 0) {
      const lastId = lines[lines.length - 1].id;
      setSkipFadeForId(lastId);
      // Clear after any CSS animation would complete
      const t = setTimeout(() => setSkipFadeForId(null), 300);
      return () => clearTimeout(t);
    }
  }, [partial, lines]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, partial, autoScroll]);

  const filtered = search
    ? lines.filter((l) => l.text.toLowerCase().includes(search.toLowerCase()))
    : lines;

  function fmt(d: Date) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Live Transcript</h2>
          <span className="text-xs text-slate-500">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 h-7 pl-8 pr-3 rounded-lg bg-white/5 border border-white/8 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
            />
          </div>
          <button
            onClick={() => setAutoScroll((a) => !a)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
              autoScroll
                ? 'bg-[rgba(212,175,55,0.1)] border-[rgba(212,175,55,0.3)] text-[#D4AF37]'
                : 'bg-white/4 border-white/8 text-slate-500'
            }`}
          >
            Auto-scroll
          </button>
        </div>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {lines.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            {isListening ? (
              <>
                <div className="flex gap-1 items-end h-8">
                  {[0,1,2,3,4].map((i) => (
                    <div key={i} className="w-1 rounded-full bg-[#D4AF37] opacity-80"
                      style={{ height: `${20 + Math.sin(i) * 12}px`, animation: `live-pulse ${0.8 + i * 0.1}s ease-in-out infinite` }} />
                  ))}
                </div>
                <p className="text-sm text-slate-400">Listening for speech…</p>
                <p className="text-xs text-slate-600">Transcription will appear here</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-white/4 border border-white/8 flex items-center justify-center">
                  <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  </svg>
                </div>
                <p className="text-sm text-slate-400">Ready to listen</p>
                <p className="text-xs text-slate-600">Click Start Call to begin transcription</p>
              </>
            )}
          </div>
        )}

        {filtered.map((line) => (
          <TranscriptRow
            key={line.id}
            line={line}
            fmt={fmt}
            noAnimation={line.id === skipFadeForId}
            onCorrectSpeaker={onCorrectSpeaker}
          />
        ))}
        {partial && partial.text && <PartialRow partial={partial} />}
        <div ref={bottomRef} />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-white/6 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#D4AF37]" />
          <span className="text-[10px] text-slate-500">Agent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-[10px] text-slate-500">Prospect</span>
        </div>
        {isListening && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-live" />
            <span className="text-[10px] text-green-400 font-medium">Transcribing</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Streaming partial row ──────────────────────────────────────────────────────
// Animates new characters in at ~180 chars/sec (3 chars/frame @ 60fps), which
// matches the feel of ChatGPT streaming. Only the delta from the last displayed
// text is animated; corrections (shorter text) snap immediately.

function PartialRow({ partial }: { partial: PartialTranscript }) {
  const isAgent = partial.speaker === 'agent';

  // `displayed` is what's currently rendered — it lags `partial.text` while
  // the animation is in flight.
  const [displayed, setDisplayed] = useState(partial.text);
  const displayedRef = useRef(partial.text);
  const targetRef = useRef(partial.text);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const next = partial.text;
    targetRef.current = next;

    // Cancel in-flight animation from previous target
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const prev = displayedRef.current;

    // Find the longest common prefix so we only animate what changed
    let commonLen = 0;
    const minLen = Math.min(prev.length, next.length);
    while (commonLen < minLen && prev[commonLen] === next[commonLen]) commonLen++;

    if (next.length <= commonLen) {
      // Deepgram corrected to something shorter — snap on the next frame
      // (must not call setState synchronously in an effect body)
      displayedRef.current = next;
      rafRef.current = requestAnimationFrame(() => {
        if (targetRef.current === next) setDisplayed(next);
      });
      return;
    }

    const base = next.slice(0, commonLen);
    const suffix = next.slice(commonLen);
    let charIdx = 0;
    // 3 chars per frame ≈ 180 chars/sec at 60 fps — fast enough to feel real-time,
    // slow enough that individual word arrivals are visible
    const CHARS_PER_FRAME = 3;

    function tick() {
      if (targetRef.current !== next) return; // a newer target arrived, abort
      charIdx = Math.min(charIdx + CHARS_PER_FRAME, suffix.length);
      const text = base + suffix.slice(0, charIdx);
      displayedRef.current = text;
      setDisplayed(text);
      if (charIdx < suffix.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [partial.text]);

  return (
    <div className={`flex gap-3 ${isAgent ? '' : 'flex-row-reverse'}`}>
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold opacity-50 ${
          isAgent ? 'text-[#090d18]' : 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
        }`}
        style={isAgent ? { background: 'linear-gradient(135deg, #D4AF37, #b8940f)' } : {}}
      >
        {isAgent ? 'A' : 'P'}
      </div>
      <div className={`flex flex-col max-w-[85%] ${isAgent ? 'items-start' : 'items-end'}`}>
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed italic text-slate-400 border border-dashed ${
            isAgent ? 'border-[rgba(212,175,55,0.2)] rounded-tl-sm' : 'border-blue-500/15 rounded-tr-sm'
          }`}
        >
          {displayed}
          {/* Blinking cursor — sits at the end of displayed text as it animates */}
          <span className="inline-block w-[2px] h-[0.9em] ml-[2px] bg-slate-400 align-middle"
            style={{ animation: 'blink-cursor 1s step-end infinite' }} />
        </div>
        <span className="text-[10px] text-slate-700 mt-1 px-1">transcribing…</span>
      </div>
    </div>
  );
}

// ── Finalized transcript row ───────────────────────────────────────────────────

function TranscriptRow({ line, fmt, noAnimation, onCorrectSpeaker }: {
  line: TranscriptLine;
  fmt: (d: Date) => string;
  noAnimation?: boolean;
  onCorrectSpeaker?: (lineId: string) => void;
}) {
  const isAgent = line.speaker === 'agent';
  const lowConfidence = line.speakerConfidence != null && line.speakerConfidence < 50;
  return (
    <div className={`flex gap-3 ${isAgent ? '' : 'flex-row-reverse'} ${noAnimation ? '' : 'animate-fade-in'}`}>
      <button
        onClick={() => onCorrectSpeaker?.(line.id)}
        title="Click to correct speaker"
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-110 ${
          isAgent ? 'text-[#090d18]' : 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
        }`}
        style={isAgent ? { background: 'linear-gradient(135deg, #D4AF37, #b8940f)' } : {}}
      >
        {isAgent ? 'A' : 'P'}
      </button>

      <div className={`flex flex-col max-w-[85%] ${isAgent ? 'items-start' : 'items-end'}`}>
        <div className={`
          px-3 py-2 rounded-2xl text-sm leading-relaxed
          ${isAgent
            ? 'bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.15)] text-slate-200 rounded-tl-sm'
            : 'bg-blue-500/10 border border-blue-500/15 text-slate-200 rounded-tr-sm'
          }
        `}>
          {line.text}
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-600 mt-1 px-1">
          {fmt(line.timestamp)}
          {line.speakerEdited && <span className="text-[#D4AF37]">· corrected</span>}
          {!line.speakerEdited && line.speakerConfidence != null && (
            <span className={lowConfidence ? 'text-amber-500' : 'text-slate-700'} title="Speaker identification confidence">
              · {line.speakerConfidence}% conf
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
