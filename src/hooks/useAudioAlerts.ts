import { useRef, useCallback } from 'react';

/**
 * Generates a short synthetic beep using the Web Audio API.
 * No external libraries — pure browser AudioContext.
 */
export function useAudioAlerts() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Lazily create/resume the AudioContext (browsers require user gesture first)
  const getCtx = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  /**
   * Plays a short beep tone.
   * @param freq - Frequency in Hz (default 880 = A5, medical/industrial high-priority)
   * @param duration - Duration in seconds (default 0.12)
   * @param type - OscillatorType (default 'sine')
   * @param gain - Volume 0–1 (default 0.2 — subtle)
   */
  const beep = useCallback((
    freq = 880,
    duration = 0.12,
    type: OscillatorType = 'sine',
    gain = 0.2
  ) => {
    const ctx = getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Envelope: quick attack, smooth decay → professional, not jarring
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }, [getCtx]);

  /** High-priority alert (checksum / sync error) — dual-tone */
  const alertError = useCallback(() => {
    beep(1046, 0.08, 'square', 0.15); // C6
    setTimeout(() => beep(784, 0.14, 'square', 0.12), 90); // G5
  }, [beep]);

  /** Low-priority notification (threshold crossing) */
  const alertWarning = useCallback(() => {
    beep(660, 0.1, 'sine', 0.13); // E5
  }, [beep]);

  /** Confirmation / frame start click */
  const alertTick = useCallback(() => {
    beep(1200, 0.03, 'sine', 0.06);
  }, [beep]);

  return { beep, alertError, alertWarning, alertTick };
}
