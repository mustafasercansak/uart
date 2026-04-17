import { describe, it, expect } from 'vitest';
import { FilterEngine } from '../FilterEngine';
import type { Exchange, FrameProfile } from '../../types';

describe('FilterEngine', () => {
    const mockExchange: Exchange = {
        id: 'ex1',
        tx: { rawHex: 'AA BB CC', status: 'ok' },
        rx: { rawHex: 'DD EE FF', status: 'fail' },
        latencyMs: 15
    } as any;

    const mockProfile: FrameProfile = {
        id: 'p1',
        fields: [
            { id: 'f1', name: 'CMD', order: 0, byteWidth: 1, endianness: 'little', type: 'fixed', typeConfig: { value: 0xAA } }
        ]
    } as any;

    describe('validate', () => {
        it('validates correct filter strings', () => {
            expect(FilterEngine.validate('bpm > 100').isValid).toBe(true);
            expect(FilterEngine.validate('status == error').isValid).toBe(true);
            expect(FilterEngine.validate('data contains "AA"').isValid).toBe(true);
        });

        it('identifies invalid tokens', () => {
            expect(FilterEngine.validate('bpm @#$ 100').isValid).toBe(false);
        });
    });

    describe('evaluate', () => {
        it('filters by basic status', () => {
            expect(FilterEngine.evaluate(mockExchange, 'error')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'tx')).toBe(true);
        });

        it('filters by hex content', () => {
            expect(FilterEngine.evaluate(mockExchange, 'AA BB')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'CC DD')).toBe(false);
        });

        it('evaluates comparison expressions', () => {
            expect(FilterEngine.evaluate(mockExchange, 'latency > 10')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency < 10')).toBe(false);
        });

        it('evaluates "contains" operator', () => {
            expect(FilterEngine.evaluate(mockExchange, 'data contains "AA BB"')).toBe(true);
        });

        it('handles logical AND (&&)', () => {
            expect(FilterEngine.evaluate(mockExchange, 'latency > 10 && src == tx')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency > 20 && src == tx')).toBe(false);
        });

        it('handles logical OR (||)', () => {
            expect(FilterEngine.evaluate(mockExchange, 'latency > 20 || src == tx')).toBe(true);
        });
    });
});
