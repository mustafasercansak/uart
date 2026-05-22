import { describe, expect, it } from 'vitest';
import {
  computeCANCRC,
  encodeCANFrame,
  formatArbitrationId,
  j1939PgnName,
  parseCANFrame,
  parseJ1939Id,
} from '../CANFrameParser';
import { extractSignalValue, type DBCSignal } from '../../utils/dbcParser';
import type { CANFrameType } from '../../types/CANFrame';

const signal = (patch: Partial<DBCSignal>): DBCSignal => ({
  name: 'Signal',
  startBit: 0,
  length: 8,
  byteOrder: 'little_endian',
  isSigned: false,
  factor: 1,
  offset: 0,
  min: 0,
  max: 255,
  unit: '',
  receivers: ['ECU'],
  ...patch,
});

describe('CANFrameParser', () => {
  it('encodes and parses standard data frames', () => {
    const encoded = encodeCANFrame({
      arbitrationId: 0x321,
      idFormat: 'standard',
      frameType: 'data',
      isRTR: false,
      dlc: 3,
      data: [0xaa, 0xbb, 0xcc, 0xdd],
    });

    expect(encoded).toEqual([0x03, 0x21, 0x03, 0xaa, 0xbb, 0xcc]);
    expect(parseCANFrame(encoded)).toEqual({
      arbitrationId: 0x321,
      idFormat: 'standard',
      frameType: 'data',
      isRTR: false,
      dlc: 3,
      data: [0xaa, 0xbb, 0xcc],
      crc: computeCANCRC([0xaa, 0xbb, 0xcc], 0x321, 3, 'standard'),
      errors: [],
    });
  });

  it.each([
    ['remote', true, 0x10fef100],
    ['error', false, 0x00fef100],
    ['overload', false, 0x10fef100],
  ] as Array<[CANFrameType, boolean, number]>)('encodes and parses extended %s frames', (frameType, isRTR, parsedArbitrationId) => {
    const encoded = encodeCANFrame({
      arbitrationId: 0x00fef100,
      idFormat: 'extended',
      frameType,
      isRTR,
      dlc: 2,
      data: [0x01, 0x02],
    });

    expect(parseCANFrame(encoded)).toMatchObject({
      arbitrationId: parsedArbitrationId,
      idFormat: 'extended',
      frameType,
      isRTR,
      dlc: 2,
      data: [0x01, 0x02],
      errors: [],
    });
  });

  it('returns null for malformed raw frames', () => {
    expect(parseCANFrame([0x01, 0x02])).toBeNull();
    expect(parseCANFrame([0x01, 0x02])).toBeNull();
    expect(parseCANFrame([0x01, 0x02, 0x02, 0xff])).toBeNull();
    expect(parseCANFrame([0x01, 0x02, 0x09, 0, 1, 2, 3, 4, 5, 6, 7, 8])).toBeNull();
    expect(parseCANFrame([0x80, 0x00, 0x00])).toBeNull();
  });

  it('formats arbitration IDs by frame format', () => {
    expect(formatArbitrationId(0x7, 'standard')).toBe('0x007');
    expect(formatArbitrationId(0x18fef100, 'extended')).toBe('0x18FEF100');
  });

  it('decodes peer-to-peer and broadcast J1939 arbitration IDs', () => {
    expect(parseJ1939Id(0x0cfeca80)).toEqual({
      priority: 3,
      dataPage: 0,
      pgn: 0xfeca,
      pf: 0xfe,
      ps: 0xca,
      sourceAddress: 0x80,
      destinationAddress: undefined,
      isPeer2Peer: false,
    });

    expect(parseJ1939Id(0x19ea3344)).toEqual({
      priority: 6,
      dataPage: 1,
      pgn: 0x2ea00,
      pf: 0xea,
      ps: 0x33,
      sourceAddress: 0x44,
      destinationAddress: 0x33,
      isPeer2Peer: true,
    });
  });

  it('names known J1939 PGNs and formats unknown PGNs', () => {
    expect(j1939PgnName(0xfeca)).toBe('DM1 – Active DTCs');
    expect(j1939PgnName(0xf004)).toBe('Electronic Engine Controller 1');
    expect(j1939PgnName(0x123)).toBe('PGN 0x0123');
  });

  it('extracts Intel little-endian DBC signal values with scaling and signed values', () => {
    expect(extractSignalValue([0x34, 0x12], signal({ startBit: 0, length: 16, factor: 0.1, offset: -40 }))).toBe(426);
    expect(extractSignalValue([0xf0], signal({ startBit: 0, length: 8, isSigned: true }))).toBe(-16);
  });

  it('extracts Motorola big-endian DBC signal values', () => {
    expect(extractSignalValue([0xaa], signal({ startBit: 7, length: 8, byteOrder: 'big_endian' }))).toBe(85);
    expect(extractSignalValue([0xaa], signal({ startBit: 7, length: 8, byteOrder: 'big_endian', factor: 2, offset: 1 }))).toBe(171);
  });
});
