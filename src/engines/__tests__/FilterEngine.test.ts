import { describe, it, expect, vi } from 'vitest';
import { FilterEngine } from '../FilterEngine';
import type { Exchange, FrameProfile } from '../../types';

describe('FilterEngine', () => {
    const mockExchange: Exchange = {
        id: 'ex1',
        tx: { rawHex: 'AA BB CC', status: 'ok' },
        rx: { rawHex: 'DD EE FF', status: 'fail' },
        latencyMs: 15
    } as unknown as Exchange;

    const mockProfile: FrameProfile = {
        id: 'p1',
        fields: [
            { id: 'f1', name: 'CMD', order: 0, byteWidth: 1, endianness: 'little', type: 'fixed', typeConfig: { value: 0xAA } }
        ]
    } as unknown as FrameProfile;

    describe('validate', () => {
        it('validates correct filter strings', () => {
            expect(FilterEngine.validate('bpm > 100').isValid).toBe(true);
            expect(FilterEngine.validate('status == error').isValid).toBe(true);
            expect(FilterEngine.validate('data contains "AA"').isValid).toBe(true);
            expect(FilterEngine.validate('').isValid).toBe(true);
            expect(FilterEngine.validate('label == "value with spaces"').isValid).toBe(true);
        });

        it('treats symbol-only queries as valid text searches (no match but not error)', () => {
            // With text+hex search, any query without operators is a valid search term
            expect(FilterEngine.validate('bpm @#$ 100').isValid).toBe(true);
        });

        it('handles unexpected types in validate', () => {
            // Trigger catch in validate
            expect(FilterEngine.validate({} as unknown as string).isValid).toBe(false);
        });
    });

    describe('evaluate', () => {
        it('filters by basic status', () => {
            expect(FilterEngine.evaluate(mockExchange, 'error')).toBe(true);
            expect(FilterEngine.evaluate({ ...mockExchange, isLoopbackMatch: true }, 'err')).toBe(false);
            expect(FilterEngine.evaluate(mockExchange, 'tx')).toBe(true);
            expect(FilterEngine.evaluate({ id: 'rx-only', rx: mockExchange.rx } as unknown as Exchange, 'rx')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, '!error')).toBe(false);
        });

        it('filters by hex content', () => {
            expect(FilterEngine.evaluate(mockExchange, 'AA BB')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'CC DD')).toBe(false);
        });

        it('evaluates comparison expressions', () => {
            expect(FilterEngine.evaluate(mockExchange, 'latency > 10')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency < 10')).toBe(false);
            expect(FilterEngine.evaluate(mockExchange, 'latency >= 15')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency <= 15')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency != 10')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency != 15')).toBe(false);
            expect(FilterEngine.evaluate(mockExchange, 'size == 3')).toBe(true);
        });

        it('evaluates hex value comparisons', () => {
            expect(FilterEngine.evaluate(mockExchange, 'len == 0x03')).toBe(true);
        });

        it('evaluates "contains" operator', () => {
            expect(FilterEngine.evaluate(mockExchange, 'data contains "AA BB"')).toBe(true);
        });

        it('filters by additional standard fields', () => {
            expect(FilterEngine.evaluate(mockExchange, 'id == ex1')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'status == ok')).toBe(true);
            expect(FilterEngine.evaluate({ id: 'nostatus', tx: { rawHex: 'AA' } } as unknown as Exchange, 'status == ok')).toBe(true);
            expect(FilterEngine.evaluate({ id: 'rx-only', rx: { rawHex: 'DD EE', status: 'ok' } } as unknown as Exchange, 'src == rx')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'hex contains "AA BB"')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'data contains "11 22"')).toBe(false);
            expect(FilterEngine.evaluate(mockExchange, 'rx')).toBe(true);
        });

        it('handles unknown fields and fallback search', () => {
             // Unknown field should return false
             expect(FilterEngine.evaluate(mockExchange, 'unknown_field == 1')).toBe(false);
             expect(FilterEngine.evaluate({ id: 'empty' } as unknown as Exchange, 'latency == 0')).toBe(false);
             
             // Fallback search via evaluateCondition (bypassing shortcut with logical op)
             // mockExchange.tx.rawHex is 'AA BB CC'
             expect(FilterEngine.evaluate(mockExchange, 'tx && AA BB')).toBe(true);
             expect(FilterEngine.evaluate(mockExchange, 'tx && ZZ ZZ')).toBe(false);
        });

        it('handles logical AND (&&)', () => {
            expect(FilterEngine.evaluate(mockExchange, 'latency > 10 && src == tx')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency > 20 && src == tx')).toBe(false);
        });

        it('handles logical OR (||)', () => {
            expect(FilterEngine.evaluate(mockExchange, 'latency > 20 || src == tx')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency > 20 || src == rx')).toBe(false);
        });

        it('filters by profile fields', () => {
            expect(FilterEngine.evaluate(mockExchange, 'CMD == 170', mockProfile)).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'CMD > 100', mockProfile)).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'CMD < 50', mockProfile)).toBe(false);
        });

        it('filters by flags in profile', () => {
             const profileWithFlag: FrameProfile = {
                 id: 'p2',
                 fields: [
                     { id: 'f2', name: 'STATUS', order: 0, byteWidth: 1, type: 'flags', typeConfig: { bits: [{ index: 0, name: 'error', label: 'E' }] } }
                 ]
             } as unknown as FrameProfile;
             const exchangeWithFlag: Exchange = {
                 tx: { rawHex: '01' }
             } as unknown as Exchange;
             expect(FilterEngine.evaluate(exchangeWithFlag, 'error == 1', profileWithFlag)).toBe(true);
             expect(FilterEngine.evaluate(exchangeWithFlag, 'error == 0', profileWithFlag)).toBe(false);
        });

        it('handles errors gracefully in evaluate', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            // Trigger catch in evaluate
            expect(FilterEngine.evaluate(null as unknown as Exchange, 'AA BB')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, null as unknown as string)).toBe(true);
            
            consoleSpy.mockRestore();
        });

        it('covers default branch in evaluateCondition', () => {
            // Craft a condition that has an unknown operator to hit 'default' in switch
            expect(FilterEngine.evaluate(mockExchange, 'latency ??? 10')).toBe(false);
        });

        it('matches a symbolic operator with no surrounding spaces', () => {
            // latency==15 — operator detected via bare indexOf fallback (lines 105-109)
            expect(FilterEngine.evaluate(mockExchange, 'latency==15')).toBe(true);
            expect(FilterEngine.evaluate(mockExchange, 'latency==99')).toBe(false);
        });

        it('handles quick hex search when only one side of exchange exists', () => {
            const txOnly = { id: 'tx-only', tx: { rawHex: 'AA BB' } } as unknown as Exchange;
            const rxOnly = { id: 'rx-only', rx: { rawHex: 'CC DD' } } as unknown as Exchange;

            expect(FilterEngine.evaluate(txOnly, 'AA')).toBe(true);
            expect(FilterEngine.evaluate(rxOnly, 'DD')).toBe(true);
        });

        it('uses latency fallback when latencyMs is undefined', () => {
            const noLatency = { id: 'nolat', tx: { rawHex: 'AA' } } as unknown as Exchange;
            expect(FilterEngine.evaluate(noLatency, 'latency == 0')).toBe(true);
        });

        it('returns false when profile parsing fails due insufficient bytes', () => {
            const shortExchange = { id: 'short', tx: { rawHex: 'AA' } } as unknown as Exchange;
            const wideProfile: FrameProfile = {
                id: 'wide',
                fields: [{ id: 'f1', name: 'CMD', order: 0, byteWidth: 2, endianness: 'big', type: 'fixed', typeConfig: { value: 0 } }],
            } as unknown as FrameProfile;
            expect(FilterEngine.evaluate(shortExchange, 'cmd == 1', wideProfile)).toBe(false);
        });

        it('does not treat zero-valued flags as truthy lookups', () => {
            const profileWithFlag: FrameProfile = {
                id: 'p3',
                fields: [
                    { id: 'f3', name: 'STATUS', order: 0, byteWidth: 1, type: 'flags', typeConfig: { bits: [{ index: 0, name: 'error', label: 'E' }] } }
                ]
            } as unknown as FrameProfile;
            const exchangeWithZeroFlag: Exchange = {
                tx: { rawHex: '00' }
            } as unknown as Exchange;
            expect(FilterEngine.evaluate(exchangeWithZeroFlag, 'error == 0', profileWithFlag)).toBe(false);
        });

        it('searches ASCII text content (quick text search)', () => {
            // "ALARM" in ASCII is 41 4C 41 52 4D
            const alarmExchange: Exchange = {
                id: 'ascii-test',
                rx: { rawHex: '41 4C 41 52 4D 3A 48 49 47 48' } // "ALARM:HIGH"
            } as unknown as Exchange;
            expect(FilterEngine.evaluate(alarmExchange, 'ALARM')).toBe(true);
            expect(FilterEngine.evaluate(alarmExchange, 'alarm')).toBe(true);
            expect(FilterEngine.evaluate(alarmExchange, 'HIGH')).toBe(true);
            expect(FilterEngine.evaluate(alarmExchange, 'STOP')).toBe(false);
        });

        it('searches hex and ASCII simultaneously (quick search)', () => {
            // "DATA" in ASCII is 44 41 54 41
            const dataExchange: Exchange = {
                id: 'dual-test',
                rx: { rawHex: '44 41 54 41 3A 42 50 4D' } // "DATA:BPM"
            } as unknown as Exchange;
            // hex search
            expect(FilterEngine.evaluate(dataExchange, '4441')).toBe(true);
            expect(FilterEngine.evaluate(dataExchange, '44 41')).toBe(true);
            // text search
            expect(FilterEngine.evaluate(dataExchange, 'DATA')).toBe(true);
            expect(FilterEngine.evaluate(dataExchange, 'BPM')).toBe(true);
            // neither
            expect(FilterEngine.evaluate(dataExchange, 'XXXX')).toBe(false);
        });

        it('text search is case-insensitive', () => {
            const ex: Exchange = {
                id: 'case-test',
                rx: { rawHex: '53 54 41 52 54' } // "START"
            } as unknown as Exchange;
            expect(FilterEngine.evaluate(ex, 'start')).toBe(true);
            expect(FilterEngine.evaluate(ex, 'START')).toBe(true);
            expect(FilterEngine.evaluate(ex, 'Start')).toBe(true);
        });
    });
});
