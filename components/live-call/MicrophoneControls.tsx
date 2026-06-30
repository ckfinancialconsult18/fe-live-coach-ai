'use client';

import type { UseMicrophoneReturn } from '@/hooks/useMicrophone';
import type { ConnectionState } from '@/hooks/useRealtimeTranscription';

interface Props {
  mic: UseMicrophoneReturn;
  connectionState: ConnectionState;
}

const HEALTH_LABEL: Record<string, { label: string; color: string }> = {
  idle: { label: 'Not started', color: '#64748b' },
  healthy: { label: 'Healthy', color: '#22c55e' },
  silent: { label: 'No audio detected', color: '#f59e0b' },
  disconnected: { label: 'Device disconnected', color: '#ef4444' },
  error: { label: 'Microphone error', color: '#ef4444' },
};

const CONNECTION_LABEL: Record<ConnectionState, { label: string; color: string }> = {
  idle: { label: 'Idle', color: '#64748b' },
  connecting: { label: 'Connecting…', color: '#D4AF37' },
  connected: { label: 'Live', color: '#22c55e' },
  reconnecting: { label: 'Reconnecting…', color: '#f59e0b' },
  failed: { label: 'Connection failed', color: '#ef4444' },
};

export function MicrophoneControls({ mic, connectionState }: Props) {
  // 12-segment level meter, derived directly from the real mic.level signal.
  const meterBars = Math.round(Math.min(1, mic.level * 6) * 12);

  const health = HEALTH_LABEL[mic.health] ?? HEALTH_LABEL.idle;
  const connection = CONNECTION_LABEL[connectionState];

  if (mic.permissionState === 'denied') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-400">
        <span>🎙️</span>
        Microphone access denied. Enable it in your browser&apos;s site settings and reload.
      </div>
    );
  }

  return (
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

      {/* Level meter */}
      <div className="flex items-center gap-0.5" title={`Mic level: ${Math.round(mic.level * 100)}%`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="w-1 rounded-sm transition-colors"
            style={{
              height: 4 + i * 1.2,
              background: i < meterBars
                ? i < 7 ? '#22c55e' : i < 10 ? '#f59e0b' : '#ef4444'
                : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </div>

      {/* Mic health */}
      <span className="flex items-center gap-1.5 text-[10px]" style={{ color: health.color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: health.color }} />
        {health.label}
      </span>

      {/* Connection state */}
      <span className="flex items-center gap-1.5 text-[10px]" style={{ color: connection.color }}>
        <span className={`w-1.5 h-1.5 rounded-full ${connectionState === 'connected' ? 'animate-live' : ''}`} style={{ background: connection.color }} />
        {connection.label}
      </span>
    </div>
  );
}
