import { describe, expect, it } from 'vitest';
import {
  detectCANTraffic,
  detectUARTTraffic,
  estimateBaudRateFromBitDurations,
  estimateBaudRateFromTransitions,
  isLocked,
} from '../SmartListen';
import type { CANFrame } from '../../can/types/CANFrame';
import type { GeneratedFrame } from '../../types';

function frame(bytes: number[]): GeneratedFrame {
  return {
    uId: 'test',
    frameNumber: 1,
    timestampMs: 0,
    rawHex: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '),
    rawBytes: bytes,
    fields: [],
    errors: [],
  };
}

describe('SmartListen', () => {
  it('estimates common UART baud rates within a 5 percent margin', () => {
    const result = estimateBaudRateFromBitDurations(Array.from({ length: 40 }, () => 1000 / 115200));

    expect(result.baudRate).toBe(115200);
    expect(result.marginPercent).toBeLessThanOrEqual(5);
  });

  it('detects Modbus RTU from a valid CRC frame', () => {
    const result = detectUARTTraffic([frame([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a, 0xc5, 0xcd])], []);

    expect(result.protocol).toBe('modbus_rtu');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('detects UART when payload bytes are present without a Modbus signature', () => {
    const result = detectUARTTraffic([frame([0x55, 0xaa, 0x10, 0x20])], []);

    expect(result.protocol).toBe('uart');
  });

  it('falls back to UART when a long packet has no valid Modbus CRC', () => {
    const result = detectUARTTraffic([frame([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a, 0x00, 0x00])], []);

    expect(result.protocol).toBe('uart');
    expect(result.evidence).toContain('8 UART payload bytes observed');
  });

  it('distinguishes standard and extended CAN identifiers', () => {
    const standard = detectCANTraffic([
      { uid: '1', timestamp: 0, arbitrationId: 0x123, idFormat: 'standard', frameType: 'data', isRTR: false, dlc: 1, data: [0], crc: 0, errors: [], nodeId: 1, busLoadPercent: 0 },
    ] as CANFrame[], 500);
    const extended = detectCANTraffic(Array.from({ length: 10 }, (_, index) => ({
      uid: `2-${index}`,
      timestamp: index,
      arbitrationId: 0x18ff50e5 + index,
      idFormat: 'extended',
      frameType: 'data',
      isRTR: false,
      dlc: 1,
      data: [0],
      crc: 0,
      errors: [],
      nodeId: 1,
      busLoadPercent: 0,
    })) as CANFrame[], 250);

    expect(standard.protocol).toBe('can_standard');
    expect(extended.protocol).toBe('can_extended');
    expect(isLocked(extended)).toBe(true);
  });

  it('returns a waiting result when timing samples are missing', () => {
    const result = estimateBaudRateFromBitDurations([0, Number.NaN, -1]);

    expect(result).toMatchObject({
      protocol: 'unknown',
      baudRate: null,
      confidence: 0,
      marginPercent: null,
    });
    expect(isLocked(result)).toBe(false);
  });

  it('estimates baud from unsorted transitions and rejects weak lock margins', () => {
    const result = estimateBaudRateFromTransitions([
      { t: 1000 / 9600 * 3, v: 1 },
      { t: 0, v: 0 },
      { t: 1000 / 9600, v: 1 },
      { t: 1000 / 9600 * 2, v: 0 },
    ]);

    expect(result.baudRate).toBe(9600);
    expect(isLocked({ ...result, confidence: 0.69 })).toBe(false);
    expect(isLocked({ ...result, marginPercent: 6 })).toBe(false);
  });

  it('reports unknown CAN traffic while waiting for frames', () => {
    const result = detectCANTraffic([], undefined);

    expect(result.protocol).toBe('unknown');
    expect(result.baudRate).toBeNull();
    expect(result.marginPercent).toBeNull();
    expect(result.evidence).toEqual(['waiting for CAN frames']);
  });

  it('uses extended arbitration IDs even when idFormat is standard', () => {
    const result = detectCANTraffic([
      { uid: 'x', timestamp: 0, arbitrationId: 0x800, idFormat: 'standard', frameType: 'data', isRTR: false, dlc: 1, data: [0], crc: 0, errors: [], nodeId: 1, busLoadPercent: 0 },
      { uid: 'y', timestamp: 1, arbitrationId: 0x18ff50e5, idFormat: 'extended', frameType: 'data', isRTR: false, dlc: 1, data: [0], crc: 0, errors: [], nodeId: 1, busLoadPercent: 0 },
    ] as CANFrame[], 333);

    expect(result.protocol).toBe('can_extended');
    expect(result.baudRate).toBe(250000);
    expect(result.marginPercent).toBeGreaterThan(5);
    expect(isLocked(result)).toBe(false);
  });
});
