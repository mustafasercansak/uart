import { describe, it, expect } from 'vitest';
import { generateWaveformSample, interpolateRamp, ease } from '../WaveformGenerator';
import type { WaveformConfig } from '../../types';

describe('WaveformGenerator', () => {
  it('generates a sine wave sample correctly', () => {
    const config: WaveformConfig = {
      shape: 'sine',
      frequency: 1, // 1Hz = 1000ms period
      amplitude: 100,
      offset: 0,
      noiseLevel: 0
    };
    
    // At t=0, sin(0) = 0
    expect(generateWaveformSample(config, 0)).toBe(0);
    
    // At t=250ms (1/4 period), sin(pi/2) = 1 -> 100
    expect(generateWaveformSample(config, 250)).toBe(100);
    
    // At t=500ms (1/2 period), sin(pi) = 0
    expect(generateWaveformSample(config, 500)).toBe(0);
  });

  it('generates a square wave sample', () => {
    const config: WaveformConfig = {
      shape: 'square',
      frequency: 1,
      amplitude: 100,
      offset: 0,
      noiseLevel: 0
    };
    
    expect(generateWaveformSample(config, 100)).toBe(100); // 0 to 500ms is high
    expect(generateWaveformSample(config, 600)).toBe(-100); // 500 to 1000ms is low
  });

  it('handles ECG wave generation', () => {
    const config: WaveformConfig = {
      shape: 'ecg',
      frequency: 1, // 60 BPM
      amplitude: 1,
      offset: 0,
      noiseLevel: 0
    };
    
    const sample = generateWaveformSample(config, 1360); // Roughly the R peak in cycle 1 (to avoid skipped beat in cycle 0)
    expect(sample).toBeGreaterThan(0.5);
  });

  it('interpolates ramps correctly', () => {
    // Linear
    expect(interpolateRamp(0, 100, 0.5, 'linear')).toBe(50);
    // Boundary check
    expect(interpolateRamp(0, 100, 1.5, 'linear')).toBe(100);
    expect(interpolateRamp(0, 100, -0.5, 'linear')).toBe(0);
  });

  it('supports easing functions', () => {
    expect(ease(0.5, 'ease-in')).toBe(0.25); // t^2
    expect(ease(0.5, 'ease-out')).toBe(0.75); // t*(2-t)
  });

  it('interpolates custom points', () => {
    const config: WaveformConfig = {
      shape: 'custom',
      frequency: 1,
      amplitude: 1, // Not used but required
      offset: 0,
      noiseLevel: 0,
      customPoints: [0, 10, 0] // Triangle-like
    };
    
    expect(generateWaveformSample(config, 0)).toBe(0);
    expect(generateWaveformSample(config, 500)).toBe(10);
    expect(generateWaveformSample(config, 1000)).toBe(0);
  });
});
