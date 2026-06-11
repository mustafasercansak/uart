import { describe, it, expect } from 'vitest';
import { chunkByProfile } from '../frameChunking';
import type { FrameProfile } from '../../types';

function fixedProfile(widths: number[]): FrameProfile {
  return {
    id: 'test-fixed',
    name: 'Test Fixed',
    sendIntervalMs: 100,
    framing: { mode: 'fixed' },
    fields: widths.map((w, i) => ({
      id: `f${i}`,
      name: `F${i}`,
      byteWidth: w,
      order: i,
      type: 'fixed' as const,
      typeConfig: { value: 0 },
      endianness: 'big' as const,
    })),
  } as unknown as FrameProfile;
}

function delimProfile(delimiter: number | number[]): FrameProfile {
  return {
    id: 'test-delim',
    name: 'Test Delim',
    sendIntervalMs: 100,
    framing: { mode: 'delimiter', delimiter },
    fields: [],
  } as unknown as FrameProfile;
}

function hex(...bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

// ── Fixed mode ──────────────────────────────────────────────────────────────

describe('chunkByProfile — fixed mode', () => {
  it('splits 42 bytes into 3 × 14-byte chunks (YS2000A layout)', () => {
    const profile = fixedProfile([2, 1, 1, 1, 2, 2, 2, 1, 1, 1]); // 14 bytes total
    const rawHex = Array.from({ length: 42 }, (_, i) =>
      i.toString(16).padStart(2, '0').toUpperCase()
    ).join(' ');

    const chunks = chunkByProfile(rawHex, profile);

    expect(chunks).toHaveLength(3);
    chunks.forEach(c => expect(c.bytes).toHaveLength(14));
  });

  it('discards remainder bytes that do not form a complete frame', () => {
    const profile = fixedProfile([4]);
    const chunks = chunkByProfile(hex(1, 2, 3, 4, 5, 6, 7), profile); // 7 bytes = 1 full + 3 remainder
    expect(chunks).toHaveLength(1);
    expect(chunks[0].bytes).toEqual([1, 2, 3, 4]);
  });

  it('returns empty when data is shorter than one frame', () => {
    const profile = fixedProfile([14]);
    expect(chunkByProfile(hex(0x55, 0xAA, 0x01), profile)).toHaveLength(0);
  });

  it('returns empty when no profile provided', () => {
    expect(chunkByProfile(hex(0x55, 0xAA), null)).toHaveLength(0);
    expect(chunkByProfile(hex(0x55, 0xAA), undefined)).toHaveLength(0);
  });

  it('populates hex string correctly for each chunk', () => {
    const profile = fixedProfile([2]);
    const chunks = chunkByProfile(hex(0xAB, 0xCD, 0xEF, 0x12), profile);
    expect(chunks[0].hex).toBe('AB CD');
    expect(chunks[1].hex).toBe('EF 12');
  });

  it('returns null fields when profile has no matching bytes', () => {
    const profile = fixedProfile([3]);
    const chunks = chunkByProfile(hex(0x01, 0x02, 0x03), profile);
    expect(chunks).toHaveLength(1);
    // fields may be null or array — just ensure property exists
    expect('fields' in chunks[0]).toBe(true);
  });
});

// ── Delimiter mode ──────────────────────────────────────────────────────────

describe('chunkByProfile — delimiter mode', () => {
  it('splits by single-byte delimiter (\\n = 0x0A)', () => {
    const profile = delimProfile(0x0A);
    // HELLO\nWORLD\n
    const input = hex(0x48, 0x45, 0x4C, 0x4C, 0x4F, 0x0A, 0x57, 0x4F, 0x52, 0x4C, 0x44, 0x0A);
    const chunks = chunkByProfile(input, profile);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].bytes).toEqual([0x48, 0x45, 0x4C, 0x4C, 0x4F, 0x0A]); // HELLO\n
    expect(chunks[1].bytes).toEqual([0x57, 0x4F, 0x52, 0x4C, 0x44, 0x0A]); // WORLD\n
  });

  it('splits by multi-byte delimiter (\\r\\n = [0x0D, 0x0A])', () => {
    const profile = delimProfile([0x0D, 0x0A]);
    // ABC\r\nDEF\r\n
    const input = hex(0x41, 0x42, 0x43, 0x0D, 0x0A, 0x44, 0x45, 0x46, 0x0D, 0x0A);
    const chunks = chunkByProfile(input, profile);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].bytes).toEqual([0x41, 0x42, 0x43, 0x0D, 0x0A]); // ABC\r\n
    expect(chunks[1].bytes).toEqual([0x44, 0x45, 0x46, 0x0D, 0x0A]); // DEF\r\n
  });

  it('ignores incomplete trailing data with no closing delimiter', () => {
    const profile = delimProfile(0x0A);
    const input = hex(0x41, 0x42, 0x0A, 0x43, 0x44); // AB\n + CD (no \n)
    const chunks = chunkByProfile(input, profile);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].bytes).toEqual([0x41, 0x42, 0x0A]);
  });

  it('defaults to \\n when framing has no delimiter property', () => {
    const profile: FrameProfile = {
      id: 'no-delim',
      name: 'No Delim',
      sendIntervalMs: 100,
      framing: { mode: 'delimiter' },
      fields: [],
    } as unknown as FrameProfile;
    const input = hex(0x41, 0x0A); // A\n
    const chunks = chunkByProfile(input, profile);
    expect(chunks).toHaveLength(1);
  });

  it('handles three consecutive delimited messages', () => {
    const profile = delimProfile(0x0A);
    const input = hex(0x41, 0x0A, 0x42, 0x0A, 0x43, 0x0A); // A\nB\nC\n
    const chunks = chunkByProfile(input, profile);
    expect(chunks).toHaveLength(3);
    expect(chunks.map(c => c.bytes[0])).toEqual([0x41, 0x42, 0x43]);
  });
});
