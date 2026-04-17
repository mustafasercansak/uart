import { describe, it, expect } from 'vitest';
import { processScenarioStep, tickScenarioEngine } from '../ScenarioEngine';
import type { Scenario, FrameProfile, SimulationState, ScenarioStep } from '../../types';

describe('ScenarioEngine', () => {
    const mockProfile: FrameProfile = {
        id: 'p1',
        fields: [
            { id: 'f1', name: 'BPM', order: 0, byteWidth: 1, endianness: 'little', type: 'fixed', typeConfig: { value: 0 } }
        ]
    } as any;

    const mockState: SimulationState = {
        elapsedMs: 1000,
        fieldOverrides: {},
        bitOverrides: {},
        activeRamps: {},
        activePulses: {},
        pendingErrors: [],
        lastFrame: { fields: [{ name: 'BPM', decimal: 75 }] }
    } as any;

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
                steps: [
                    { id: 'step1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 } }
                ]
            } as any;
            
            const result = tickScenarioEngine(scenario, mockProfile, mockState);
            expect(result.executedSteps.length).toBe(1);
            expect(result.updates.fieldOverrides?.['f1']).toBe(100);
        });

        it('respects conditions (fail case)', () => {
            const scenario: Scenario = {
                steps: [
                    { 
                        id: 'step1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                        condition: { type: 'field_value', field: 'BPM', operator: '>', value: 100 } 
                    }
                ]
            } as any;
            // mockState has BPM=75, so condition 75 > 100 is false
            const result = tickScenarioEngine(scenario, mockProfile, mockState);
            expect(result.executedSteps.length).toBe(0);
        });

        it('respects conditions (success case)', () => {
          const scenario: Scenario = {
              steps: [
                  { 
                      id: 'step1', atMs: 1000, target: 'field:BPM', action: 'set', actionConfig: { value: 100 },
                      condition: { type: 'field_value', field: 'BPM', operator: '<', value: 100 } 
                  }
              ]
          } as any;
          const result = tickScenarioEngine(scenario, mockProfile, mockState);
          expect(result.executedSteps.length).toBe(1);
      });
    });
});
