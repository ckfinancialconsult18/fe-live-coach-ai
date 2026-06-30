import type { Speaker } from '@/lib/types';

/**
 * Heuristic (v1) speaker diarization for the single-mono-microphone setup
 * described in the live-call architecture: the agent's voice arrives close
 * to the laptop/USB mic, the prospect's voice arrives through a phone
 * speaker placed nearby — meaningfully quieter and more reverberant at the
 * mic. We classify each transcribed utterance by its peak audio energy
 * relative to a short calibration window captured at call start.
 *
 * This is an honest, real signal-derived classifier — not a coin flip, not
 * alternation — but it is NOT true ML speaker diarization (which would
 * require a provider like Deepgram/AssemblyAI with diarization support, or
 * an embedding-based speaker model). It will misclassify in edge cases:
 * a prospect on a loud speakerphone held close to the mic, or an agent
 * speaking softly. The architecture below is intentionally pluggable
 * (`SpeakerClassifier` interface) so a real diarization provider can replace
 * `EnergyHeuristicClassifier` later without touching call sites.
 */
export interface SpeakerClassifier {
  /** Record an energy sample (RMS, 0-1) for the duration of one utterance. */
  classify(avgEnergy: number, peakEnergy: number): { speaker: Speaker; confidence: number };
  /** Feed ambient/self-voice calibration samples captured before the call starts. */
  calibrate(sample: number): void;
  isCalibrated(): boolean;
}

const MIN_CALIBRATION_SAMPLES = 20;

export class EnergyHeuristicClassifier implements SpeakerClassifier {
  private calibrationSamples: number[] = [];
  private agentBaseline = 0;

  calibrate(sample: number) {
    if (sample > 0.005) this.calibrationSamples.push(sample);
  }

  isCalibrated() {
    return this.calibrationSamples.length >= MIN_CALIBRATION_SAMPLES;
  }

  private ensureBaseline() {
    if (this.agentBaseline > 0 || this.calibrationSamples.length === 0) return;
    const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
    // Median of calibration window — assumes the agent spoke a normal
    // greeting during calibration, so this approximates "agent at the mic."
    this.agentBaseline = sorted[Math.floor(sorted.length / 2)];
  }

  classify(avgEnergy: number, peakEnergy: number): { speaker: Speaker; confidence: number } {
    this.ensureBaseline();

    if (this.agentBaseline === 0) {
      // No calibration yet — fall back to an absolute threshold tuned for
      // "close mic" vs "far/through-speaker" energy, with low confidence.
      const speaker: Speaker = peakEnergy > 0.15 ? 'agent' : 'prospect';
      return { speaker, confidence: 35 };
    }

    const ratio = avgEnergy / this.agentBaseline;
    // Close to or above the agent's own calibrated volume → agent.
    // Meaningfully quieter (through a phone speaker) → prospect.
    const speaker: Speaker = ratio >= 0.65 ? 'agent' : 'prospect';
    const distanceFromThreshold = Math.abs(ratio - 0.65);
    const confidence = Math.round(Math.min(95, 50 + distanceFromThreshold * 120));
    return { speaker, confidence };
  }
}
