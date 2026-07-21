'use client';

import { useEffect, useRef } from 'react';
import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';
import type { ConnectionState, TranscriptionMode } from '@/hooks/useDeepgramTranscription';

interface Props {
  mic: UseMicrophoneReturn;
  connectionState: ConnectionState;
  transcriptionMode?: TranscriptionMode | null;
}

const HEALTH_LABEL: Record<string, { label: string; color: string }> = {
  idle:         { label: 'Not started',       color: '#64748b' },
  healthy:      { label: 'Healthy',            color: '#22c55e' },
  silent:       { label: 'No audio detected', color: '#f59e0b' },
  muted:        { label: 'Muted by OS',        color: '#f59e0b' },
  disconnected: { label: 'Disconnected',       color: '#ef4444' },
  error:        { label: 'Microphone error',   color: '#ef4444' },
};

const CONNECTION_LABEL: Record<ConnectionState, { label: string; color: string }> = {
  idle:         { label: 'Idle',                color: '#64748b' },
  connecting:   { label: 'Connecting…',         color: '#D4AF37' },
  connected:    { label: 'Live',                color: '#22c55e' },
  reconnecting: { label: 'Reconnecting…',       color: '#f59e0b' },
  failed:       { label: 'Connection failed',   color: '#ef4444' },
};

// ── Animated waveform canvas ──────────────────────────────────────────────────

function WaveformCanvas({ getWaveform, level, active }: {
  getWaveform: () => Float32Array | null;
  level: number;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const waveform = getWaveform();
      const isClipping = level > 0.9;
      const color = isClipping ? '#ef4444' : level > 0.6 ? '#f59e0b' : '#22c55e';

      if (waveform && waveform.length > 0) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const step = w / waveform.length;
        for (let i = 0; i < waveform.length; i++) {
          const x = i * step;
          const y = (waveform[i] * 0.5 + 0.5) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        // Flat line when no signal
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }

      // Clipping indicator flash
      if (isClipping) {
        ctx.fillStyle = 'rgba(239,68,68,0.15)';
        ctx.fillRect(0, 0, w, h);
      }
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, getWaveform, level]);

  return (
    <canvas
      ref={canvasRef}
      width={100}
      height={24}
      className="rounded"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      title={`Mic level: ${Math.round(level * 100)}%${level > 0.9 ? ' — CLIPPING' : ''}`}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MicrophoneControls({ mic, connectionState, transcriptionMode }: Props) {
  const health = HEALTH_LABEL[mic.health] ?? HEALTH_LABEL.idle;
  const connection = CONNECTION_LABEL[connectionState];
  const isActive = mic.health !== 'idle' && mic.health !== 'error';

  // Auto-dismiss hot-plug notification after 5s
  useEffect(() => {
    if (!mic.hotPlugNotification) return;
    const t = setTimeout(() => mic.clearHotPlugNotification(), 5000);
    return () => clearTimeout(t);
  }, [mic.hotPlugNotification, mic.clearHotPlugNotification]);

  if (mic.permissionState === 'denied') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-400">
        <span>🎙️</span>
        Microphone access denied. Enable it in your browser&apos;s site settings and reload.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Hot-plug notification */}
      {mic.hotPlugNotification && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
          🔌 {mic.hotPlugNotification}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {/* Device selector */}
        <select
          value={mic.selectedDeviceId ?? ''}
          onChange={(e) => mic.selectDevice(e.target.value)}
          className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-[rgba(212,175,55,0.4)] max-w-[180px]"
          title="Microphone input"
        >
          {mic.devices.length === 0 && <option value="">No microphones found</option>}
          {mic.devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>

        {/* Waveform canvas */}
        <WaveformCanvas getWaveform={mic.getWaveform} level={mic.level} active={isActive} />

        {/* Mic health */}
        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: health.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: health.color }} />
          {health.label}
        </span>

        {/* Connection state */}
        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: connection.color }}>
          <span
            className={`w-1.5 h-1.5 rounded-full ${connectionState === 'connected' ? 'animate-live' : ''}`}
            style={{ background: connection.color }}
          />
          {connection.label}
        </span>

        {/* Transcription mode badge */}
        {transcriptionMode && (
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
            style={
              transcriptionMode === 'deepgram'
                ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.25)' }
                : { background: 'rgba(212,175,55,0.1)', color: '#D4AF37', borderColor: 'rgba(212,175,55,0.25)' }
            }
            title={
              transcriptionMode === 'deepgram'
                ? 'Deepgram Nova-3 — streaming speech-to-text with speaker diarization'
                : 'Deepgram unavailable — using browser Web Speech API (Chrome/Edge built-in)'
            }
          >
            {transcriptionMode === 'deepgram' ? 'Deepgram Nova-3' : 'Web Speech API'}
          </span>
        )}
      </div>
    </div>
  );
}
