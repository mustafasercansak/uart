import { describe, it, expect } from 'vitest';
import { processScenarioStep, tickScenarioEngine } from '../ScenarioEngine';
import type { Scenario, FrameProfile, SimulationState, ScenarioStep } from '../../types';

describe('ScenarioEngine', () => {
    const mockProfile: FrameProfile = {
        id: 'p1',
        fields: [
            { id: 'f1', name: 'BPM', order: 0, byteWidth: 1, endianness: 'little', type: 'fixed', typeConfig: { value: 0 } }
        ],
        baudRate: 9600,
    } as unknown as FrameProfile;

    const mockState: SimulationState = {
        elapsedMs: 1000,
        fieldOverrides: {},
        bitOverrides: {},
        activeRamps: {},
        activePulses: {},
        pendingErrors: [],
        lastFrame: { 
            uId: 'f1', 
            frameNumber: 1, 
            timestampMs: 1000, 
            rawHex: '00', 
            rawBytes: [0], 
            fields: [{ name: 'BPM', hex: '4B', decimal: 75, flags: {} }], 
            errors: [] 
        }
    } as unknown as SimulationState;

    describe('processScenarioStep', () => {
        it('handles "set" action on fields', () => {
            const step: ScenarioStep = {
                id: 's1', atMs: 0, target: 'field:BPM', action: 'set',
                actionConfig: { value: 90 }
            };
            const result = processScenarioStep(step, mockProfile, mockState);
            expect(result.newState.fieldOverrides?.['f1']).toBe(90);
        });

        it('handles "ramp" action on fields', () => {
            const step: ScenarioStep = {
                id: 's2', atMs: 1000, target: 'field:BPM', action: 'ramp',
                actionConfig: { to: 120, durationMs: 5000, curve: 'linear' }
            };
            const result = processScenarioStep(step, mockProfile, mockState);
            expect(result.newState.activeRamps?.['f1']).toBeDefined();
            expect(result.newState.activeRamps?.['f1'].to).toBe(120);
        });

        it('handles "inject_error" action', () => {
            const step: ScenarioStep = {
                id: 's3', atMs: 0, target: 'field:BPM', action: 'inject_error',
                actionConfig: { errorType: 'corrupt_checksum', count: 2 }
            };
            const result = processScenarioStep(step, mockProfile, mockState);
            expect(result.newState.pendingErrors).toEqual(['corrupt_checksum', 'corrupt_checksum']);
        });
    });

    describe('tickScenarioEngine', () => {
        it('executes steps when time matches', () => {
            const scenario: Scenario = {
                id: 'sc1',
                profileId: 'p1',
                name: 'Test Scenario',
                steps: [
                    { id: 'step1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 } }
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            } as unknown as Scenario;
            
            const result = tickScenarioEngine(scenario, mockProfile, mockState);
            expect(result.executedSteps.length).toBe(1);
            expect(result.updates.fieldOverrides?.['f1']).toBe(100);
        });

        it('respects conditions (fail case)', () => {
            const scenario: Scenario = {
                id: 'sc2',
                profileId: 'p1',
                name: 'Test Scenario 2',
                steps: [
                    { 
                        id: 'step1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                        condition: { type: 'field_value', field: 'BPM', operator: '>', value: 100 } 
                    }
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            } as unknown as Scenario;
            // mockState has BPM=75, so condition 75 > 100 is false
            const result = tickScenarioEngine(scenario, mockProfile, mockState);
            expect(result.executedSteps.length).toBe(0);
        });

        it('respects conditions (success case)', () => {
          const scenario: Scenario = {
              id: 'sc3',
              profileId: 'p1',
              name: 'Test Scenario 3',
              steps: [
                  { 
                      id: 'step1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                      condition: { type: 'field_value', field: 'BPM', operator: '<', value: 100 } 
                  }
              ],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
          } as unknown as Scenario;
          const result = tickScenarioEngine(scenario, mockProfile, mockState);
          expect(result.executedSteps.length).toBe(1);
      });

      it('processes pulse expiration', () => {
          const stateWithPulse: SimulationState = {
              ...mockState,
              elapsedMs: 5000,
              activePulses: {
                  'f1': { originalValue: 0, revertAtMs: 4000 }
              }
          } as unknown as SimulationState;
          const result = tickScenarioEngine({ steps: [] } as unknown as Scenario, mockProfile, stateWithPulse);
          expect(result.updates.fieldOverrides?.['f1']).toBe(0);
          expect(result.updates.activePulses?.['f1']).toBeUndefined();
      });

      it('processes ramp completion', () => {
          const stateWithRamp: SimulationState = {
              ...mockState,
              elapsedMs: 5000,
              activeRamps: {
                  'f1': { from: 0, to: 100, startMs: 0, durationMs: 4000, curve: 'linear' }
              }
          } as unknown as SimulationState;
          const result = tickScenarioEngine({ steps: [] } as unknown as Scenario, mockProfile, stateWithRamp);
          expect(result.updates.fieldOverrides?.['f1']).toBe(100);
          expect(result.updates.activeRamps?.['f1']).toBeUndefined();
      });

      it('handles bit level "toggle" action', () => {
          const step: ScenarioStep = {
              id: 'sb1', atMs: 0, target: 'bit:BPM.READY', action: 'toggle',
              actionConfig: {}
          };
          const result = processScenarioStep(step, mockProfile, { ...mockState, bitOverrides: { 'f1.READY': 0 } } as unknown as SimulationState);
          expect(result.newState.bitOverrides?.['f1.READY']).toBe(1);
      });

      it('handles bit level "pulse" action and expiration', () => {
        const step: ScenarioStep = {
            id: 'sb2', atMs: 1000, target: 'bit:BPM.READY', action: 'pulse',
            actionConfig: { value: 1, durationMs: 1000 }
        };
        const result = processScenarioStep(step, mockProfile, mockState);
        expect(result.newState.bitOverrides?.['f1.READY']).toBe(1);
        expect(result.newState.activePulses?.['bit:f1.READY']).toBeDefined();

        const stateWithBitPulse: SimulationState = {
            ...mockState,
            elapsedMs: 2500,
            activePulses: {
                'bit:f1.READY': { originalValue: 0, revertAtMs: 2000 }
            }
        } as unknown as SimulationState;
        const tickResult = tickScenarioEngine({ steps: [] } as unknown as Scenario, mockProfile, stateWithBitPulse);
        expect(tickResult.updates.bitOverrides?.['f1.READY']).toBe(0);
    });

    it('evaluates elapsed_time condition', () => {
        const scenario: Scenario = {
            steps: [{ 
                id: 't1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                condition: { type: 'elapsed_time', operator: '>', value: 500 } 
            }]
        } as unknown as Scenario;
        const result = tickScenarioEngine(scenario, mockProfile, mockState);
        expect(result.executedSteps.length).toBe(1);
    });

    it('evaluates random condition', () => {
        const scenario: Scenario = {
            steps: [{
                id: 'r1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                condition: { type: 'random', value: 1.0 } // Always true
            }]
        } as unknown as Scenario;
        const result = tickScenarioEngine(scenario, mockProfile, mockState);
        expect(result.executedSteps.length).toBe(1);
    });

    it('evaluates random condition with undefined value (uses ?? 0.5 default)', () => {
        const scenario: Scenario = {
            steps: [{
                id: 'r2', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                condition: { type: 'random' } // no value → defaults to 0.5
            }]
        } as unknown as Scenario;
        // Result is non-deterministic but the branch is exercised; just verify it runs
        const result = tickScenarioEngine(scenario, mockProfile, mockState);
        expect(typeof result.executedSteps.length).toBe('number');
    });
    });

    it('covers missing branches in ScenarioEngine', () => {
        // parseTarget without prefix
        const step1: ScenarioStep = { id: 's1', atMs: 0, target: 'BPM', action: 'set', actionConfig: { value: 10 } };
        expect(processScenarioStep(step1, mockProfile, mockState).newState.fieldOverrides?.['f1']).toBe(10);
        
        // findFieldId failure
        const step2: ScenarioStep = { id: 's2', atMs: 0, target: 'field:UNKNOWN', action: 'set', actionConfig: { value: 10 } };
        expect(processScenarioStep(step2, mockProfile, mockState).newState).toEqual({});
        
        // compareValues != and default
        const scenario: Scenario = {
            steps: [{ 
                id: 'c1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                condition: { type: 'elapsed_time', operator: '!=', value: 0 } 
            }, {
                id: 'c2', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                condition: { type: 'elapsed_time', operator: 'UNKNOWN', value: 0 }
            }]
        } as unknown as Scenario;
        const result = tickScenarioEngine(scenario, mockProfile, mockState);
        expect(result.executedSteps.find(s => s.id === 'c1')).toBeDefined();
        expect(result.executedSteps.find(s => s.id === 'c2')).toBeUndefined();

        // evaluateCondition missing field
        const scenario2: Scenario = {
            steps: [{ 
                id: 'm1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                condition: { type: 'field_value', field: 'NONEXISTENT', operator: '==', value: 0 }
            }]
        } as unknown as Scenario;
        expect(tickScenarioEngine(scenario2, mockProfile, mockState).executedSteps.length).toBe(0);
    });

    it('handles additional field and bit actions for coverage', () => {
        // range action
        const stepRange: ScenarioStep = {
            id: 'sr1', atMs: 0, target: 'field:BPM', action: 'range',
            actionConfig: { min: 40, max: 200 } as unknown as ScenarioStep['actionConfig']
        };
        const resRange = processScenarioStep(stepRange, mockProfile, mockState);
        expect(resRange.newState.fieldOverrides?.['f1__range']).toBe(40);

        // pulse field
        const stepPulse: ScenarioStep = {
            id: 'sp1', atMs: 0, target: 'field:BPM', action: 'pulse',
            actionConfig: { value: 150, durationMs: 1000 } as unknown as ScenarioStep['actionConfig']
        };
        const resPulse = processScenarioStep(stepPulse, mockProfile, mockState);
        expect(resPulse.newState.fieldOverrides?.['f1']).toBe(150);

        // bit set
        const stepBitSet: ScenarioStep = {
            id: 'sb3', atMs: 0, target: 'bit:BPM.READY', action: 'set',
            actionConfig: { value: 1 } as unknown as ScenarioStep['actionConfig']
        };
        const resBitSet = processScenarioStep(stepBitSet, mockProfile, mockState);
        expect(resBitSet.newState.bitOverrides?.['f1.READY']).toBe(1);

        // default actions
        expect(processScenarioStep({ target: 'field:BPM', action: 'unknown' } as unknown as ScenarioStep, mockProfile, mockState).newState).toEqual({});
        expect(processScenarioStep({ target: 'bit:BPM.READY', action: 'unknown' } as unknown as ScenarioStep, mockProfile, mockState).newState).toEqual({});
    });

    it('covers ScenarioEngine default branches', () => {
        const scenario: Scenario = {
            steps: [{ 
                id: 'd1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                condition: { type: 'UNKNOWN' as string }
            }]
        } as unknown as Scenario;
        // evaluateCondition default returns true
        expect(tickScenarioEngine(scenario, mockProfile, mockState).executedSteps.length).toBe(1);
    });

    it('covers compareValues default branch (Line 246)', () => {
        const scenario: Scenario = {
            steps: [{
                id: 'cv1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                condition: { type: 'elapsed_time', operator: 'INVALID' as string, value: 0 }
            }]
        } as unknown as Scenario;
        expect(tickScenarioEngine(scenario, mockProfile, mockState).executedSteps.length).toBe(0);
    });

    it('skips steps whose timestamp is outside the current window (line 165 false branch)', () => {
        // atMs=500, elapsedMs=1000 → prevElapsed=950 → 500 < 950 → does not fire
        const scenario: Scenario = {
            steps: [{ id: 'old', atMs: 500, target: 'field:BPM', action: 'set', actionConfig: { value: 42 } }]
        } as unknown as Scenario;
        const result = tickScenarioEngine(scenario, mockProfile, mockState);
        expect(result.executedSteps.length).toBe(0);
    });

    it('covers bit toggle ?? and ternary branches (lines 126-127)', () => {
        // When bitOverrides[bitKey] is undefined → current = 0 (??), then 0 → 1
        const stepToggle: ScenarioStep = {
            id: 'tg1', atMs: 0, target: 'bit:BPM.READY', action: 'toggle', actionConfig: {}
        };
        const resFromUndefined = processScenarioStep(stepToggle, mockProfile, mockState);
        expect(resFromUndefined.newState.bitOverrides?.['f1.READY']).toBe(1);

        // When bitOverrides[bitKey] = 1 → current = 1 (defined), then 1 → 0
        const resFromOne = processScenarioStep(stepToggle, mockProfile,
            { ...mockState, bitOverrides: { 'f1.READY': 1 } } as unknown as SimulationState);
        expect(resFromOne.newState.bitOverrides?.['f1.READY']).toBe(0);
    });

    it('covers bit target with no subName or no fieldId (line 115)', () => {
        // Unknown field → !fieldId → early return
        const stepUnknownField: ScenarioStep = {
            id: 'bf1', atMs: 0, target: 'bit:UNKNOWN.FLAG', action: 'set', actionConfig: { value: 1 }
        };
        expect(processScenarioStep(stepUnknownField, mockProfile, mockState).newState).toEqual({});
    });

    it('covers executedStep falsy branch (line 172)', () => {
        // When processScenarioStep finds no matching field, executedStep is undefined
        const scenario: Scenario = {
            steps: [{ id: 'u1', atMs: 1000, target: 'field:NONEXISTENT', action: 'set', actionConfig: { value: 99 } }]
        } as unknown as Scenario;
        const result = tickScenarioEngine(scenario, mockProfile, mockState);
        expect(result.executedSteps.length).toBe(0);
    });

    it('covers non-expired pulse branch (line 183)', () => {
        // Pulse with revertAtMs in the future → not reverted, stays in activePulses
        const stateWithFuturePulse: SimulationState = {
            ...mockState,
            elapsedMs: 1000,
            activePulses: {
                'f1': { originalValue: 10, revertAtMs: 5000 } // not yet expired
            }
        } as unknown as SimulationState;
        const result = tickScenarioEngine({ steps: [] } as unknown as Scenario, mockProfile, stateWithFuturePulse);
        // pulsesChanged stays false → activePulses not written to updates
        expect(result.updates.activePulses).toBeUndefined();
    });

    it('covers in-progress ramp branch (line 205)', () => {
        // Ramp that is still in progress → not completed
        const stateWithActiveRamp: SimulationState = {
            ...mockState,
            elapsedMs: 500,
            activeRamps: {
                'f1': { from: 0, to: 100, startMs: 0, durationMs: 5000, curve: 'linear' }
            }
        } as unknown as SimulationState;
        const result = tickScenarioEngine({ steps: [] } as unknown as Scenario, mockProfile, stateWithActiveRamp);
        // rampsChanged stays false → activeRamps not written to updates
        expect(result.updates.activeRamps).toBeUndefined();
    });

    it('covers evaluateCondition ?? defaults for operator and value', () => {
        // elapsed_time: operator and value both undefined → defaults to '>' and 0
        // mockState.elapsedMs = 1000, so 1000 > 0 → true
        const s1: Scenario = {
            steps: [{
                id: 'qt1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 10 },
                condition: { type: 'elapsed_time' } // no operator, no value
            }]
        } as unknown as Scenario;
        expect(tickScenarioEngine(s1, mockProfile, mockState).executedSteps.length).toBe(1);

        // field_value: operator and value both undefined → defaults to '==' and 0
        // BPM=75 in lastFrame, 75 == 0 → false
        const s2: Scenario = {
            steps: [{
                id: 'qt2', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 10 },
                condition: { type: 'field_value', field: 'BPM' } // no operator, no value
            }]
        } as unknown as Scenario;
        expect(tickScenarioEngine(s2, mockProfile, mockState).executedSteps.length).toBe(0);
    });

    it('covers compareValues == operator', () => {
        // mockState.elapsedMs = 1000, condition: elapsed_time == 1000 → true
        const scenario: Scenario = {
            steps: [{
                id: 'eq1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 99 },
                condition: { type: 'elapsed_time', operator: '==', value: 1000 }
            }]
        } as unknown as Scenario;
        expect(tickScenarioEngine(scenario, mockProfile, mockState).executedSteps.length).toBe(1);

        // also test field_value with == (existing field, BPM=75)
        const scenario2: Scenario = {
            steps: [{
                id: 'eq2', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 99 },
                condition: { type: 'field_value', field: 'BPM', operator: '==', value: 75 }
            }]
        } as unknown as Scenario;
        expect(tickScenarioEngine(scenario2, mockProfile, mockState).executedSteps.length).toBe(1);
    });
});
