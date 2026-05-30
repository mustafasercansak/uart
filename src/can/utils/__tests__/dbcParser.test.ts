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

  it('does not sign-extend a positive value in a signed signal', () => {
    const signal = makeSignal({ startBit: 0, length: 8, byteOrder: 'little_endian', isSigned: true });
    // 0x7F = 127 — less than halfRange (128), so no sign extension applied
    expect(extractSignalValue([0x7f], signal)).toBe(127);
  });

  it('resets message context on a blank line between definitions', () => {
    const dbc = `
BO_ 100 Msg: 8 ECU
 SG_ A : 0|8@1+ (1,0) [0|255] "" ECU

BO_ 200 Msg2: 8 ECU
 SG_ B : 0|8@1+ (1,0) [0|255] "" ECU
`;
    const result = parseDBC(dbc);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].signals[0].name).toBe('A');
    expect(result.messages[1].signals[0].name).toBe('B');
  });

  it('handles a VAL_ table whose pairs contain multiple entries', () => {
    const dbc = `
BO_ 300 States: 8 ECU
 SG_ State : 0|4@1+ (1,0) [0|15] "" ECU
VAL_ 300 State 0 "Off" 1 "Standby" 2 "Active" 3 "Fault" ;
`;
    const result = parseDBC(dbc);
    expect(result.valueTables).toHaveLength(1);
    expect(result.valueTables[0].values).toEqual({ 0: 'Off', 1: 'Standby', 2: 'Active', 3: 'Fault' });
  });

  it('uses numeric fallbacks for malformed SG_ factor/max values', () => {
    const dbc = `
BO_ 400 Weird_Signal: 8 ECU
 SG_ Odd : 0|8@1+ (NaN,2.5) [1|NaN] "u" ECU, , NODE
`;

    const result = parseDBC(dbc);
    const sig = result.messages[0].signals[0];

    expect(sig.factor).toBe(1);
    expect(sig.offset).toBe(2.5);
    expect(sig.min).toBe(1);
    expect(sig.max).toBe(0);
    expect(sig.receivers).toEqual(['ECU', 'NODE']);
  });

  it('ignores orphan SG_ lines and keeps parsing later messages', () => {
    const dbc = `
SG_ Orphan : 0|8@1+ (1,0) [0|255] "" ECU
BO_ 500 Real_Message: 8 ECU
 SG_ Value : 0|8@1+ (1,0) [0|255] "" ECU
`;

    const result = parseDBC(dbc);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].name).toBe('Real Message');
    expect(result.messages[0].signals.map(s => s.name)).toEqual(['Value']);
  });

  it('does not reset message context on non-keyword non-empty lines', () => {
    const dbc = `
BO_ 600 Keep_Context: 8 ECU
 this is a free-form line
 SG_ A : 0|8@1+ (1,0) [0|255] "" ECU
`;

    const result = parseDBC(dbc);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].signals.map(s => s.name)).toEqual(['A']);
  });

  it('returns 0 for big-endian bits that are out of data buffer range', () => {
    const signal = makeSignal({ startBit: 64, length: 1, byteOrder: 'big_endian' });

    expect(extractSignalValue([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], signal)).toBe(0);
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
