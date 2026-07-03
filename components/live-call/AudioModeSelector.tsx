'use client';

import type { UseAudioInputReturn } from '@/hooks/useAudioInput';

const SOURCE_ICON: Record<string, string> = {
  microphone: '🎙️',
  system_audio: '🔊',
  provider: '📞',
};

/**
 * Capture-mode picker + live source diagnostics for the Audio Input Manager.
 * Shown next to MicrophoneControls in the live-call top bar. While a call is
 * live the selector locks and the per-source diagnostics take its place.
 */
export function AudioModeSelector({ audioInput }: { audioInput: UseAudioInputReturn }) {
  const activeMode = audioInput.modes.find((m) => m.id === audioInput.modeId);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={audioInput.modeId}
        onChange={(e) => audioInput.setModeId(e.target.value)}
        disabled={audioInput.isActive}
        className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-[rgba(212,175,55,0.4)] disabled:opacity-50 max-w-[190px]"
        title={activeMode?.description ?? 'Audio capture mode'}
      >
        {audioInput.modes.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>

      {/* Active source chips with live per-source level */}
      {audioInput.isActive && audioInput.diagnostics && (
        <div className="flex items-center gap-2">
          {audioInput.diagnostics.sources.map((s) => {
            const dead = s.readyState !== 'live' || s.muted;
            const bars = Math.round(Math.min(1, s.level * 6) * 5);
            return (
              <span
                key={`${s.kind}-${s.label}`}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border"
                style={dead
                  ? { color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }
                  : { color: '#94a3b8', borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}
                title={`${s.label} — ${s.readyState}${s.muted ? ', muted by OS' : ''} — level ${Math.round(s.level * 100)}%`}
              >
                <span>{SOURCE_ICON[s.kind] ?? '🎚️'}</span>
                {dead ? 'no signal' : (
                  <span className="flex items-end gap-px">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className="w-0.5 rounded-sm"
                        style={{ height: 3 + i * 1.5, background: i < bars ? '#22c55e' : 'rgba(255,255,255,0.12)' }}
                      />
                    ))}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Warning banner: quiet customer / system-audio fallback / lost source */}
      {audioInput.warning && (
        <span className="flex items-center gap-2 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2 py-1 max-w-[420px]">
          <span>⚠️</span>
          <span className="leading-snug">{audioInput.warning.message}</span>
          <button
            onClick={audioInput.dismissWarning}
            className="text-amber-400/70 hover:text-amber-200 shrink-0"
            title="Dismiss"
          >
            ✕
          </button>
        </span>
      )}
    </div>
  );
}
