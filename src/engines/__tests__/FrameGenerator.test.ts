import { describe, it, expect } from 'vitest';
import { generateFrame } from '../FrameGenerator';
import type { FrameProfile, SimulationState, ErrorType } from '../../types';

describe('FrameGenerator', () => {
  const mockProfile: FrameProfile = {
    id: 'test-profile',
    name: 'Test Profile',
    sendIntervalMs: 100,
    fields: [
      {
        id: 'sync',
        name: 'SYNC',
        byteWidth: 2,
        order: 0,
        type: 'fixed',
        typeConfig: { value: 0xABCD },
        endianness: 'big',
      },
      {
        id: 'data',
        name: 'DATA',
        byteWidth: 1,
        order: 1,
        type: 'fixed',
        typeConfig: { value: 0x55 },
        endianness: 'big',
      },
    ],
  } as unknown as FrameProfile;

  const mockState: SimulationState = {
    status: 'running',
    elapsedMs: 0,
    frameCount: 0,
    pendingErrors: [],
    fieldOverrides: {},
    bitOverrides: {},
    activeRamps: {},
    activePulses: {},
    waveformHistory: [],
    recentFrames: [],
    logEntries: [],
    errorCount: 0,
    frameCount_total: 0,
    framesPerSecond: 0,
    isRecording: false,
    networkConnected: false,
    outputMode: 'log',
    profileId: 'test-profile',
    scenarioId: null,
    serialConnected: false,
    signalIntegrity: {
        bitFlipsEnabled: false,
        noiseLevel: 0,
        jitterMs: 0
    }
  } as unknown as SimulationState;

  it('generates correct bytes for fixed fields', () => {
    const frame = generateFrame(mockProfile, mockState, 1);
    expect(frame.rawBytes).toEqual([0xAB, 0xCD, 0x55]);
    expect(frame.rawHex).toBe('AB CD 55');
  });

  it('respects endianness', () => {
    const leProfile = { ...mockProfile };
    leProfile.fields = [
        { ...mockProfile.fields[0], endianness: 'little' },
        mockProfile.fields[1]
    ];
    const frame = generateFrame(leProfile, mockState, 1);
    expect(frame.rawBytes).toEqual([0xCD, 0xAB, 0x55]);
  });

  it('handles range fields with uniform distribution', () => {
    const rangeProfile: FrameProfile = {
      ...mockProfile,
      fields: [
        {
          id: 'val',
          name: 'VAL',
          byteWidth: 1,
          order: 0,
          type: 'range',
          typeConfig: { min: 10, max: 20, distribution: 'uniform' },
          endianness: 'big',
        },
      ],
    } as unknown as FrameProfile;
    const frame = generateFrame(rangeProfile, mockState, 1);
    expect(frame.rawBytes[0]).toBeGreaterThanOrEqual(10);
    expect(frame.rawBytes[0]).toBeLessThanOrEqual(20);
  });

  it('handles gaussian range fields', () => {
    const rangeProfile: FrameProfile = {
      ...mockProfile,
      fields: [
        {
          id: 'val',
          name: 'VAL',
          byteWidth: 1,
          order: 0,
          type: 'range',
          typeConfig: { min: 0, max: 255, distribution: 'gaussian', mean: 128, stddev: 10 },
          endianness: 'big',
        },
      ],
    } as unknown as FrameProfile;
    const frame = generateFrame(rangeProfile, mockState, 1);
    expect(frame.rawBytes[0]).toBeGreaterThanOrEqual(0);
    expect(frame.rawBytes[0]).toBeLessThanOrEqual(255);
  });

  it('handles flags fields with overrides', () => {
    const flagsProfile: FrameProfile = {
      ...mockProfile,
      fields: [
        {
          id: 'status',
          name: 'STATUS',
          byteWidth: 1,
          order: 0,
          type: 'flags',
          typeConfig: {
            bits: [
              { name: 'ERR', index: 0, defaultValue: 0 },
              { name: 'RDY', index: 1, defaultValue: 1 },
            ],
          },
          endianness: 'little',
        },
      ],
    } as unknown as FrameProfile;
    
    const stateWithOverride = { 
        ...mockState, 
        bitOverrides: { 'status.ERR': 1 } 
    };
    const frame = generateFrame(flagsProfile, stateWithOverride, 1);
    // Bit 0 = 1 (override), Bit 1 = 1 (default) -> 0x03
    expect(frame.rawBytes[0]).toBe(0x03);
    expect(frame.fields[0].flags?.['ERR']).toBe(1);
    expect(frame.fields[0].flags?.['RDY']).toBe(1);
  });

  it('handles computed fields', () => {
    const computedProfile: FrameProfile = {
      ...mockProfile,
      fields: [
        { id: 'f1', name: 'F1', byteWidth: 1, order: 0, type: 'fixed', typeConfig: { value: 10 }, endianness: 'big' },
        { 
          id: 'f2', name: 'F2', byteWidth: 1, order: 1, type: 'computed', 
          typeConfig: { expression: "fields['F1'] * 2", clampMin: 0, clampMax: 255 }, endianness: 'big' 
        },
      ],
    } as unknown as FrameProfile;
    const frame = generateFrame(computedProfile, mockState, 1);
    expect(frame.rawBytes).toEqual([10, 20]);
  });

  it('handles script fields', () => {
    const scriptProfile: FrameProfile = {
      ...mockProfile,
      fields: [
        { 
          id: 's1', name: 'S1', byteWidth: 1, order: 0, type: 'script', 
          typeConfig: { code: 'return t > 100 ? 50 : 20;' }, endianness: 'big' 
        },
      ],
    } as unknown as FrameProfile;
    
    const frame1 = generateFrame(scriptProfile, { ...mockState, elapsedMs: 50 }, 1);
    expect(frame1.rawBytes[0]).toBe(20);
    
    const frame2 = generateFrame(scriptProfile, { ...mockState, elapsedMs: 150 }, 2);
    expect(frame2.rawBytes[0]).toBe(50);
  });

  it('applies signal integrity noise', () => {
    const noisyState = {
      ...mockState,
      signalIntegrity: {
        bitFlipsEnabled: true,
        noiseLevel: 1.0, // Flip ALL bits
        jitterMs: 0
      }
    };
    const frame = generateFrame(mockProfile, noisyState, 1);
    // Original: 0xAB (10101011) -> Noisy: 0x54 (01010100)
    // Original: 0xCD (11001101) -> Noisy: 0x32 (00110010)
    // Original: 0x55 (01010101) -> Noisy: 0xAA (10101010)
    expect(frame.rawBytes[0]).toBe(0xAB ^ 0xFF);
    expect(frame.rawBytes[1]).toBe(0xCD ^ 0xFF);
    expect(frame.rawBytes[2]).toBe(0x55 ^ 0xFF);
  });

  it('handles checksum fields', () => {
    const checksumProfile: FrameProfile = {
      ...mockProfile,
      fields: [
        { id: 'd1', name: 'D1', byteWidth: 1, order: 0, type: 'fixed', typeConfig: { value: 0x55 }, endianness: 'big' },
        { 
          id: 'cs', name: 'CS', byteWidth: 1, order: 1, type: 'checksum', 
          typeConfig: { 
            algorithm: 'sum_mod256', 
            scope: { startFieldId: 'd1', endFieldId: 'd1' } 
          }, 
          endianness: 'big' 
        },
      ],
    } as unknown as FrameProfile;
    const frame = generateFrame(checksumProfile, mockState, 1);
    // sum8 of [0x55] is 0x55
    expect(frame.rawBytes).toEqual([0x55, 0x55]);
  });

  it('handles all error injection types', () => {
    const errorTypes = ['corrupt_checksum', 'skip_bytes', 'extra_bytes', 'delay_frame'];
    for (const errType of errorTypes) {
      const errorState = {
        ...mockState,
        pendingErrors: [errType] as ErrorType[]
      };
      const frame = generateFrame(mockProfile, errorState, 1);
      expect(frame.errors.length).toBeGreaterThan(0);
      
      if (errType === 'skip_bytes') {
        expect(frame.rawBytes.length).toBeLessThan(3);
      } else if (errType === 'extra_bytes') {
        expect(frame.rawBytes.length).toBeGreaterThan(3);
      }
    }
  });

  it('generates UART bitstream with mark parity', () => {
    const parityProfile = { 
        ...mockProfile, 
        parity: 'Mark',
        dataBits: 8,
        stopBits: 1
    } as unknown as FrameProfile;
    const frame = generateFrame(parityProfile, mockState, 1);
    expect(frame.bitStream?.some(t => t.label === 'PARITY')).toBe(true);
  });

  it('applies SLIP framing', () => {
    const slipProfile = { 
        ...mockProfile, 
        framing: { mode: 'slip' } 
    } as unknown as FrameProfile;
    const frame = generateFrame(slipProfile, mockState, 1);
    expect(frame.rawBytes[0]).toBe(0xC0);
    expect(frame.rawBytes[frame.rawBytes.length - 1]).toBe(0xC0);
  });

  it('applies COBS framing', () => {
    const cobsProfile = { 
        ...mockProfile, 
        framing: { mode: 'cobs' } 
    } as unknown as FrameProfile;
    const frame = generateFrame(cobsProfile, mockState, 1);
    expect(frame.rawBytes[frame.rawBytes.length - 1]).toBe(0x00);
  });

  it('applies Modbus RTU framing', () => {
    const modbusProfile = { 
        ...mockProfile, 
        framing: { mode: 'modbus' } 
    } as unknown as FrameProfile;
    const frame = generateFrame(modbusProfile, mockState, 1);
    expect(frame.rawBytes.length).toBe(3 + 2); // 3 data + 2 crc
  });

  it('applies delimiter framing', () => {
    const delimProfile = { 
        ...mockProfile, 
        framing: { mode: 'delimiter', delimiter: 0x0A } 
    } as unknown as FrameProfile;
    const frame = generateFrame(delimProfile, mockState, 1);
    expect(frame.rawBytes[frame.rawBytes.length - 1]).toBe(0x0A);
  });
});
