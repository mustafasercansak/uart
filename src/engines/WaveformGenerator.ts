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
  const t = (timeMs % period) / period; // 0 to 1 within current cycle

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
