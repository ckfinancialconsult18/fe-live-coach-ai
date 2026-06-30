'use client';

import { useEffect, useRef } from 'react';

interface Props {
  talkPct: number;
  listenPct: number;
  sentimentScore: number;
  connectionScore: number;
  energyScore: number;
  confidenceScore: number;
}

export function MetricsPanel({ talkPct, listenPct, sentimentScore, connectionScore, energyScore, confidenceScore }: Props) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* Talk vs Listen */}
      <div className="glass-card rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Talk vs Listen</p>
        <div className="flex items-center justify-center mb-3">
          <TalkListenDonut talk={talkPct} listen={listenPct} />
        </div>
        <div className="flex items-center justify-around">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: '#D4AF37' }} />
            <span className="text-[10px] text-slate-400">Agent {talkPct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] text-slate-400">Prospect {listenPct}%</span>
          </div>
        </div>
        {talkPct > 50 && (
          <p className="text-[10px] text-amber-400 text-center mt-2">💡 Let the prospect talk more</p>
        )}
      </div>

      {/* Score Cards */}
      <div className="glass-card rounded-xl p-3 space-y-3">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Live Scores</p>
        <ScoreBar label="Sentiment"   value={sentimentScore}  color="#22c55e" />
        <ScoreBar label="Connection"  value={connectionScore} color="#D4AF37" />
        <ScoreBar label="Energy"      value={energyScore}     color="#06b6d4" />
        <ScoreBar label="Confidence"  value={confidenceScore} color="#a78bfa" />
      </div>
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const grade = value >= 80 ? 'A' : value >= 65 ? 'B' : value >= 50 ? 'C' : 'D';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-500">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-300">{value}</span>
          <span className="text-[9px] font-bold px-1 rounded" style={{ background: `${color}20`, color }}>{grade}</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/5">
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

function TalkListenDonut({ talk, listen }: { talk: number; listen: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, r = size / 2 - 6;

    ctx.clearRect(0, 0, size, size);

    function arc(startAngle: number, endAngle: number, color: string) {
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, startAngle, endAngle);
      ctx!.lineWidth = 10;
      ctx!.strokeStyle = color;
      ctx!.lineCap = 'round';
      ctx!.stroke();
    }

    const talkEnd = -Math.PI / 2 + (talk / 100) * 2 * Math.PI;
    arc(-Math.PI / 2, -Math.PI / 2 + 2 * Math.PI, 'rgba(255,255,255,0.05)');
    arc(-Math.PI / 2, talkEnd, '#D4AF37');
    if (listen > 0) arc(talkEnd, talkEnd + (listen / 100) * 2 * Math.PI, '#60a5fa');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${size * 0.18}px sans-serif`;
    ctx.fillText(`${listen}%`, cx, cy - size * 0.07);
    ctx.fillStyle = '#64748b';
    ctx.font = `${size * 0.1}px sans-serif`;
    ctx.fillText('listen', cx, cy + size * 0.1);
  }, [talk, listen]);

  return <canvas ref={canvasRef} width={100} height={100} className="w-24 h-24" />;
}
