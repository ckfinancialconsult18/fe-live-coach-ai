'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { listAudioInputDevices, requestMicrophoneStream, isExternalMic } from '@/lib/audio/devices';
import { createLevelMeter, type LevelMeter } from '@/lib/audio/level-meter';
import type { AudioInputDevice } from '@/lib/audio/devices';

export default function DiagnosticsPage() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [testing, setTesting] = useState(false);
  const [stats, setStats] = useState<{
    label: string; deviceId: string; sampleRate: number; channelCount: number;
    echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean;
    level: number; peak: number; hasSignal: boolean; isExternal: boolean;
  } | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    listAudioInputDevices().then((list) => {
      setDevices(list);
      if (list[0]) setSelectedId(list[0].deviceId);
    });

    const onChange = () => {
      listAudioInputDevices().then((list) => {
        setDevices(list);
        addLog(`Device list changed — ${list.length} mic(s) detected`);
      });
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [addLog]);

  function stopTest() {
    cancelAnimationFrame(rafRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    meterRef.current?.destroy();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    streamRef.current = null; ctxRef.current = null; meterRef.current = null;
    setTesting(false);
    setStats(null);
    addLog('Test stopped');
  }

  async function startTest() {
    if (testing) { stopTest(); return; }
    try {
      addLog(`Requesting mic: ${devices.find(d => d.deviceId === selectedId)?.label ?? selectedId}`);
      const stream = await requestMicrophoneStream(selectedId || undefined);
      streamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      const s = track.getSettings();
      const device = devices.find(d => d.deviceId === selectedId) ?? devices[0];

      addLog(`Stream acquired — sampleRate=${s.sampleRate}Hz channels=${s.channelCount} ec=${s.echoCancellation} ns=${s.noiseSuppression} agc=${s.autoGainControl}`);

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const meter = createLevelMeter(stream, ctx);
      meterRef.current = meter;

      setTesting(true);

      // Waveform canvas loop
      function drawWaveform() {
        rafRef.current = requestAnimationFrame(drawWaveform);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const c = canvas.getContext('2d');
        if (!c) return;
        const w = canvas.width; const h = canvas.height;
        c.clearRect(0, 0, w, h);
        const waveform = meter.getWaveform();
        const peak = meter.getPeak();
        const color = peak > 0.9 ? '#ef4444' : peak > 0.6 ? '#f59e0b' : '#22c55e';
        c.strokeStyle = color;
        c.lineWidth = 1.5;
        c.beginPath();
        const step = w / waveform.length;
        for (let i = 0; i < waveform.length; i++) {
          const x = i * step;
          const y = (waveform[i] * 0.5 + 0.5) * h;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
        if (peak > 0.9) {
          c.fillStyle = 'rgba(239,68,68,0.2)';
          c.fillRect(0, 0, w, h);
          c.fillStyle = '#ef4444';
          c.font = 'bold 10px monospace';
          c.fillText('CLIPPING', 4, 14);
        }
      }
      drawWaveform();

      // Stats poll
      pollRef.current = setInterval(() => {
        const level = meter.getLevel();
        const peak = meter.getPeak();
        setStats({
          label: track.label,
          deviceId: s.deviceId ?? '',
          sampleRate: s.sampleRate ?? 0,
          channelCount: s.channelCount ?? 0,
          echoCancellation: s.echoCancellation ?? false,
          noiseSuppression: s.noiseSuppression ?? false,
          autoGainControl: s.autoGainControl ?? false,
          level, peak,
          hasSignal: meter.hasSignal(),
          isExternal: device ? isExternalMic(device) : false,
        });
      }, 150);

    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const levelPct = Math.round((stats?.level ?? 0) * 100);
  const peakPct = Math.round((stats?.peak ?? 0) * 100);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Audio Diagnostics</h2>
        <p className="text-sm text-slate-500 mt-1">Test your microphone before a live call</p>
      </div>

      {/* Device selector + test button */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">Microphone Selection</h3>
        <div className="flex gap-3 flex-wrap">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={testing}
            className="flex-1 min-w-0 h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-300 focus:outline-none focus:border-[rgba(212,175,55,0.4)] disabled:opacity-50"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {isExternalMic(d) ? '🔌 ' : '💻 '}{d.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => void startTest()}
            className="h-10 px-5 rounded-lg font-semibold text-sm transition-all"
            style={testing
              ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }
              : { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }
            }
          >
            {testing ? '■ Stop Test' : '▶ Start Test'}
          </button>
        </div>

        {/* All detected devices */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{devices.length} device{devices.length !== 1 ? 's' : ''} detected</p>
          {devices.map((d) => (
            <div key={d.deviceId} className="flex items-center gap-2 text-xs text-slate-400 px-2 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <span>{isExternalMic(d) ? '🔌' : '💻'}</span>
              <span className="flex-1 truncate">{d.label}</span>
              {isExternalMic(d) && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(212,175,55,0.12)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.25)' }}>
                  PREFERRED
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Live stats */}
      {testing && stats && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Live Stats</h3>

          {/* Waveform */}
          <canvas ref={canvasRef} width={600} height={60} className="w-full rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />

          {/* Level bars */}
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>RMS Level</span><span>{levelPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-75"
                  style={{ width: `${levelPct}%`, background: levelPct > 90 ? '#ef4444' : levelPct > 60 ? '#f59e0b' : '#22c55e' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Peak</span><span>{peakPct}%{peakPct > 90 ? ' ⚠ CLIPPING' : ''}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-75"
                  style={{ width: `${peakPct}%`, background: peakPct > 90 ? '#ef4444' : '#D4AF37' }} />
              </div>
            </div>
          </div>

          {/* Signal status */}
          <div className={`text-sm font-semibold px-3 py-2 rounded-xl ${stats.hasSignal ? 'text-green-400' : 'text-amber-400'}`}
            style={{ background: stats.hasSignal ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)' }}>
            {stats.hasSignal ? '✓ Signal detected — mic is working' : '⚠ No signal yet — speak into the mic'}
          </div>

          {/* Device properties grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Sample Rate', value: `${stats.sampleRate.toLocaleString()} Hz` },
              { label: 'Channels', value: stats.channelCount === 1 ? 'Mono' : `${stats.channelCount}ch` },
              { label: 'Type', value: stats.isExternal ? '🔌 External' : '💻 Built-in' },
              { label: 'Echo Cancel', value: stats.echoCancellation ? '⚠ ON' : '✓ OFF', warn: stats.echoCancellation },
              { label: 'Noise Suppress', value: stats.noiseSuppression ? '⚠ ON' : '✓ OFF', warn: stats.noiseSuppression },
              { label: 'Auto Gain', value: stats.autoGainControl ? '⚠ ON' : '✓ OFF', warn: stats.autoGainControl },
            ].map(({ label, value, warn }) => (
              <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-sm font-semibold ${warn ? 'text-amber-400' : 'text-slate-200'}`}>{value}</p>
              </div>
            ))}
          </div>

          {warn(stats) && (
            <div className="text-xs text-amber-400 p-3 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              ⚠ Echo cancellation or noise suppression is ON. These can suppress the customer&apos;s voice
              coming from your phone speaker. If transcription misses the customer, check your browser or OS audio settings.
            </div>
          )}
        </div>
      )}

      {/* Event log */}
      {log.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">Event Log</h3>
            <button onClick={() => setLog([])} className="text-xs text-slate-600 hover:text-slate-400">Clear</button>
          </div>
          <div className="font-mono text-[11px] text-slate-500 space-y-0.5 max-h-48 overflow-y-auto">
            {log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function warn(stats: { echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean }) {
  return stats.echoCancellation || stats.noiseSuppression || stats.autoGainControl;
}
