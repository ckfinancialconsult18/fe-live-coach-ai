'use client';

import { createLevelMeter, type LevelMeter } from '@/lib/audio/level-meter';

// ─────────────────────────────────────────────────────────────────────────────
// Audio Input Manager
//
// One abstraction for "where does call audio come from". A mode declares its
// sources; the manager acquires them, mixes them into a single MediaStream via
// the Web Audio API, and hands that stream to the (unchanged) transcription
// pipeline: MediaRecorder → POST /api/transcribe → Deepgram → TranscriptLine[].
//
// Adding a new capture mode — including telephony providers (RingCentral,
// Zoom Phone, Teams, Twilio Voice) — means adding an AudioModeDefinition.
// A provider mode supplies the remote party's audio as a MediaStream through
// `acquireProviderStream` (e.g. the receiver track of a WebRTC RTCPeerConnection
// or a provider SDK's remote stream). Nothing downstream changes: every mode
// produces one mixed MediaStream and the same transcript format.
// ─────────────────────────────────────────────────────────────────────────────

export type AudioSourceKind = 'microphone' | 'system_audio' | 'provider';

export interface AudioProcessingConstraints {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface AudioModeDefinition {
  id: string;
  label: string;
  description: string;
  /** Browser audio processing applied to the microphone track in this mode. */
  micProcessing: AudioProcessingConstraints;
  /** Ask for system-audio loopback via getDisplayMedia (falls back to mic-only). */
  wantsSystemAudio: boolean;
  /** Run the quiet-customer heuristic (acoustic-pickup modes only). */
  detectQuietCustomer: boolean;
  /**
   * Future telephony hook: return the remote party's audio as a MediaStream
   * (WebRTC receiver track, provider SDK stream, …), or null if unavailable.
   * The manager mixes it exactly like any other source.
   */
  acquireProviderStream?: () => Promise<MediaStream | null>;
}

export const AUDIO_MODES: Record<string, AudioModeDefinition> = {
  iphone_speaker: {
    id: 'iphone_speaker',
    label: 'iPhone Speaker',
    description:
      'Phone on speaker next to the computer. The laptop mic acoustically picks up ' +
      'both your voice and the caller. All browser audio processing is disabled — ' +
      'echo cancellation and noise suppression would treat the phone audio as ' +
      'echo/noise and erase the customer.',
    micProcessing: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    wantsSystemAudio: false,
    detectQuietCustomer: true,
  },
  headset: {
    id: 'headset',
    label: 'Bluetooth / USB Headset',
    description:
      'Headset mic for your voice + system-audio capture for the caller. The two are ' +
      'mixed into one stream. Processing stays on for the close-talking headset mic ' +
      '(the caller arrives digitally, so nothing is erased). Falls back to mic-only ' +
      'if the browser cannot capture system audio.',
    micProcessing: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    wantsSystemAudio: true,
    detectQuietCustomer: false,
  },
};

export const DEFAULT_MODE_ID = 'iphone_speaker';

export interface AudioInputWarning {
  code: 'system_audio_unavailable' | 'customer_too_quiet' | 'source_lost';
  message: string;
}

export interface ActiveSourceInfo {
  kind: AudioSourceKind;
  label: string;
  readyState: MediaStreamTrackState;
  muted: boolean;
  enabled: boolean;
  level: number; // 0-1 RMS
}

export interface AudioInputDiagnostics {
  modeId: string;
  running: boolean;
  mixedLevel: number;
  sources: ActiveSourceInfo[];
}

interface ActiveSource {
  kind: AudioSourceKind;
  label: string;
  stream: MediaStream;
  meter: LevelMeter;
  /** Whether session.stop() should stop this source's tracks (mic is owned by useMicrophone). */
  ownsTracks: boolean;
}

// ── Quiet-customer heuristic ─────────────────────────────────────────────────
// With a single mono mic there is no true local diarization; this is an
// energy-band heuristic, documented as such. The agent (at the mic) produces
// loud bursts; a phone speaker across the desk produces faint ones. We track
// burst peaks over a rolling window and warn when the faint tier dominates or
// everything is quiet.
const SAMPLE_MS = 150;
const NOISE_FLOOR = 0.008;
const EVAL_WINDOW_MS = 30_000;
const WARN_COOLDOWN_MS = 60_000;
const MIN_SESSION_MS_BEFORE_WARN = 20_000;

export const QUIET_CUSTOMER_RECOMMENDATION =
  'Customer audio is very quiet. Move the phone closer to the computer microphone ' +
  'or increase the phone speaker volume.';

class QuietCustomerMonitor {
  private burstPeaks: { peak: number; at: number }[] = [];
  private currentBurstPeak = 0;
  private inBurst = false;
  private startedAt = Date.now();
  private lastWarnAt = 0;

