import { describe, expect, it } from 'vitest';
import { canReducer, INITIAL_CAN_STATE, type CANAction } from '../canReducer';
import { DEFAULT_CAN_ERROR_INJECTION_STATE } from '../../types/CANErrorInjection';
import { DEFAULT_UDS_DIAGNOSTIC_CONFIG } from '../../types/UDS';
import type { CANFrame } from '../../types/CANFrame';
import type { CANNode } from '../../types/CANNode';

const makeFrame = (uid: string, errors: string[] = []): CANFrame => ({
  uid,
  arbitrationId: 0x120,
  idFormat: 'standard',
  frameType: 'data',
  isRTR: false,
  dlc: 2,
  data: [0x12, 0x34],
  crc: 0x1234,
  timestamp: 1000,
  nodeId: 1,
  busLoadPercent: 5,
  errors,
});

const makeNode = (id: number): CANNode => ({
  id,
  name: `Node ${id}`,
  profile: 'custom',
  color: '#94a3b8',
  txErrorCounter: 0,
  rxErrorCounter: 0,
  state: 'error-active',
  nmtState: 'operational',
  sendIntervalMs: 100,
  isActive: true,
  baseArbitrationId: 0x100 + id,
  vitals: {
    heartRate: 72,
    spO2: 98,
    systolicBP: 120,
    diastolicBP: 80,
    temperature: 36.6,
    respiratoryRate: 16,
    etCO2: 38,
    alarmFlags: 0,
  },
  activeFault: null,
  lastSentAt: 0,
  framesSent: 0,
});

