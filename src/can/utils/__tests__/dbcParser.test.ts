import { describe, expect, it } from 'vitest';
import { dbcToProfileNodes, extractSignalValue, parseDBC, type DBCSignal } from '../dbcParser';

describe('dbcParser', () => {
  it('parses standard and extended messages, signals, multiplexing, and value tables', () => {
    const dbc = `
BO_ 291 Patient_Monitor: 8 MON
 SG_ Mode M : 0|8@1+ (1,0) [0|3] "" ECU
 SG_ HeartRate m1 : 8|8@1+ (1,0) [0|250] "bpm" ECU,NURSE
 SG_ Temp : 16|16@0- (0.1,-40) [-40|215] "C" ECU
VAL_ 291 Mode 0 "Idle" 1 "Operational" ;
BO_ 2147483939 Extended_Device: 4 EXT
 SG_ Pressure : 0|16@1+ (0.5,10) [10|200] "cmH2O" ECU
`;

    const result = parseDBC(dbc);

    expect(result.errors).toEqual([]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      id: 0x123,
      name: 'Patient Monitor',
      dlc: 8,
      sender: 'MON',
      isExtended: false,
    });
    expect(result.messages[0].signals[0]).toMatchObject({
      name: 'Mode',
      muxIndicator: 'multiplexer',
      byteOrder: 'little_endian',
      isSigned: false,
    });
    expect(result.messages[0].signals[1]).toMatchObject({
      name: 'HeartRate',
      muxIndicator: 'multiplexed',
      muxValue: 1,
      receivers: ['ECU', 'NURSE'],
    });
    expect(result.messages[0].signals[2]).toMatchObject({
      name: 'Temp',
      byteOrder: 'big_endian',
      isSigned: true,
      factor: 0.1,
      offset: -40,
    });
    expect(result.messages[1]).toMatchObject({
      id: 0x123,
      name: 'Extended Device',
      dlc: 4,
      isExtended: true,
    });
    expect(result.valueTables).toEqual([
      { messageId: 291, signalName: 'Mode', values: { 0: 'Idle', 1: 'Operational' } },
    ]);
  });

  it('reports invalid standard identifiers and clamps message dlc', () => {
    const result = parseDBC(`
BO_ 4096 Invalid_Standard: 12 ECU
 SG_ Ignored : 0|8@1+ (1,0) [0|255] "" ECU
BO_ 100 Short_Frame: 0 ECU
`);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ id: 100, dlc: 1 });
    expect(result.errors[0]).toContain('exceeds 11-bit standard frame range');
  });

  it('extracts little-endian unsigned signals with scaling', () => {
    const signal = makeSignal({ startBit: 0, length: 12, byteOrder: 'little_endian', factor: 0.5, offset: 10 });

    expect(extractSignalValue([0x34, 0x12], signal)).toBe(0x234 * 0.5 + 10);
  });

  it('extracts big-endian signed signals with sign extension', () => {
    const signal = makeSignal({ startBit: 7, length: 8, byteOrder: 'big_endian', isSigned: true });

    expect(extractSignalValue([0xff], signal)).toBe(-1);
  });

  it('converts DBC messages to reusable CAN profile nodes', () => {
    const { messages } = parseDBC(`
BO_ 256 Ventilator: 8 VENT
 SG_ Flow : 0|16@1+ (1,0) [0|1000] "ml" ECU
BO_ 2147483904 Pump_Ext: 2 PUMP
 SG_ Dose : 0|8@1+ (1,0) [0|255] "" ECU
`);

    const nodes = dbcToProfileNodes(messages);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({
      id: 1,
      name: 'Ventilator',
      baseArbitrationId: 256,
      frameFormat: 'standard',
      dlc: 8,
      profile: 'custom',
    });
    expect(nodes[1]).toMatchObject({
      id: 2,
      name: 'Pump Ext',
      baseArbitrationId: 256,
      frameFormat: 'extended',
      dlc: 2,
    });
  });
});

function makeSignal(patch: Partial<DBCSignal>): DBCSignal {
  return {
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
    receivers: [],
    ...patch,
  };
}
