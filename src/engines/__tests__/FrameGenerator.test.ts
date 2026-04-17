import { describe, it, expect } from 'vitest';
import { generateFrame } from '../FrameGenerator';
import type { FrameProfile, SimulationState } from '../../types';

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
  } as any;

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
  } as any;

  it('generates correct bytes for fixed fields', () => {
    const frame = generateFrame(mockProfile, mockState, 1);
    // AB CD 55
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
    // CD AB 55
    expect(frame.rawBytes).toEqual([0xCD, 0xAB, 0x55]);
  });
});
