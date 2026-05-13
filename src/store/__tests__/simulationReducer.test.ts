import { describe, it, expect, vi } from 'vitest';
import { reducer, INITIAL_STATE } from '../simulationReducer';
import type { SimulationState, ErrorType, GeneratedFrame, Exchange, ValidationSession, ValidationEvent } from '../../types';
import type { AutomationSequence } from '../../types/automation';

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

  it('handles SET_PROFILE, SET_SCENARIO, SET_OUTPUT_MODE, SET_RECORDING, SET_ANALYZER_MODE, SET_DISPLAY_FILTER, SET_TRIGGERS, SET_STATUS', () => {
    let state = reducer(INITIAL_STATE, { type: 'SET_PROFILE', profileId: 'p1' });
    expect(state.profileId).toBe('p1');
    state = reducer(state, { type: 'SET_SCENARIO', scenarioId: 's1' });
    expect(state.scenarioId).toBe('s1');
    state = reducer(state, { type: 'SET_OUTPUT_MODE', outputMode: 'tcp' });
    expect(state.outputMode).toBe('tcp');
    state = reducer(state, { type: 'SET_RECORDING', recording: true });
    expect(state.isRecording).toBe(true);
    state = reducer(state, { type: 'SET_ANALYZER_MODE', enabled: false });
    expect(state.analyzerMode).toBe(false);
    state = reducer(state, { type: 'SET_DISPLAY_FILTER', filter: 'f1' });
    expect(state.displayFilter).toBe('f1');
    state = reducer(state, { type: 'SET_TRIGGERS', triggers: [] });
    expect(state.triggers).toEqual([]);
    state = reducer(state, { type: 'SET_STATUS', status: 'paused' });
    expect(state.status).toBe('paused');
  });

  it('handles MASTER_TICK logicHistory initialization when tx-main is missing', () => {
    const state: SimulationState = { ...INITIAL_STATE, logicHistory: [] };
    const action = {
      type: 'MASTER_TICK' as const,
      updates: {
        lastFrame: {
          frameNumber: 1,
          bitStream: [{ t: 0, v: 0 }]
        } as unknown as GeneratedFrame
      },
      points: [],
      logEntries: [],
      elapsedMs: 100
    };
    const newState = reducer(state, action);
    expect(newState.logicHistory.length).toBe(1);
    expect(newState.logicHistory[0].id).toBe('tx-main');
  });

  it('handles ADD_CONVERSATION', () => {
    const entry = { id: 'c1', role: 'system', text: 'hi' } as unknown as import('../../types').ConversationEntry;
    const newState = reducer(INITIAL_STATE, { type: 'ADD_CONVERSATION', entry });
    expect(newState.conversationLogs.length).toBe(1);
    expect(newState.conversationLogs[0].id).toBe('c1');
  });

  it('handles persistence failure in SET_TELEMETRY_LAYOUT', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });

    const action = { type: 'SET_TELEMETRY_LAYOUT' as const, profileId: 'p1', layout: ['f1'] };
    reducer(INITIAL_STATE, action);

    expect(consoleSpy).toHaveBeenCalledWith('Layout persistence failed', expect.any(Error));

    consoleSpy.mockRestore();
    localStorageSpy.mockRestore();
  });

  it('returns current state for unknown action type', () => {
    const newState = reducer(INITIAL_STATE, { type: 'UNKNOWN' as unknown as string } as unknown as Parameters<typeof reducer>[1]);
    expect(newState).toBe(INITIAL_STATE);
  });

  describe('Expanded Branch Coverage', () => {
    it('MASTER_TICK: handles nullish fallbacks for updates and timing', () => {
      // 1. updates.lastFrame is missing -> updatedRecent = state.recentFrames
      const state1 = { ...INITIAL_STATE, recentFrames: [{ frameNumber: 1 } as unknown as GeneratedFrame] };
      const action1 = { type: 'MASTER_TICK' as const, updates: {}, points: [], logEntries: [], elapsedMs: undefined as unknown as number };
      const res1 = reducer(state1, action1);
      expect(res1.recentFrames.length).toBe(1);
      expect(res1.elapsedMs).toBe(INITIAL_STATE.elapsedMs);

      // 2. logicHistory mapping for non-matching IDs
      const state2: SimulationState = {
        ...INITIAL_STATE,
        logicHistory: [
          { id: 'tx-main', name: 'M', transitions: [] },
          { id: 'other', name: 'O', transitions: [] }
        ]
      };
      const action2 = {
        type: 'MASTER_TICK' as const,
        updates: { lastFrame: { bitStream: [{ t: 0, v: 0 }] } as unknown as GeneratedFrame },
        points: [], logEntries: [], elapsedMs: 50
      };
      const res2 = reducer(state2, action2);
      expect(res2.logicHistory.find(s => s.id === 'other')?.transitions.length).toBe(0);
      expect(res2.logicHistory.find(s => s.id === 'tx-main')?.transitions.length).toBe(1);
    });

    it('UPDATE_EXCHANGE: handles existing exchange and missing rx frame', () => {
      const exchange = { id: 'ex1', status: 'pending' } as unknown as Exchange;
      const state = { ...INITIAL_STATE, exchanges: [exchange] };
      const updated = { id: 'ex1', status: 'done' } as unknown as Exchange;

      const res = reducer(state, { type: 'UPDATE_EXCHANGE', exchange: updated });
      expect(res.exchanges.length).toBeGreaterThan(0);
      expect(res.exchanges[0].status).toBe('done');
      expect(res.lastRxFrame).toBe(INITIAL_STATE.lastRxFrame);
    });

    it('SAVE_SNAPSHOT: prevents duplicates', () => {
      const frame = { frameNumber: 5 } as unknown as GeneratedFrame;
      const state = { ...INITIAL_STATE, snapshots: [frame] };
      const res = reducer(state, { type: 'SAVE_SNAPSHOT', frame });
      expect(res).toBe(state); // Strict equality because of early return
    });

    it('INIT_STATE: handles diverse undefined fields', () => {
      const res = reducer(INITIAL_STATE, {
        type: 'INIT_STATE',
        newState: {
          // missing serialConnected, diffFrames, etc.
          telemetryLayouts: undefined,
          dashboardLayout: undefined,
          watchlist: undefined,
          snapshots: undefined
        }
      });
      expect(res.serialConnected).toBe(INITIAL_STATE.serialConnected);
      expect(res.telemetryLayouts).toEqual({});
      expect(res.dashboardLayout).toEqual({ widgets: [] });
    });

    it('Validation: early returns when no session active', () => {
      expect(reducer(INITIAL_STATE, { type: 'STOP_VALIDATION', endTime: 0, score: 0 })).toBe(INITIAL_STATE);
      expect(reducer(INITIAL_STATE, { type: 'ADD_VALIDATION_EVENT', event: {} as unknown as ValidationEvent })).toBe(INITIAL_STATE);
      expect(reducer(INITIAL_STATE, { type: 'UPDATE_VALIDATION_HISTORY', entry: { timestamp: 0, fields: {} } })).toBe(INITIAL_STATE);
    });

    it('Dashboard: handles missing widgets gracefully', () => {
      const state = { ...INITIAL_STATE, dashboardLayout: undefined as unknown as SimulationState['dashboardLayout'] };
      const resAdd = reducer(state, { type: 'ADD_WIDGET', widget: { id: 'w1' } as unknown as import('../../types').DashboardWidget });
      expect(resAdd.dashboardLayout?.widgets.length).toBe(1);

      const resRem = reducer(state, { type: 'REMOVE_WIDGET', id: 'w1' });
      expect(resRem.dashboardLayout?.widgets.length).toBe(0);
    });

    it('ADD_LOG: respects max log entries', () => {
      let state = INITIAL_STATE;
      for (let i = 0; i < 110; i++) {
        state = reducer(state, { type: 'ADD_LOG', entryType: 'info', text: String(i) });
      }
      expect(state.logEntries.length).toBe(100);
      expect(state.logEntries[99].text).toBe('109');
    });

    it('MASTER_TICK: handles missing bitStream and watchlist updates', () => {
      const action = {
        type: 'MASTER_TICK' as const,
        updates: {
          lastFrame: { frameNumber: 1, bitStream: undefined } as unknown as GeneratedFrame,
          watchlist: undefined
        },
        points: [], logEntries: [], elapsedMs: 100
      };
      const res = reducer(INITIAL_STATE, action);
      expect(res.logicHistory[0].transitions.length).toBe(0);
      expect(res.watchlist).toBe(INITIAL_STATE.watchlist);
    });

    it('MASTER_TICK: handles defined selectedExchangeId update', () => {
      const action = {
        type: 'MASTER_TICK' as const,
        updates: { selectedExchangeId: 'new-ex' },
        points: [], logEntries: [], elapsedMs: 100
      };
      const res = reducer(INITIAL_STATE, action);
      expect(res.selectedExchangeId).toBe('new-ex');
    });

    it('INIT_STATE: handles partial overrides specifically for coverage', () => {
      // Branch action.newState.watchlist is present
      const res1 = reducer(INITIAL_STATE, {
        type: 'INIT_STATE',
        newState: { watchlist: ['f1'] }
      });
      expect(res1.watchlist).toEqual(['f1']);

      // Branch action.newState.watchlist is absent, but state.watchlist is present
      const stateWithWatch = { ...INITIAL_STATE, watchlist: ['f2'] };
      const res2 = reducer(stateWithWatch, { type: 'INIT_STATE', newState: {} });
      expect(res2.watchlist).toEqual(['f2']);
    });

    it('BATCH_LOGS: handles max length overflow', () => {
      let state = INITIAL_STATE;
      const entries = Array(110).fill({ time: '1', text: 'x', type: 'info' });
      state = reducer(state, { type: 'BATCH_LOGS', entries });
      expect(state.logEntries.length).toBe(100);
    });

    describe('Sequence Actions', () => {
      it('handles SET_ACTIVE_SEQUENCE', () => {
        const action = { type: 'SET_ACTIVE_SEQUENCE' as const, id: 'seq-1' };
        const newState = reducer(INITIAL_STATE, action);
        expect(newState.activeSequenceId).toBe('seq-1');
      });

      it('handles SAVE_SEQUENCE: adds new sequence', () => {
        const sequence = { id: 'seq-1', name: 'Test Sequence', steps: [] } as unknown as AutomationSequence;
        const action = { type: 'SAVE_SEQUENCE' as const, sequence };
        const newState = reducer(INITIAL_STATE, action);
        expect(newState.sequences.length).toBe(1);
        expect(newState.sequences[0].id).toBe('seq-1');
      });

      it('handles SAVE_SEQUENCE: updates existing sequence', () => {
        const sequence1 = { id: 'seq-1', name: 'Old' } as AutomationSequence;
        const state = { ...INITIAL_STATE, sequences: [sequence1] };
        const sequence2 = { id: 'seq-1', name: 'New' } as AutomationSequence;
        const action = { type: 'SAVE_SEQUENCE' as const, sequence: sequence2 };
        const newState = reducer(state, action);
        expect(newState.sequences.length).toBe(1);
        expect(newState.sequences[0].name).toBe('New');
      });

      it('handles DELETE_SEQUENCE', () => {
        const sequence = { id: 'seq-1' } as AutomationSequence;
        const state = { ...INITIAL_STATE, sequences: [sequence], activeSequenceId: 'seq-1' };

        // Delete active sequence
        const state1 = reducer(state, { type: 'DELETE_SEQUENCE' as const, id: 'seq-1' });
        expect(state1.sequences.length).toBe(0);
        expect(state1.activeSequenceId).toBeNull();

        // Delete non-active sequence
        const state2 = { ...INITIAL_STATE, sequences: [{ id: 'seq-1' }, { id: 'seq-2' }] as AutomationSequence[], activeSequenceId: 'seq-2' };
        const state3 = reducer(state2, { type: 'DELETE_SEQUENCE' as const, id: 'seq-1' });
        expect(state3.sequences.length).toBe(1);
        expect(state3.activeSequenceId).toBe('seq-2');
      });

      it('handles SET_SEQUENCES', () => {
        const sequences = [{ id: 'seq-1' }, { id: 'seq-2' }] as AutomationSequence[];
        const action = { type: 'SET_SEQUENCES' as const, sequences };
        const newState = reducer(INITIAL_STATE, action);
        expect(newState.sequences).toEqual(sequences);
      });

      it('handles CLEAR_EXCHANGES', () => {
        const state = { ...INITIAL_STATE, exchanges: [{ id: 'ex1' }] as Exchange[], selectedExchangeId: 'ex1' };
        const action = { type: 'CLEAR_EXCHANGES' as const };
        const newState = reducer(state, action);
        expect(newState.exchanges.length).toBe(0);
        expect(newState.selectedExchangeId).toBeNull();
      });
    });
  });
});
