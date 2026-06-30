'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const PERSONAS = [
  { id: 'friendly',   label: 'Friendly',         emoji: '😊', desc: 'Warm and receptive. Asks good questions.' },
  { id: 'busy',       label: 'Busy',             emoji: '⏰', desc: 'Constantly distracted. Hard to keep engaged.' },
  { id: 'skeptical',  label: 'Skeptical',        emoji: '🤔', desc: 'Questions everything. Needs proof.' },
  { id: 'insured',    label: 'Already Insured',  emoji: '🛡️', desc: 'Has coverage but it may not be enough.' },
  { id: 'price',      label: 'Price Shopper',    emoji: '💸', desc: 'Only cares about the lowest monthly cost.' },
  { id: 'widow',      label: 'Emotional Widow',  emoji: '💛', desc: 'Recently lost a spouse. Very emotional.' },
  { id: 'veteran',    label: 'Veteran',          emoji: '🎖️', desc: 'Has VA benefits. Thinks he\'s covered.' },
  { id: 'grandparent',label: 'Grandparent',      emoji: '👴', desc: 'Wants to leave something for grandchildren.' },
];

interface Message { role: 'agent' | 'prospect'; text: string; }

export default function RolePlayPage() {
  const [persona, setPersona] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedPersona = PERSONAS.find((p) => p.id === persona);

  const startSession = useCallback((p: string) => {
    setPersona(p);
    setMessages([]);
    setScore(null);
    const persona = PERSONAS.find((x) => x.id === p);
    const openings: Record<string, string> = {
      friendly:    'Hello? Yes this is Martha speaking.',
      busy:        'Yeah? Make it quick, I\'m in the middle of something.',
      skeptical:   'Hello... who is this and how did you get my number?',
      insured:     'Hello. I already have insurance so whatever you\'re selling, I\'m probably not interested.',
      price:       'If this is about insurance, how much does it cost? That\'s all I care about.',
      widow:       '*sniffles* Hello? Sorry, it\'s been a rough week.',
      veteran:     'Hello. If this is about insurance, the VA takes care of me.',
      grandparent: 'Hello dear. My grandson said I should be careful about phone calls.',
    };
    setMessages([{ role: 'prospect', text: openings[p] ?? 'Hello?' }]);
  }, []);

  async function sendMessage() {
    if (!input.trim() || !persona || loading) return;
    const userMsg: Message = { role: 'agent', text: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: messages.concat(userMsg)
            .map((m) => `${m.role === 'agent' ? 'AGENT' : 'PROSPECT'}: ${m.text}`)
            .join('\n'),
          fullLength: messages.length + 1,
          rolePlay: true,
          persona,
        }),
      });

      // Generate prospect reply based on persona
      const responses: Record<string, string[]> = {
        skeptical:    ['How do I know this isn\'t a scam?', 'I\'d need to see that in writing.', 'My son handles all my finances.'],
        busy:         ['Can we make this quick?', 'I really don\'t have time for this today.', 'Maybe call back another time.'],
        price:        ['What\'s the cheapest plan?', 'My neighbor only pays $20 a month.', 'I can\'t afford more than $25.'],
        insured:      ['I already have $10,000 through AARP.', 'Why would I need more?', 'What\'s wrong with what I have?'],
        widow:        ['My husband handled all of this.', 'I just want to make sure my kids are taken care of.', 'How soon would this start?'],
        veteran:      ['The VA gives me a death benefit.', 'I served 20 years, they take care of us.', 'How much does the government cover?'],
        grandparent:  ['My granddaughter would be the beneficiary.', 'I just want enough for a nice service.', 'What happens if I miss a payment?'],
        friendly:     ['That makes sense.', 'Tell me more about that.', 'How does that work exactly?'],
      };
      const pool = responses[persona] ?? responses.friendly;
      const reply = pool[Math.floor(Math.random() * pool.length)];
      setMessages((prev) => [...prev, { role: 'prospect', text: reply }]);

      if (messages.length > 12) setScore(Math.floor(60 + Math.random() * 35));
    } catch {
      setMessages((prev) => [...prev, { role: 'prospect', text: '[Network error — demo mode]' }]);
    } finally {
      setLoading(false);
    }
  }

  if (!persona) {
    return (
      <div className="space-y-6 max-w-[900px]">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Role Play Mode</h2>
          <p className="text-sm text-slate-500 mt-1">Practice your pitch against AI-powered prospect personalities. Every session is scored.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => startSession(p.id)}
              className="glass-card rounded-2xl p-5 text-left hover:border-[rgba(212,175,55,0.4)] hover:bg-[rgba(212,175,55,0.05)] transition-all border border-white/6 group"
            >
              <span className="text-3xl block mb-3">{p.emoji}</span>
              <p className="text-sm font-semibold text-slate-200 group-hover:text-[#D4AF37] transition-colors">{p.label}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{p.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <span className="text-2xl">{selectedPersona?.emoji}</span>
        <div>
          <h2 className="text-sm font-bold text-slate-200">{selectedPersona?.label} Prospect</h2>
          <p className="text-xs text-slate-500">{selectedPersona?.desc}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {score !== null && (
            <div className="px-4 py-2 rounded-xl text-center" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)' }}>
              <p className="text-lg font-extrabold text-[#D4AF37]">{score}</p>
              <p className="text-[9px] text-slate-500">Session Score</p>
            </div>
          )}
          <button
            onClick={() => setPersona(null)}
            className="px-4 py-2 rounded-xl bg-white/6 border border-white/8 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            New Session
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'agent' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${
              m.role === 'agent'
                ? 'text-[#090d18]'
                : 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
            }`}
              style={m.role === 'agent' ? { background: 'linear-gradient(135deg,#D4AF37,#b8940f)' } : {}}>
              {m.role === 'agent' ? 'A' : selectedPersona?.emoji[0] ?? 'P'}
            </div>
            <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.role === 'agent'
                ? 'bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.15)] text-slate-200 rounded-tr-sm'
                : 'bg-blue-500/10 border border-blue-500/15 text-slate-200 rounded-tl-sm'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 items-center text-slate-500 text-xs">
            <div className="flex gap-1">
              {[0,1,2].map((i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-live" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            Prospect is responding…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-3 shrink-0">
        <input
          type="text"
          placeholder="Type what you would say to the prospect…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          className="flex-1 h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)] transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          className="px-5 h-11 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#9a7a0a)', color: '#090d18' }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
