import type { DBCDatabase, DBCSignal } from '../types/protocols/canbus';

/**
 * Extract a raw integer value from a CAN data byte array.
 *
 * Intel (little-endian, byteOrder='little'):
 *   startBit = LSB position. Bits are numbered: byte[0] = bits 0-7, byte[1] = 8-15, etc.
 *
 * Motorola (big-endian, byteOrder='big'):
 *   startBit = MSB position (same bit numbering as Intel).
 *   Traversal: within a byte go from bit down to 0 (MSB→LSB),
 *   then jump to MSB of the next higher-index byte.
 */
function extractRawValue(data: number[], signal: DBCSignal): number {
  let raw = 0;

  if (signal.byteOrder === 'little') {
    for (let i = 0; i < signal.bitLength; i++) {
      const bitPos = signal.startBit + i;
      const byteIdx = bitPos >> 3;
      const bitIdx = bitPos & 7;
      if (byteIdx < data.length) {
        raw |= ((data[byteIdx] >> bitIdx) & 1) << i;
      }
    }
  } else {
    // Motorola: startBit is the MSB
    let pos = signal.startBit;
    for (let i = 0; i < signal.bitLength; i++) {
      const byteIdx = pos >> 3;
      const bitIdx = pos & 7;
      if (byteIdx < data.length) {
        raw |= ((data[byteIdx] >> bitIdx) & 1) << (signal.bitLength - 1 - i);
      }
      // Advance: go down within byte, wrap to MSB of next byte
      if ((pos & 7) === 0) {
        pos += 15; // LSB of byte N → MSB of byte N+1
      } else {
        pos -= 1;
      }
    }
  }

  // Sign extension for signed signals
  if (signal.valueType === 'signed') {
    const signBit = 1 << (signal.bitLength - 1);
    if (raw & signBit) raw -= signBit << 1;
  }

  return raw;
}

/** Convert raw integer to physical value using scale/offset. */
export function decodeSignal(data: number[], signal: DBCSignal): number {
  const raw = extractRawValue(data, signal);
  const physical = raw * signal.scale + signal.offset;
  // Clamp to defined range if the range is meaningful
  if (signal.min !== signal.max) {
    return Math.max(signal.min, Math.min(signal.max, physical));
  }
  return physical;
}

/**
 * Decode all signals for a given CAN message ID.
 * Returns a map of signal name → physical value.
 */
export function decodeFrame(
  data: number[],
  msgId: number,
  db: DBCDatabase,
): Record<string, number> | null {
  const msg = db.messages.get(msgId);
  if (!msg) return null;
  const result: Record<string, number> = {};
  for (const sig of msg.signals) {
    result[sig.name] = decodeSignal(data, sig);
  }
  return result;
}

/**
 * Format a decoded signal value as a string, with unit and optional enum label.
 */
export function formatSignalValue(
  value: number,
  signal: DBCSignal,
): string {
  if (signal.valueTable) {
    const rawInt = Math.round((value - signal.offset) / signal.scale);
    const label = signal.valueTable[rawInt];
    if (label) return `${label} (${rawInt})`;
  }
  const decimals = signal.scale < 0.1 ? 3 : signal.scale < 1 ? 2 : 1;
  const formatted = value.toFixed(decimals);
  return signal.unit ? `${formatted} ${signal.unit}` : formatted;
}

/**
 * Generate realistic fake data bytes for a message,
 * driven by a time parameter so values oscillate naturally.
 */
export function generateRealisticData(
  msgId: number,
  db: DBCDatabase,
  t: number,
): number[] {
  const msg = db.messages.get(msgId);
  if (!msg) {
    return Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
  }

  const bytes = new Array(msg.dlc).fill(0);

  for (const sig of msg.signals) {
    // Pick a time-varying physical value within [min, max]
    const range = sig.max - sig.min || 100;
    const mid = (sig.max + sig.min) / 2 || 50;
    // Different signals oscillate at different rates
    const freq = 0.3 + (sig.startBit % 7) * 0.1;
    const physical = mid + (range / 2) * 0.7 * Math.sin(t * freq + sig.startBit);

    const rawFloat = (physical - sig.offset) / sig.scale;
    const maxRaw = (1 << sig.bitLength) - 1;
    const raw = Math.max(0, Math.min(maxRaw, Math.round(rawFloat)));

    // Pack raw value into bytes
    if (sig.byteOrder === 'little') {
      for (let i = 0; i < sig.bitLength; i++) {
        const bitPos = sig.startBit + i;
        const byteIdx = bitPos >> 3;
        const bitIdx = bitPos & 7;
        if (byteIdx < bytes.length) {
          if ((raw >> i) & 1) bytes[byteIdx] |= 1 << bitIdx;
          else bytes[byteIdx] &= ~(1 << bitIdx);
        }
      }
    } else {
      let pos = sig.startBit;
      for (let i = 0; i < sig.bitLength; i++) {
        const byteIdx = pos >> 3;
        const bitIdx = pos & 7;
        if (byteIdx < bytes.length) {
          if ((raw >> (sig.bitLength - 1 - i)) & 1) bytes[byteIdx] |= 1 << bitIdx;
          else bytes[byteIdx] &= ~(1 << bitIdx);
        }
        if ((pos & 7) === 0) pos += 15;
        else pos -= 1;
      }
    }
  }

  return bytes;
}
