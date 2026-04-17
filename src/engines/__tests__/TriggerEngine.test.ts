import { describe, it, expect } from 'vitest';
import { evaluateTriggers } from '../TriggerEngine';
import type { Trigger, GeneratedFrame, SimulationState } from '../../types';

describe('TriggerEngine', () => {
    const mockFrame: GeneratedFrame = {
        frameNumber: 100,
        fields: [
            { name: 'BPM', decimal: 120, hex: '78' },
            { name: 'SPO2', decimal: 88, hex: '58' }
        ]
    } as any;

    const mockState: SimulationState = {
        elapsedMs: 5000,
        errorCount: 2
    } as any;

    it('triggers when condition is met', () => {
        const triggers: Trigger[] = [
            {
                id: 't1', name: 'High HR', enabled: true,
                condition: 'BPM > 100', action: 'log_warning'
            }
        ];
        const results = evaluateTriggers(triggers, mockFrame, mockState);
        expect(results.length).toBe(1);
        expect(results[0].triggerName).toBe('High HR');
    });

    it('handles complex conditions with multiple fields', () => {
        const triggers: Trigger[] = [
            {
                id: 't2', name: 'Critical State', enabled: true,
                condition: 'BPM > 100 && SPO2 < 90', action: 'inject_error'
            }
        ];
        const results = evaluateTriggers(triggers, mockFrame, mockState);
        expect(results.length).toBe(1);
        expect(results[0].action).toBe('inject_error');
    });

    it('supports state variables like frameCount', () => {
        const triggers: Trigger[] = [
            {
                id: 't3', name: 'Wait for 100 frames', enabled: true,
                condition: 'frameCount >= 100', action: 'stop_simulation'
            }
        ];
        const results = evaluateTriggers(triggers, mockFrame, mockState);
        expect(results.length).toBe(1);
    });

    it('respects disabled triggers', () => {
        const triggers: Trigger[] = [
            {
                id: 't4', name: 'Disabled', enabled: false,
                condition: 'true', action: 'log_warning'
            }
        ];
        const results = evaluateTriggers(triggers, mockFrame, mockState);
        expect(results.length).toBe(0);
    });

    it('respects cooldown timer', () => {
        const triggers: Trigger[] = [
            {
                id: 't5', name: 'Cooldown Test', enabled: true,
                condition: 'true', action: 'log_warning',
                cooldownMs: 1000,
                lastTriggeredAt: Date.now() - 500 // triggered 500ms ago
            }
        ];
        const results = evaluateTriggers(triggers, mockFrame, mockState);
        expect(results.length).toBe(0);
    });
});
