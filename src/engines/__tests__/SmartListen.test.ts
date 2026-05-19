import { describe, expect, it } from 'vitest';
import {
  detectCANTraffic,
  detectUARTTraffic,
  estimateBaudRateFromBitDurations,
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
});
