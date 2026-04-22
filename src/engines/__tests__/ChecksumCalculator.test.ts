import { describe, it, expect } from 'vitest';
import { calculateChecksum } from '../ChecksumCalculator';
import type { ChecksumAlgorithm } from '../../types';

describe('ChecksumCalculator', () => {
  const data = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]; // "123456789"

  it('calculates XOR checksum correctly', () => {
    // XOR for "123456789": 0x31^0x32^0x33^0x34^0x35^0x36^0x37^0x38^0x39 = 0x31
    const result = calculateChecksum(data, { algorithm: 'xor' });
    expect(result).toEqual([0x31]);
  });

  it('calculates SUM_MOD256 checksum correctly', () => {
    const result = calculateChecksum(data, { algorithm: 'sum_mod256' });
    expect(result).toEqual([0xDD]);
  });

  it('calculates CRC8 correctly', () => {
    const result = calculateChecksum(data, { algorithm: 'crc8' });
    expect(result).toEqual([0xF4]);
  });

  it('calculates CRC16 CCITT correctly', () => {
    const result = calculateChecksum(data, { algorithm: 'crc16_ccitt' });
    expect(result).toEqual([0x29, 0xB1]);
  });

  it('calculates CRC16 Modbus correctly', () => {
    const result = calculateChecksum(data, { algorithm: 'crc16_modbus' });
    expect(result).toEqual([0x37, 0x4B]);
  });

  it('calculates CRC32 correctly', () => {
    const result = calculateChecksum(data, { algorithm: 'crc32' });
    expect(result).toEqual([0xCB, 0xF4, 0x39, 0x26]);
  });

  it('handles empty data', () => {
    const result = calculateChecksum([], { algorithm: 'xor' });
    expect(result).toEqual([0x00]);
  });

  it('handles custom CRC settings and unknown algorithms', () => {
    // Custom algorithm (ARC model)
    const result = calculateChecksum(data, { 
        algorithm: 'custom', 
        polynomial: 0x8005, 
        initialValue: 0x0000, 
        xorOut: 0x0000, 
        reflectIn: true, 
        reflectOut: true 
    });
    expect(result).toEqual([0xBB, 0x3D]);

    // Unknown algorithm
    expect(calculateChecksum(data, { algorithm: 'unknown' as unknown as ChecksumAlgorithm })).toEqual([0x00]);
  });
});
