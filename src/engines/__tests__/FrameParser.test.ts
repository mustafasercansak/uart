import { describe, it, expect } from 'vitest';
import { parseFrame } from '../FrameParser';
import type { FrameProfile } from '../../types';

describe('FrameParser', () => {
  const mockProfile: FrameProfile = {
    id: 'test-profile',
    name: 'Test Profile',
    sendIntervalMs: 100,
    fields: [
      {
        id: 'header',
        name: 'HEADER',
        byteWidth: 2,
        order: 0,
        type: 'fixed',
        typeConfig: { value: 0xAAAA },
        endianness: 'big',
      },
      {
        id: 'value',
        name: 'VALUE',
        byteWidth: 2,
        order: 1,
        type: 'fixed',
        typeConfig: { value: 0 },
        endianness: 'little',
      },
    ],
  } as any;

  it('correctly parses bytes into fields', () => {
    const bytes = [0xAA, 0xAA, 0x34, 0x12];
    const parsed = parseFrame(mockProfile, bytes);

    expect(parsed).not.toBeNull();
    expect(parsed![0].name).toBe('HEADER');
    expect(parsed![0].decimal).toBe(0xAAAA);
    
    expect(parsed![1].name).toBe('VALUE');
    expect(parsed![1].decimal).toBe(0x1234); // Little endian: 34 12 -> 0x1234
    expect(parsed![1].hex).toBe('34 12');
  });

  it('returns null if bytes are insufficient', () => {
    const bytes = [0xAA, 0xAA, 0x34]; // Missing one byte
    const parsed = parseFrame(mockProfile, bytes);
    expect(parsed).toBeNull();
  });
});
