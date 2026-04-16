/**
 * DSPEngine.ts
 * High-performance digital signal processing tools for real-time analysis.
 */

export type WindowType = 'Rectangular' | 'Hamming' | 'Hanning';

export class DSPEngine {
  /**
   * Performs an in-place Radix-2 Decimation-in-Time FFT.
   * Total Complexity: O(N log N)
   */
  public static fft(real: Float32Array, imag: Float32Array) {
    const n = real.length;
    if ((n & (n - 1)) !== 0) throw new Error('FFT length must be a power of 2');

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n; i++) {
        if (i < j) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
        let m = n >> 1;
        while (m >= 1 && j >= m) {
            j -= m;
            m >>= 1;
        }
        j += m;
    }

    // Butterfly computations
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (2 * Math.PI) / len;
        const wlen_real = Math.cos(ang);
        const wlen_imag = -Math.sin(ang);

        for (let i = 0; i < n; i += len) {
            let w_real = 1;
            let w_imag = 0;
            for (let k = 0; k < len / 2; k++) {
                const u_real = real[i + k];
                const u_imag = imag[i + k];
                
                const v_idx = i + k + len / 2;
                const v_real = real[v_idx] * w_real - imag[v_idx] * w_imag;
                const v_imag = real[v_idx] * w_imag + imag[v_idx] * w_real;

                real[i + k] = u_real + v_real;
                imag[i + k] = u_imag + v_imag;
                real[v_idx] = u_real - v_real;
                imag[v_idx] = u_imag - v_imag;

                const tmp_real = w_real * wlen_real - w_imag * wlen_imag;
                w_imag = w_real * wlen_imag + w_imag * wlen_real;
                w_real = tmp_real;
            }
        }
    }
  }

  /**
   * Applies a windowing function to reduce spectral leakage.
   */
  public static applyWindow(data: Float32Array, type: WindowType = 'Hanning') {
    const n = data.length;
    for (let i = 0; i < n; i++) {
      if (type === 'Hamming') {
        data[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
      } else if (type === 'Hanning') {
        data[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      }
    }
    return data;
  }

  /**
   * Calculates the magnitude of the FFT result in decibels (dB).
   */
  public static calculateMagnitude(real: Float32Array, imag: Float32Array): Float32Array {
    const n = real.length;
    const mag = new Float32Array(n / 2); // Nyquist limit
    for (let i = 0; i < n / 2; i++) {
      const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / (n / 2);
      // Convert to dB scale, capped at -100dB
      mag[i] = 20 * Math.log10(Math.max(magnitude, 1e-5));
    }
    return mag;
  }
}
