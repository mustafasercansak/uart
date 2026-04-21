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
    });
});