describe('canReducer', () => {
  it('handles status, patch, selection, filters, toggles, baud, output, connections, and UDS config actions', () => {
    const udsConfig = {
      ...DEFAULT_UDS_DIAGNOSTIC_CONFIG,
      testerRequestId: 0x7df,
      ecuResponseId: 0x7e9,
      targetNodeId: 3,
      autoRespond: false,
    };

    const cases: Array<[CANAction, Partial<typeof INITIAL_CAN_STATE>]> = [
      [{ type: 'CAN_SET_STATUS', status: 'running' }, { status: 'running' }],
      [{ type: 'CAN_PATCH_STATE', patch: { busLoadPercent: 42, framesPerSecond: 17 } }, { busLoadPercent: 42, framesPerSecond: 17 }],
      [{ type: 'CAN_SELECT_NODE', nodeId: 2 }, { selectedNodeId: 2 }],
      [{ type: 'CAN_SELECT_FRAME', uid: 'frame-1' }, { selectedFrameUid: 'frame-1' }],
      [{ type: 'CAN_SET_FILTER', filter: 'alarm' }, { displayFilter: 'alarm' }],
      [{ type: 'CAN_TOGGLE_ARBITRATION_DISPLAY' }, { showArbitrationEvents: false }],
      [{ type: 'CAN_TOGGLE_ERROR_DISPLAY' }, { showErrorFrames: false }],
      [{ type: 'CAN_SET_BAUD_RATE', baudRate: 1000 }, { baudRate: 1000 }],
      [{ type: 'CAN_SET_OUTPUT_MODE', mode: 'tcp' }, { outputMode: 'tcp' }],
      [{ type: 'CAN_SET_UDS_CONFIG', config: udsConfig }, { udsConfig }],
      [{ type: 'CAN_SET_SERIAL_CONNECTED', connected: true }, { serialConnected: true }],
      [{ type: 'CAN_SET_NETWORK_CONNECTED', connected: true }, { networkConnected: true }],
      [{ type: 'CAN_SET_RECORDING', isRecording: true }, { isRecording: true }],
    ];

    for (const [action, expectedPatch] of cases) {
      expect(canReducer(INITIAL_CAN_STATE, action)).toMatchObject(expectedPatch);
    }
  });

  it('sets nodes, adds frames, records while enabled, and counts errored frames', () => {
    const nodes = [makeNode(1), makeNode(2)];
    const withNodes = canReducer(INITIAL_CAN_STATE, { type: 'CAN_SET_NODES', nodes });
    expect(withNodes.nodes).toBe(nodes);

    const recordingState = { ...withNodes, isRecording: true };
    const next = canReducer(recordingState, { type: 'CAN_ADD_FRAME', frame: makeFrame('a', ['crc']) });

    expect(next.recentFrames.map((frame) => frame.uid)).toEqual(['a']);
    expect(next.recordedFrames.map((frame) => frame.uid)).toEqual(['a']);
    expect(next.frameCount).toBe(1);
    expect(next.errorCount).toBe(1);

    const notRecording = canReducer({ ...next, isRecording: false }, { type: 'CAN_ADD_FRAME', frame: makeFrame('b') });
    expect(notRecording.recordedFrames).toHaveLength(1);
    expect(notRecording.frameCount).toBe(2);
    expect(notRecording.errorCount).toBe(1);
  });

  it('caps recent frames, arbitration events, log entries, and fault events', () => {
    let state = INITIAL_CAN_STATE;
    for (let i = 0; i < 205; i++) {
      state = canReducer(state, { type: 'CAN_ADD_FRAME', frame: makeFrame(`frame-${i}`) });
    }
    expect(state.recentFrames).toHaveLength(200);
    expect(state.recentFrames[0].uid).toBe('frame-204');
    expect(state.recentFrames[199].uid).toBe('frame-5');

    for (let i = 0; i < 105; i++) {
      state = canReducer(state, {
        type: 'CAN_ADD_ARBITRATION',
        event: { timestamp: i, winnerId: 1, loserId: 2, winnerArbitrationId: 0x100, loserArbitrationId: 0x200 },
      });
    }
    expect(state.arbitrationEvents).toHaveLength(100);
    expect(state.arbitrationEvents[0].timestamp).toBe(5);

    for (let i = 0; i < 505; i++) {
      state = canReducer(state, { type: 'CAN_ADD_LOG', entry: { time: `${i}`, text: `log-${i}`, type: 'info' } });
    }
    expect(state.logEntries).toHaveLength(500);
    expect(state.logEntries[0].text).toBe('log-5');

    for (let i = 0; i < 205; i++) {
      state = canReducer(state, {
        type: 'CAN_ADD_FAULT_EVENT',
        event: { timestamp: i, time: `${i}`, nodeId: 1, nodeName: 'Node 1', fault: 'recover' },
      });
    }
    expect(state.faultEvents).toHaveLength(200);
    expect(state.faultEvents[0].timestamp).toBe(5);
  });

  it('clears frames and error injection stats without clearing recorded frames', () => {
    const state = {
      ...INITIAL_CAN_STATE,
      recentFrames: [makeFrame('a')],
      recordedFrames: [makeFrame('recorded')],
      frameCount: 12,
      errorCount: 3,
      arbitrationEvents: [{ timestamp: 1, winnerId: 1, loserId: 2, winnerArbitrationId: 0x100, loserArbitrationId: 0x200 }],
      errorInjection: {
        ...INITIAL_CAN_STATE.errorInjection,
        oneTimeArmed: true,
        stats: { totalPackets: 24, successfulPackets: 11, errorsInjected: 9 },
      },
    };

    const next = canReducer(state, { type: 'CAN_CLEAR_FRAMES' });

    expect(next.recentFrames).toEqual([]);
    expect(next.frameCount).toBe(0);
    expect(next.errorCount).toBe(0);
    expect(next.arbitrationEvents).toEqual([]);
    expect(next.recordedFrames).toHaveLength(1);
    expect(next.errorInjection.oneTimeArmed).toBe(false);
    expect(next.errorInjection.stats).toEqual(DEFAULT_CAN_ERROR_INJECTION_STATE.stats);
  });

  it('clears recorded frames and returns the same state object for unknown actions', () => {
    const withRecording = { ...INITIAL_CAN_STATE, recordedFrames: [makeFrame('recorded')] };

    expect(canReducer(withRecording, { type: 'CAN_CLEAR_RECORDING' }).recordedFrames).toEqual([]);
    expect(canReducer(withRecording, { type: 'UNKNOWN' } as unknown as CANAction)).toBe(withRecording);
  });
});
