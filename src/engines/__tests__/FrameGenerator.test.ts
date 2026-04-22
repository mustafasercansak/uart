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

  it('syncs waveforms with medical metrics (BPM/HR/RR)', () => {
    const medicalProfile: FrameProfile = {
      ...mockProfile,
      fields: [
        { id: 'bpm', name: 'BPM', byteWidth: 1, order: 0, type: 'fixed', typeConfig: { value: 60 }, endianness: 'big' },
        { 
          id: 'ecg', name: 'ECG', byteWidth: 1, order: 1, type: 'waveform', 
          typeConfig: { shape: 'ecg', frequency: 0.1, amplitude: 100, offset: 128 }, endianness: 'big' 
        },
        { id: 'rr', name: 'RR', byteWidth: 1, order: 2, type: 'fixed', typeConfig: { value: 20 }, endianness: 'big' },
        { 
          id: 'resp', name: 'RESP', byteWidth: 1, order: 3, type: 'waveform', 
          typeConfig: { shape: 'resp_pressure', frequency: 0.1, amplitude: 100, offset: 128 }, endianness: 'big' 
        },
      ],
    } as unknown as FrameProfile;
    
    const frame = generateFrame(medicalProfile, mockState, 1);
    expect(frame.rawBytes.length).toBeGreaterThan(0);
  });

  it('handles timed and random bit behaviors', () => {
    const behaviorProfile = {
      ...mockProfile,
      fields: [
        {
          id: 'f1', name: 'F1', byteWidth: 1, order: 0, type: 'flags',
          typeConfig: {
            bits: [
              { name: 'TIMED', index: 0, behavior: 'timed', behaviorConfig: { activateAtMs: 100, deactivateAtMs: 200 } },
              { name: 'RANDOM', index: 1, behavior: 'random', behaviorConfig: { probability: 1.0 } }
            ]
          },
          endianness: 'little'
        }
      ]
    } as unknown as FrameProfile;

    const frame1 = generateFrame(behaviorProfile, { ...mockState, elapsedMs: 150 }, 1);
    expect(frame1.fields[0].flags?.['TIMED']).toBe(1);
    expect(frame1.fields[0].flags?.['RANDOM']).toBe(1);

    const frame2 = generateFrame(behaviorProfile, { ...mockState, elapsedMs: 250 }, 2);
    expect(frame2.fields[0].flags?.['TIMED']).toBe(0);
  });

  it('handles ramps and field overrides', () => {
    const rampState = {
        ...mockState,
        activeRamps: {
            'data': { from: 0, to: 100, startMs: 0, durationMs: 1000, curve: 'linear' }
        },
        fieldOverrides: {
            'sync': 0x1234
        }
    };
    const frame = generateFrame(mockProfile, { ...rampState, elapsedMs: 500 }, 1);
    expect(frame.rawBytes).toEqual([0x12, 0x34, 50]);
  });

  it('handles more parity modes and stop bits', () => {
    const modes = ['Even', 'Odd', 'Space'] as const;
    for (const mode of modes) {
      const pProfile = { ...mockProfile, parity: mode, stopBits: 1.5 } as unknown as FrameProfile;
      const frame = generateFrame(pProfile, mockState, 1);
      expect(frame.bitStream?.length).toBeGreaterThan(0);
    }
  });

  it('handles SLIP and COBS edge cases', () => {
    // SLIP Escape encoding
    const escapeProfile = { 
        ...mockProfile, 
        fields: [{ id: 'd', name: 'D', byteWidth: 2, order: 2, type: 'fixed', typeConfig: { value: 0xC0DB }, endianness: 'big' }],
        framing: { mode: 'slip' } 
    } as unknown as FrameProfile;
    const frameSlip = generateFrame(escapeProfile, mockState, 1);
    expect(frameSlip.rawBytes).toContain(0xDB);
    
    // COBS zero byte AND block limit
    const complexProfile = {
        ...mockProfile,
        fields: [
            { id: 'z', name: 'Z', byteWidth: 1, order: 0, type: 'fixed', typeConfig: { value: 0 }, endianness: 'big' },
            ...Array(300).fill(0).map((_, i) => ({
                id: `f${i}`, name: `F${i}`, byteWidth: 1, order: i + 1, type: 'fixed', typeConfig: { value: 0x55 }, endianness: 'big'
            }))
        ],
        framing: { mode: 'cobs' }
    } as unknown as FrameProfile;
    const frameCobs = generateFrame(complexProfile, mockState, 1);
    expect(frameCobs.rawBytes[frameCobs.rawBytes.length - 1]).toBe(0x00);

    // Unknown framing
    const unknownFraming = { ...mockProfile, framing: { mode: 'unknown' } } as unknown as FrameProfile;
    const frameUnknown = generateFrame(unknownFraming, mockState, 1);
    expect(frameUnknown.rawBytes.length).toBe(3);
  });

  it('handles more error types and script failures', () => {
    const errorState = { ...mockState, pendingErrors: ['wrong_sync', 'unknown' as any] };
    const frame = generateFrame(mockProfile, errorState, 1);
    expect(frame.rawBytes[0]).not.toBe(0xAB);
    
    const badScript: FrameProfile = {
        ...mockProfile,
        fields: [{ id: 's', name: 'S', byteWidth: 1, order: 2, type: 'script', typeConfig: { code: 'throw new Error();' }, endianness: 'big' }]
    } as unknown as FrameProfile;
    const frameScript = generateFrame(badScript, mockState, 1);
    expect(frameScript.rawBytes[frameScript.rawBytes.length - 1]).toBe(0);
  });

  describe('Expanded Branch Coverage', () => {
    it('handles ASCII numeric fields', () => {
      const asciiProfile = {
        ...mockProfile,
        fields: [{ 
          id: 'a1', name: 'ASC', byteWidth: 3, order: 0, 
          type: 'fixed', typeConfig: { value: 123 }, 
          endianness: 'big', isAscii: true 
        }]
      } as unknown as FrameProfile;
      const frame = generateFrame(asciiProfile, mockState, 1);
      // '123' -> [49, 50, 51]
      expect(frame.rawBytes).toEqual([49, 50, 51]);
    });

    it('handles script syntax errors', () => {
      const syntaxErrorProfile = {
        ...mockProfile,
        fields: [{ 
          id: 's', name: 'S', byteWidth: 1, order: 0, 
          type: 'script', typeConfig: { code: 'if (true) { return 10 ' }, // Missing closing brace
          endianness: 'big' 
        }]
      } as unknown as FrameProfile;
      const frame = generateFrame(syntaxErrorProfile, mockState, 1);
      expect(frame.rawBytes[0]).toBe(0);
    });

    it('handles gaussian defaults and orphans', () => {
      const gaussProfile = {
        ...mockProfile,
        fields: [
          { 
            id: 'g', name: 'G', byteWidth: 1, order: 0, 
            type: 'range', typeConfig: { min: 0, max: 10, distribution: 'gaussian' }, 
            endianness: 'big' 
          },
          {
            id: 'r', name: 'R', byteWidth: 1, order: 1,
            type: 'ramp', typeConfig: { from: 0, to: 100, durationMs: 1000, curve: 'linear' },
            endianness: 'big'
          }
        ]
      } as unknown as FrameProfile;
      const frame = generateFrame(gaussProfile, mockState, 1);
      expect(frame.rawBytes[0]).toBeGreaterThanOrEqual(0);
      expect(frame.rawBytes[1]).toBe(0); // Ramp without active ramp state returns 0
    });

    it('covers switch defaults and edge cases', () => {
      const unknownTypeProfile = {
             ...mockProfile,
             fields: [{ id: 'u', name: 'U', byteWidth: 1, order: 0, type: 'UNKNOWN' as any, typeConfig: {}, endianness: 'big' }]
      } as unknown as FrameProfile;
      const frameType = generateFrame(unknownTypeProfile, mockState, 1);
      expect(frameType.rawBytes[0]).toBe(0);

      const unknownErrorState = { ...mockState, pendingErrors: ['UNKNOWN' as any] };
      const frameErr = generateFrame(mockProfile, unknownErrorState, 1);
      expect(frameErr.errors.length).toBe(0);

      // Parity default
      // We can't hit parity default easily from generateFrame without adding 'UNKNOWN' to Parity type
      // But we can test it if we cast
      const parityProfile = { ...mockProfile, parity: 'UNKNOWN' as any } as unknown as FrameProfile;
      const frameParity = generateFrame(parityProfile, mockState, 1);
      expect(frameParity.bitStream?.some(t => t.label === 'PARITY')).toBe(true); // Still adds parity bit but it defaults to 0
    });
  });
});
