export interface LevelMeter {
  /** Current RMS level, 0-1. */
  getLevel: () => number;
  /** Current peak level in the last analysis window, 0-1. */
  getPeak: () => number;
  /** True if the analyser has seen any non-silent samples since creation. */
  hasSignal: () => boolean;
  destroy: () => void;
}

const SILENCE_THRESHOLD = 0.01;

/**
 * Real-time audio level metering via Web Audio AnalyserNode — used for the
 * mic level meter, mic-health detection (silent/dead input), and as the
 * energy signal feeding the diarization heuristic in lib/audio/diarization.ts.
 */
export function createLevelMeter(stream: MediaStream, audioContext: AudioContext): LevelMeter {
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  let everHadSignal = false;

  function sample() {
    analyser.getFloatTimeDomainData(buffer);
    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i];
      sumSquares += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    if (rms > SILENCE_THRESHOLD) everHadSignal = true;
    return { rms, peak };
  }

  return {
    getLevel: () => sample().rms,
    getPeak: () => sample().peak,
    hasSignal: () => everHadSignal,
    destroy: () => {
      try { source.disconnect(); } catch { /* already disconnected */ }
      try { analyser.disconnect(); } catch { /* already disconnected */ }
    },
  };
}
