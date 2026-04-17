import type { WaveformConfig } from '../types';

// ─────────────────────────────────────────────
// WAVEFORM ÜRETICISI
// ─────────────────────────────────────────────

function gaussianNoise(): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

function ease(t: number, curve: string): number {
  switch (curve) {
    case 'ease-in': return t * t;
    case 'ease-out': return t * (2 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
}

export function generateWaveformSample(config: WaveformConfig, timeMs: number): number {
  const { shape, frequency, amplitude, offset, noiseLevel, customPoints } = config;
  const period = 1000 / frequency; // ms per cycle
  const t = ((timeMs % period) / period + (config.phase || 0)) % 1; // 0 to 1 with phase shift

  let value = 0;

  switch (shape) {
    case 'sine':
      value = Math.sin(2 * Math.PI * t) * amplitude;
      break;
    case 'triangle':
      value = amplitude * (2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1);
      break;
    case 'sawtooth':
      value = amplitude * (2 * (t - Math.floor(t + 0.5)));
      break;
    case 'square':
      value = amplitude * (t < 0.5 ? 1 : -1);
      break;
    case 'ecg': {
      // ── P-QRS-T Gaussian Model ───────────────
      const g = (x: number, pos: number, width: number, amp: number) => 
        amp * Math.exp(-Math.pow(x - pos, 2) / (2 * Math.pow(width, 2)));

      // Arrhythmia: ~3% chance per cycle a beat is "dropped" (PVC / skipped beat)
      const cycleIndex = Math.floor(timeMs / period);
      const arrhythmiaHash = ((cycleIndex * 2654435761) >>> 0) / 4294967296; // Knuth hash → 0-1
      const isSkippedBeat = arrhythmiaHash < 0.03;

      if (isSkippedBeat) {
        // Flat-line with slight noise (no QRS complex)
        value = 0;
      } else {
        const p  = g(t, 0.15, 0.02,  0.15);  // P wave
        const q  = g(t, 0.34, 0.005, -0.15);  // Q dip
        const r  = g(t, 0.36, 0.01,  1.0);    // R peak (dominant)
        const s  = g(t, 0.38, 0.01,  -0.3);   // S dip
        const st = g(t, 0.45, 0.05,  0.05);   // ST segment elevation
        const tw = g(t, 0.65, 0.05,  0.25);   // T wave

        value = (p + q + r + s + st + tw) * amplitude;
      }
      break;
    }
    case 'custom':
      if (customPoints && customPoints.length > 1) {
        const segLen = 1 / (customPoints.length - 1);
        const segIdx = Math.min(Math.floor(t / segLen), customPoints.length - 2);
        const segT = (t - segIdx * segLen) / segLen;
        value = customPoints[segIdx] + (customPoints[segIdx + 1] - customPoints[segIdx]) * segT;
      }
      break;
  }

  const noise = noiseLevel > 0 ? gaussianNoise() * noiseLevel : 0;
  return Math.round(offset + value + noise);
}

export { ease };

export function interpolateRamp(
  from: number,
  to: number,
  progress: number, // 0-1
  curve: string,
): number {
  const t = Math.max(0, Math.min(1, progress));
  const eased = ease(t, curve);
  return from + (to - from) * eased;
}
