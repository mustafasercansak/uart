import { describe, it, expect } from 'vitest';
import { reducer, INITIAL_STATE } from '../simulationReducer';
import type { SimulationState, ErrorType, GeneratedFrame } from '../../types';

describe('simulationReducer', () => {
  it('handles START action', () => {
    const action = {
      type: 'START' as const,
      profileId: 'test-profile',
      scenarioId: 'test-scenario',
      outputMode: 'log' as const,
    };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.status).toBe('running');
    expect(newState.profileId).toBe('test-profile');
    expect(newState.scenarioId).toBe('test-scenario');
    expect(newState.startedAt).not.toBeNull();
  });

  it('handles STOP action', () => {
    const state: SimulationState = { ...INITIAL_STATE, status: 'running' as const };
    const action = { type: 'STOP' as const };
    const newState = reducer(state, action);
    expect(newState.status).toBe('stopped');
  });

  it('handles PAUSE/RESUME actions', () => {
    let state: SimulationState = { ...INITIAL_STATE, status: 'running' as const };
    state = reducer(state, { type: 'PAUSE' as const });
    expect(state.status).toBe('paused');
    state = reducer(state, { type: 'RESUME' as const });
    expect(state.status).toBe('running');
  });

  it('handles OVERRIDE_FIELD', () => {
    const action = { type: 'OVERRIDE_FIELD' as const, fieldId: 'f1', value: 42 };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.fieldOverrides['f1']).toBe(42);
  });

  it('handles OVERRIDE_BIT', () => {
    const action = { type: 'OVERRIDE_BIT' as const, bitKey: 'f1.b0', value: 1 };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.bitOverrides['f1.b0']).toBe(1);
  });

  it('handles INJECT_ERROR / CONSUME_ERROR', () => {
    let state = reducer(INITIAL_STATE, { type: 'INJECT_ERROR' as const, errorType: 'wrong_sync' });
    expect(state.pendingErrors).toEqual(['wrong_sync']);
    state = reducer(state, { type: 'CONSUME_ERROR' as const });
    expect(state.pendingErrors).toEqual([]);
  });

  it('handles RESET_OVERRIDES', () => {
    const dirtyState: SimulationState = {
      ...INITIAL_STATE,
      fieldOverrides: { f1: 10 },
      bitOverrides: { 'f1.b0': 1 },
      pendingErrors: ['wrong_sync'] as ErrorType[]
    };
    const newState = reducer(dirtyState, { type: 'RESET_OVERRIDES' as const });
    expect(newState.fieldOverrides).toEqual({});
    expect(newState.bitOverrides).toEqual({});
    expect(newState.pendingErrors).toEqual([]);
  });

  it('handles MASTER_TICK with updates', () => {
    const action = {
      type: 'MASTER_TICK' as const,
      updates: { frameCount: 10, lastFrame: { frameNumber: 10, bitStream: [] } as unknown as GeneratedFrame },
      points: [{ val: 100 }],
      logEntries: [{ time: '12:00', text: 'tick', type: 'info' as const }],
      elapsedMs: 1000
    };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.frameCount).toBe(10);
    expect(newState.elapsedMs).toBe(1000);
    expect(newState.waveformHistory.length).toBe(1);
    expect(newState.logEntries.length).toBe(1);
    expect(newState.recentFrames.length).toBe(1);
  });

  it('handles TOGGLE_WATCHLIST', () => {
    let state = reducer(INITIAL_STATE, { type: 'TOGGLE_WATCHLIST' as const, fieldName: 'HeartRate' });
    expect(state.watchlist).toContain('HeartRate');
    state = reducer(state, { type: 'TOGGLE_WATCHLIST' as const, fieldName: 'HeartRate' });
    expect(state.watchlist).not.toContain('HeartRate');
  });

  it('handles SET_DIFF_FRAME', () => {
    const frame = { uId: 'f1' } as unknown as GeneratedFrame;
    const newState = reducer(INITIAL_STATE, { type: 'SET_DIFF_FRAME' as const, index: 0, frame });
    expect(newState.diffFrames[0]).toBe(frame);
  });

  it('handles START_VALIDATION / STOP_VALIDATION / CANCEL_VALIDATION', () => {
    const session = { name: 'Test' } as unknown as import('../../types').ValidationSession;
    let state = reducer(INITIAL_STATE, { type: 'START_VALIDATION' as const, session });
    expect(state.validationSession).toBe(session);

    state = reducer(state, { type: 'STOP_VALIDATION' as const, endTime: 2000, score: 0.95 });
    expect(state.validationSession?.status).toBe('completed');
    expect(state.validationSession?.complianceScore).toBe(0.95);

    state = reducer(state, { type: 'CANCEL_VALIDATION' as const });
    expect(state.validationSession).toBeNull();
  });

  it('handles BATCH_UPDATE', () => {
     const action = { type: 'BATCH_UPDATE' as const, updates: { frameCount: 500, errorCount: 12 } };
     const newState = reducer(INITIAL_STATE, action);
     expect(newState.frameCount).toBe(500);
     expect(newState.errorCount).toBe(12);
  });

  it('handles MASTER_TICK with logic history updates', () => {
    const action = {
      type: 'MASTER_TICK' as const,
      updates: { 
        lastFrame: { 
          frameNumber: 1, 
          bitStream: [{ t: 0, v: 0 }, { t: 1, v: 1 }] 
        } as unknown as GeneratedFrame 
      },
      points: [],
      logEntries: [],
      elapsedMs: 100
    };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.logicHistory[0].transitions.length).toBe(2);
  });

  it('handles connection status actions', () => {
    let state = reducer(INITIAL_STATE, { type: 'SET_SERIAL_CONNECTED' as const, connected: true });
    expect(state.serialConnected).toBe(true);
    state = reducer(state, { type: 'SET_NETWORK_CONNECTED' as const, connected: true });
    expect(state.networkConnected).toBe(true);
    state = reducer(state, { type: 'SET_BACKEND_CONNECTED' as const, connected: false });
    expect(state.networkConnected).toBe(false);
  });

  it('handles ADD_LOG', () => {
    const action = { type: 'ADD_LOG' as const, entryType: 'info' as const, text: 'Hello' };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.logEntries.length).toBe(1);
    expect(newState.logEntries[0].text).toBe('Hello');
  });

  it('handles UPDATE_EXCHANGE', () => {
    const exchange = { id: 'ex1', startTime: Date.now() } as unknown as import('../../types').Exchange;
    const action = { type: 'UPDATE_EXCHANGE' as const, exchange };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.exchanges.length).toBe(1);
    expect(newState.exchanges[0].id).toBe('ex1');
  });

  it('handles SELECT_EXCHANGE', () => {
    const action = { type: 'SELECT_EXCHANGE' as const, exchangeId: 'ex1' };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.selectedExchangeId).toBe('ex1');
  });

  it('handles SNAPSHOT actions', () => {
    const frame = { frameNumber: 100 } as unknown as GeneratedFrame;
    let state = reducer(INITIAL_STATE, { type: 'SAVE_SNAPSHOT' as const, frame });
    expect(state.snapshots.length).toBe(1);
    state = reducer(state, { type: 'DELETE_SNAPSHOT' as const, frameNumber: 100 });
    expect(state.snapshots.length).toBe(0);
  });

  it('handles SET_SIGNAL_INTEGRITY', () => {
    const action = { type: 'SET_SIGNAL_INTEGRITY' as const, integrity: { noiseLevel: 0.5 } };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.signalIntegrity.noiseLevel).toBe(0.5);
  });

  it('handles dashboard layout actions', () => {
    const widget = { id: 'w1', type: 'gauge', fieldId: 'v' } as unknown as import('../../types').DashboardWidget;
    let state = reducer(INITIAL_STATE, { type: 'ADD_WIDGET' as const, widget });
    expect(state.dashboardLayout?.widgets.length).toBe(1);
    
    state = reducer(state, { type: 'UPDATE_LAYOUT' as const, widgets: [widget] });
    expect(state.dashboardLayout?.widgets.length).toBe(1);
    
    state = reducer(state, { type: 'REMOVE_WIDGET' as const, id: 'w1' });
    expect(state.dashboardLayout?.widgets.length).toBe(0);
  });

  it('handles SET_RECORDINGS', () => {
    const recordings = [{ id: 'r1' }] as unknown as import('../../types').RecordingMetadata[];
    const newState = reducer(INITIAL_STATE, { type: 'SET_RECORDINGS' as const, recordings });
    expect(newState.recordings).toEqual(recordings);
  });

  it('handles UPDATE_TIMING_STATS', () => {
    const stats = { averageLatencyMs: 12 } as unknown as import('../../types').TimingStats;
    const newState = reducer(INITIAL_STATE, { type: 'UPDATE_TIMING_STATS' as const, stats });
    expect(newState.timingStats.averageLatencyMs).toBe(12);
  });

  it('handles ADD_VALIDATION_EVENT and HISTORY', () => {
    const session = { name: 'V', events: [], dataHistory: [] } as unknown as import('../../types').ValidationSession;
    let state = reducer(INITIAL_STATE, { type: 'START_VALIDATION' as const, session });
    
    state = reducer(state, { type: 'ADD_VALIDATION_EVENT' as const, event: { type: 'info' } as unknown as import('../../types').ValidationEvent });
    expect(state.validationSession?.events.length).toBe(1);
    
    state = reducer(state, { type: 'UPDATE_VALIDATION_HISTORY' as const, entry: { timestamp: 1, fields: {} } });
    expect(state.validationSession?.dataHistory.length).toBe(1);
  });

  it('handles INIT_STATE', () => {
    const newStateData = { frameCount: 999 };
    const state = reducer(INITIAL_STATE, { type: 'INIT_STATE' as const, newState: newStateData });
    expect(state.frameCount).toBe(999);
  });

  it('handles SET_TELEMETRY_LAYOUT and persistence', () => {
    const action = { type: 'SET_TELEMETRY_LAYOUT' as const, profileId: 'p1', layout: ['f1'] };
    const newState = reducer(INITIAL_STATE, action);
    expect(newState.telemetryLayouts['p1']).toEqual(['f1']);
  });

  it('handles SET_RESPONDER_RULES', () => {
    const rules = [{ id: 'r1', condition: { type: 'match' }, actions: [] }] as unknown as import('../../types').ResponderRule[];
    const newState = reducer(INITIAL_STATE, { type: 'SET_RESPONDER_RULES' as const, rules });
    expect(newState.responderRules).toEqual(rules);
  });

  it('returns current state for unknown action type', () => {
    const newState = reducer(INITIAL_STATE, { type: 'UNKNOWN' as unknown as string } as unknown as Parameters<typeof reducer>[1]);
    expect(newState).toBe(INITIAL_STATE);
  });
});
