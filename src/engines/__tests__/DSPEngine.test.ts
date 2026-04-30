import { describe, it, expect } from 'vitest';
import { DSPEngine } from '../DSPEngine';

describe('DSPEngine', () => {
    describe('fft', () => {
        it('calculates FFT for a simple DC signal', () => {
            const real = new Float32Array([1, 1, 1, 1, 0, 0, 0, 0]);
            const imag = new Float32Array(8).fill(0);
            
            // FFT should not throw and should modify arrays
            DSPEngine.fft(real, imag);
            
            // Bin 0 (DC) should have the sum: 4
            expect(real[0]).toBeCloseTo(4);
            expect(imag[0]).toBeCloseTo(0);
        });

        it('throws error for non-power-of-2 lengths', () => {
            const real = new Float32Array(7);
            const imag = new Float32Array(7);
            expect(() => DSPEngine.fft(real, imag)).toThrow('FFT length must be a power of 2');
        });
    });

    describe('applyWindow', () => {
        it('modifies signal with Hanning window', () => {
            const data = new Float32Array([1, 1, 1, 1]);
            DSPEngine.applyWindow(data, 'Hanning');
            // Hanning window starts and ends at 0
            expect(data[0]).toBeCloseTo(0);
            expect(data[3]).toBeCloseTo(0);
            expect(data[1]).toBeGreaterThan(0);
        });

        it('modifies signal with Hamming window', () => {
            const data = new Float32Array([1, 1, 1, 1]);
            DSPEngine.applyWindow(data, 'Hamming');
            // Hamming window doesn't go to zero at edges (0.54 - 0.46 = 0.08)
            expect(data[0]).toBeCloseTo(0.08);
            expect(data[3]).toBeCloseTo(0.08);
        });
    });

    describe('calculateMagnitude', () => {
        it('calculates magnitude in dB', () => {
            const real = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
            const imag = new Float32Array(8).fill(0);
            
            // Magnitude of 1 in a size 8 FFT: 1 / (8/2) = 0.25
            // dB = 20 * log10(0.25) ≈ -12.04
            const mag = DSPEngine.calculateMagnitude(real, imag);
            expect(mag[0]).toBeCloseTo(-12.04, 1);
        });
    });
});
