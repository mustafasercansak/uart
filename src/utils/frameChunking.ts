import type { FrameProfile } from '../types';
import { parseFrame } from '../engines/FrameParser';
import type { ParsedField } from '../types';

export interface FrameChunk {
  hex: string;
  bytes: number[];
  fields: ParsedField[] | null;
}

/**
 * Splits a raw hex string into frame-sized chunks based on the selected profile's
 * framing configuration.
 *
 * - fixed mode  → splits every frameSize bytes (sum of field byteWidths)
 * - delimiter   → splits on single or multi-byte delimiter sequence
 * - no profile  → returns empty array (caller should use raw burst fallback)
 *
 * Remainder bytes that don't form a complete frame are discarded.
 */
export function chunkByProfile(
  rawHex: string,
  profile: FrameProfile | null | undefined
): FrameChunk[] {
  if (!profile?.framing) return [];

  const allBytes = rawHex.split(' ').map(h => parseInt(h, 16));
  const groups: number[][] = [];
  const framing = profile.framing;

  if (framing.mode === 'fixed') {
    const frameSize = profile.fields.reduce((sum, f) => sum + f.byteWidth, 0);
    if (frameSize > 0) {
      for (let i = 0; i + frameSize <= allBytes.length; i += frameSize) {
        groups.push(allBytes.slice(i, i + frameSize));
      }
    }
  } else if (framing.mode === 'delimiter') {
    const raw = framing.delimiter;
    const delim: number[] = Array.isArray(raw)
      ? raw
      : raw != null
      ? [raw]
      : [0x0a];

    let start = 0;
    for (let i = 0; i <= allBytes.length - delim.length; i++) {
      if (delim.every((b, di) => allBytes[i + di] === b)) {
        groups.push(allBytes.slice(start, i + delim.length));
        start = i + delim.length;
        i += delim.length - 1;
      }
    }
  }

  return groups.map(bytes => ({
    hex: bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
    bytes,
    fields: parseFrame(profile, bytes),
  }));
}