  sample(level: number) {
    const now = Date.now();
    if (level > NOISE_FLOOR) {
      this.inBurst = true;
      this.currentBurstPeak = Math.max(this.currentBurstPeak, level);
    } else if (this.inBurst) {
      this.burstPeaks.push({ peak: this.currentBurstPeak, at: now });
      this.inBurst = false;
      this.currentBurstPeak = 0;
    }
    this.burstPeaks = this.burstPeaks.filter((b) => now - b.at < EVAL_WINDOW_MS);
  }

  /** Returns a warning message when the heuristic fires, else null. */
  evaluate(): string | null {
    const now = Date.now();
    if (now - this.startedAt < MIN_SESSION_MS_BEFORE_WARN) return null;
    if (now - this.lastWarnAt < WARN_COOLDOWN_MS) return null;
    if (this.burstPeaks.length < 2) return null;

    const loudest = Math.max(...this.burstPeaks.map((b) => b.peak));
    // Everything faint — mic is far from all audio, or speaker volume is low.
    if (loudest < 0.03) {
      this.lastWarnAt = now;
      return QUIET_CUSTOMER_RECOMMENDATION;
    }
    // Two-band split: strong bursts ≈ agent at the mic; faint bursts ≈ the
    // phone speaker. Warn when faint bursts exist but sit near the noise floor.
    const faint = this.burstPeaks.filter((b) => b.peak < loudest * 0.15);
    const medium = this.burstPeaks.filter((b) => b.peak >= loudest * 0.15 && b.peak < loudest * 0.4);
    if (faint.length >= 3 && medium.length === 0) {
      this.lastWarnAt = now;
      return QUIET_CUSTOMER_RECOMMENDATION;
    }
    return null;
  }
}

// ── System audio (loopback) ──────────────────────────────────────────────────

async function acquireSystemAudio(): Promise<MediaStream | null> {
  if (typeof navigator?.mediaDevices?.getDisplayMedia !== 'function') return null;
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true, // required by most browsers to show the picker
      audio: true,
    });
    display.getVideoTracks().forEach((t) => t.stop()); // audio only
    const audioTracks = display.getAudioTracks();
    console.log('[audio-input] system audio tracks:', audioTracks.length,
      '| labels:', audioTracks.map((t) => t.label).join(', ') || 'none');
    return audioTracks.length > 0 ? display : null;
  } catch (err) {
    console.warn('[audio-input] getDisplayMedia cancelled or unavailable:',
      err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Session ──────────────────────────────────────────────────────────────────

export class AudioInputSession {
  readonly mode: AudioModeDefinition;
  /** The single mixed stream every mode produces — feed this to the recorder. */
  readonly stream: MediaStream;

  private ctx: AudioContext;
  private sources: ActiveSource[];
  private mixedMeter: LevelMeter;
  private monitor: QuietCustomerMonitor | null;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private onWarning: (w: AudioInputWarning) => void;
  private stopped = false;

  constructor(
    mode: AudioModeDefinition,
    ctx: AudioContext,
    mixedStream: MediaStream,
    sources: ActiveSource[],
    onWarning: (w: AudioInputWarning) => void,
  ) {
    this.mode = mode;
    this.ctx = ctx;
    this.stream = mixedStream;
    this.sources = sources;
    this.onWarning = onWarning;
    this.mixedMeter = createLevelMeter(mixedStream, ctx);
    this.monitor = mode.detectQuietCustomer ? new QuietCustomerMonitor() : null;

    for (const s of sources) {
      for (const track of s.stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (this.stopped) return;
          console.error(`[audio-input] source lost: ${s.kind} "${track.label}" ended`);
          this.onWarning({
            code: 'source_lost',
            message: s.kind === 'system_audio'
              ? 'System audio sharing stopped — the customer side is no longer being captured. Recording continues from the microphone only.'
              : `Audio source "${s.label}" disconnected.`,
          });
        });
      }
    }

    this.sampleTimer = setInterval(() => {
      if (this.stopped || !this.monitor) return;
      const micSource = this.sources.find((s) => s.kind === 'microphone');
      if (!micSource) return;
      this.monitor.sample(micSource.meter.getLevel());
      const warning = this.monitor.evaluate();
      if (warning) {
        console.warn('[audio-input] quiet-customer heuristic fired:', warning);
        this.onWarning({ code: 'customer_too_quiet', message: warning });
      }
    }, SAMPLE_MS);
  }

  getDiagnostics(): AudioInputDiagnostics {
    return {
      modeId: this.mode.id,
      running: !this.stopped && this.ctx.state === 'running',
      mixedLevel: this.stopped ? 0 : this.mixedMeter.getLevel(),
      sources: this.sources.map((s) => {
        const track = s.stream.getAudioTracks()[0];
        return {
          kind: s.kind,
          label: s.label,
          readyState: track?.readyState ?? 'ended',
          muted: track?.muted ?? true,
          enabled: track?.enabled ?? false,
          level: this.stopped ? 0 : s.meter.getLevel(),
        };
      }),
    };
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    this.mixedMeter.destroy();
    for (const s of this.sources) {
      s.meter.destroy();
      if (s.ownsTracks) s.stream.getTracks().forEach((t) => t.stop());
    }
    if (this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    console.log('[audio-input] session stopped — mode:', this.mode.id);
  }
}

/**
 * Acquires all sources a mode wants, mixes them into one MediaStream, and
 * returns the running session. The mic stream is passed in (owned by
 * useMicrophone — device selection, health, permission UI live there).
 */
export async function startAudioSession(
  mode: AudioModeDefinition,
  micStream: MediaStream,
  onWarning: (w: AudioInputWarning) => void,
): Promise<AudioInputSession> {
  const ctx = new AudioContext();
  // A suspended AudioContext outputs pure silence — resume before recording.
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (err) {
      console.error('[audio-input] AudioContext resume() failed:', err);
    }
  }
  ctx.onstatechange = () => {
    console.warn(`[audio-input] AudioContext state → ${ctx.state}` +
      (ctx.state !== 'running' ? ' — the mixed stream is SILENT until it is running again' : ''));
  };

  const sources: ActiveSource[] = [{
    kind: 'microphone',
    label: micStream.getAudioTracks()[0]?.label || 'Microphone',
    stream: micStream,
    meter: createLevelMeter(micStream, ctx),
    ownsTracks: false, // useMicrophone owns and stops the mic tracks
  }];

  if (mode.wantsSystemAudio) {
    const sys = await acquireSystemAudio();
    if (sys) {
      sources.push({
        kind: 'system_audio',
        label: sys.getAudioTracks()[0]?.label || 'System audio',
        stream: sys,
        meter: createLevelMeter(sys, ctx),
        ownsTracks: true,
      });
    } else {
      onWarning({
        code: 'system_audio_unavailable',
        message: 'System audio capture is unavailable (cancelled, or the shared source has no audio). ' +
          'Continuing with microphone only — the customer will only be heard if the mic can pick them up.',
      });
    }
  }

  if (mode.acquireProviderStream) {
    const provider = await mode.acquireProviderStream();
    if (provider && provider.getAudioTracks().length > 0) {
      sources.push({
        kind: 'provider',
        label: provider.getAudioTracks()[0]?.label || 'Call audio',
        stream: provider,
        meter: createLevelMeter(provider, ctx),
        ownsTracks: true,
      });
    }
  }

  // Mix every source into one destination stream.
  const dest = ctx.createMediaStreamDestination();
  for (const s of sources) {
    ctx.createMediaStreamSource(s.stream).connect(dest);
  }

  console.log(`[audio-input] session started — mode: ${mode.id} | AudioContext: ${ctx.state} | sources: ` +
    sources.map((s) => `${s.kind}("${s.label}")`).join(' + '));

  return new AudioInputSession(mode, ctx, dest.stream, sources, onWarning);
}
