import { describe, expect, it } from 'vitest';
import { dbcToProfileNodes, extractSignalValue, parseDBC, type DBCSignal } from '../dbcParser';
import { MEDICAL_PROFILE_COLORS } from '../../types/CANNode';

const makeSignal = (patch: Partial<DBCSignal>): DBCSignal => ({
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

describe('dbcParser', () => {
  it('parses standard messages, signals, multiplexing, and value tables', () => {
    const result = parseDBC(`
BO_ 256 ENGINE_STATUS: 8 ECU
 SG_ Mode M : 0|4@1+ (1,0) [0|15] "" Vector__XXX
 SG_ Rpm m1 : 8|16@1+ (0.125,0) [0|8000] "rpm" Dashboard,Logger
 SG_ Temp : 31|8@0- (1,-40) [-40|215] "C" Dashboard

VAL_ 256 Mode 0 "Off" 1 "Run" 2 "Fault" ;
`);

    expect(result.errors).toEqual([]);
    expect(result.valueTables).toEqual([
      { messageId: 256, signalName: 'Mode', values: { 0: 'Off', 1: 'Run', 2: 'Fault' } },
    ]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: 256,
      name: 'ENGINE STATUS',
      dlc: 8,
      sender: 'ECU',
      isExtended: false,
    });
    expect(result.messages[0].signals).toMatchObject([
      { name: 'Mode', byteOrder: 'little_endian', isSigned: false, muxIndicator: 'multiplexer', receivers: ['Vector__XXX'] },
      { name: 'Rpm', byteOrder: 'little_endian', muxIndicator: 'multiplexed', muxValue: 1, factor: 0.125, receivers: ['Dashboard', 'Logger'] },
      { name: 'Temp', byteOrder: 'big_endian', isSigned: true, offset: -40, unit: 'C' },
    ]);
  });

  it('parses extended messages, clamps DLC, and reports invalid standard IDs', () => {
    const result = parseDBC(`
BO_ 2147483920 EXT_MSG: 12 ECU
 SG_ Byte0 : 0|8@1+ (1,0) [0|255] "" Receiver
BO_ 3000 BAD_STD: 8 ECU
 SG_ Ignored : 0|8@1+ (1,0) [0|255] "" Receiver
`);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: 272,
      name: 'EXT MSG',
      dlc: 8,
      isExtended: true,
    });
    expect(result.messages[0].signals).toHaveLength(1);
    expect(result.errors[0]).toContain('exceeds 11-bit standard frame range');
  });

  it('ends a message block on top-level keywords and ignores orphan signals', () => {
    const result = parseDBC(`
BO_ 100 FIRST: 8 ECU
 SG_ FirstSig : 0|8@1+ (1,0) [0|255] "" Receiver
CM_ BO_ 100 "Comment";
 SG_ Orphan : 8|8@1+ (1,0) [0|255] "" Receiver
BO_ 101 SECOND: 1 ECU
 SG_ SecondSig : 0|8@1+ (1,0) [0|255] "" Receiver
`);

    expect(result.messages.map((message) => message.signals.map((sig) => sig.name))).toEqual([
      ['FirstSig'],
      ['SecondSig'],
    ]);
  });

  it('extracts little-endian, big-endian, signed, scaled, and out-of-range signal values', () => {
    expect(extractSignalValue([0x34, 0x12], makeSignal({ startBit: 0, length: 16, factor: 0.5, offset: 1 }))).toBe(2331);
    expect(extractSignalValue([0xf0], makeSignal({ startBit: 0, length: 8, isSigned: true }))).toBe(-16);
    expect(extractSignalValue([0xaa], makeSignal({ startBit: 7, length: 8, byteOrder: 'big_endian' }))).toBe(85);
    expect(extractSignalValue([0xff], makeSignal({ startBit: 63, length: 4, byteOrder: 'little_endian' }))).toBe(0);
    expect(extractSignalValue([0xff], makeSignal({ startBit: 63, length: 4, byteOrder: 'big_endian' }))).toBe(0);
  });

  it('converts parsed DBC messages into default CAN profile nodes', () => {
    const { messages } = parseDBC(`
BO_ 512 PUMP_STATUS: 4 PumpEcu
 SG_ Pressure : 0|16@1+ (1,0) [0|300] "mmHg" Display
BO_ 2147483921 EXT_STATUS: 8 ExtEcu
 SG_ Status : 0|8@1+ (1,0) [0|255] "" Display
`);

    expect(dbcToProfileNodes(messages)).toEqual([
      expect.objectContaining({
        id: 1,
        name: 'PUMP STATUS',
        profile: 'custom',
        color: MEDICAL_PROFILE_COLORS.custom,
        baseArbitrationId: 512,
        frameFormat: 'standard',
        dlc: 4,
        nmtInitialState: 'operational',
      }),
      expect.objectContaining({
        id: 2,
        name: 'EXT STATUS',
        baseArbitrationId: 273,
        frameFormat: 'extended',
        dlc: 8,
      }),
    ]);
  });
});
