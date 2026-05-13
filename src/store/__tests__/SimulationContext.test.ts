import { describe, it, expect } from 'vitest';
import { reducer, INITIAL_STATE, validateAndMigrateState, SimAction } from '../simulationReducer';

describe('SimulationContext Reducer', () => {
    it('handles START action', () => {
        const action: SimAction = { 
            type: 'START', 
            profileId: 'p1', 
            scenarioId: 's1', 
            outputMode: 'log' 
        };
        const newState = reducer(INITIAL_STATE, action);
        expect(newState.status).toBe('running');
        expect(newState.profileId).toBe('p1');
        expect(newState.scenarioId).toBe('s1');
        expect(newState.startedAt).not.toBeNull();
    });

    it('handles STOP/PAUSE/RESUME transitions', () => {
        let state = reducer(INITIAL_STATE, { type: 'START', profileId: 'p1', scenarioId: null, outputMode: 'log' });
        
        state = reducer(state, { type: 'PAUSE' });
        expect(state.status).toBe('paused');

        state = reducer(state, { type: 'RESUME' });
        expect(state.status).toBe('running');

        state = reducer(state, { type: 'STOP' });
        expect(state.status).toBe('stopped');
    });

    it('handles OVERRIDE_FIELD and RESET_OVERRIDES', () => {
        const state = reducer(INITIAL_STATE, { type: 'OVERRIDE_FIELD', fieldId: 'f1', value: 123 });
        expect(state.fieldOverrides['f1']).toBe(123);

        const resetState = reducer(state, { type: 'RESET_OVERRIDES' });
        expect(resetState.fieldOverrides).toEqual({});
    });

    it('handles MASTER_TICK by merging data', () => {
        const action: SimAction = {
            type: 'MASTER_TICK',
            elapsedMs: 500,
            updates: { frameCount: 1, lastFrame: { uId: '1', frameNumber: 1, timestampMs: 500, rawHex: 'AA', rawBytes: [], fields: [], errors: [] } },
            points: [{ t: 500, BPM: 80 }],
            logEntries: [{ time: '12:00', text: 'Test Log', type: 'info' }]
        };
        
        const state = reducer(INITIAL_STATE, action);
        expect(state.elapsedMs).toBe(500);
        expect(state.frameCount).toBe(1);
        expect(state.recentFrames.length).toBe(1);
        expect(state.waveformHistory.length).toBe(1);
        expect(state.logEntries.length).toBe(1);
        expect(state.logEntries[0].text).toBe('Test Log');
    });

    it('handles BATCH_UPDATE for multiple fields', () => {
        const action: SimAction = { 
            type: 'BATCH_UPDATE', 
            updates: { frameCount: 10, errorCount: 2 } 
        };
        const state = reducer(INITIAL_STATE, action);
        expect(state.frameCount).toBe(10);
        expect(state.errorCount).toBe(2);
    });

    it('handles INJECT_ERROR by queueing', () => {
        const state = reducer(INITIAL_STATE, { type: 'INJECT_ERROR', errorType: 'corrupt_checksum' });
        expect(state.pendingErrors).toEqual(['corrupt_checksum']);
    });
});

describe('validateAndMigrateState', () => {
    it('fills missing fields with INITIAL_STATE defaults', () => {
        const result = validateAndMigrateState({});
        expect(result.signalIntegrity).toEqual(INITIAL_STATE.signalIntegrity);
        expect(result.status).toBe(INITIAL_STATE.status);
        expect(result.dashboardLayout).toEqual(INITIAL_STATE.dashboardLayout);
    });

    it('preserves existing valid fields', () => {
        const result = validateAndMigrateState({
            signalIntegrity: { noiseLevel: 0.5, jitterMs: 10, bitFlipsEnabled: true },
            analyzerMode: false,
        });
        expect(result.signalIntegrity).toEqual({ noiseLevel: 0.5, jitterMs: 10, bitFlipsEnabled: true });
        expect(result.analyzerMode).toBe(false);
    });

    it('replaces null/undefined fields with defaults', () => {
        const result = validateAndMigrateState({ signalIntegrity: null, analyzerMode: undefined });
        expect(result.signalIntegrity).toEqual(INITIAL_STATE.signalIntegrity);
        expect(result.analyzerMode).toBe(INITIAL_STATE.analyzerMode);
    });

    it('INIT_STATE with missing signalIntegrity does not crash reducer', () => {
        const stateWithoutSignal = reducer(INITIAL_STATE, {
            type: 'INIT_STATE',
            newState: validateAndMigrateState({ analyzerMode: false }),
        });
        expect(stateWithoutSignal.signalIntegrity).toEqual(INITIAL_STATE.signalIntegrity);
        expect(stateWithoutSignal.analyzerMode).toBe(false);
    });
});
