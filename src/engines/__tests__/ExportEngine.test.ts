import { describe, it, expect, vi } from 'vitest';
import { computeErrorStats, exportToCSV, exportToJSON, exportToPCAP } from '../ExportEngine';
import type { GeneratedFrame, FrameProfile } from '../../types';

describe('ExportEngine', () => {
    describe('computeErrorStats', () => {
        it('calculates statistics for correctly for a set of frames', () => {
            const frames: GeneratedFrame[] = [
                { 
                    frameNumber: 1, timestampMs: 1000, rawBytes: [0, 0, 0], 
                    errors: [], fields: [] 
                } as unknown as GeneratedFrame,
                { 
                    frameNumber: 2, timestampMs: 2000, rawBytes: [0, 0, 0, 0, 0], 
                    errors: ['CHECKSUM HATASI'], fields: [] 
                } as unknown as GeneratedFrame,
            ];

            const stats = computeErrorStats(frames);
            
            expect(stats.totalFrames).toBe(2);
            expect(stats.errorFrames).toBe(1);
            expect(stats.errorRate).toBe(0.5);
            expect(stats.avgFrameSize).toBe(4); // (3+5)/2
            expect(stats.minFrameSize).toBe(3);
            expect(stats.maxFrameSize).toBe(5);
            expect(stats.durationMs).toBe(1000);
            expect(stats.crcFailRate).toBe(1); // One error, which is checksum related
        });

        it('handles empty frame list without crashing', () => {
            const stats = computeErrorStats([]);
            expect(stats.totalFrames).toBe(0);
            expect(stats.errorFrames).toBe(0);
            expect(stats.timelineData).toEqual([]);
        });

        it('correctly counts different error types', () => {
             const frames: GeneratedFrame[] = [
                { errors: ['ERROR_A'], timestampMs: 0, rawBytes: [0] } as unknown as GeneratedFrame,
                { errors: ['ERROR_A'], timestampMs: 10, rawBytes: [0] } as unknown as GeneratedFrame,
                { errors: ['ERROR_B'], timestampMs: 20, rawBytes: [0] } as unknown as GeneratedFrame,
            ];
            const stats = computeErrorStats(frames);
            expect(stats.errorTypeCounts['ERROR_A']).toBe(2);
            expect(stats.errorTypeCounts['ERROR_B']).toBe(1);
        });
    });

    describe('Export Functions', () => {
        const mockFrames: GeneratedFrame[] = [
            { 
                frameNumber: 1, timestampMs: 1000, rawBytes: [0xAA, 0xBB], 
                rawHex: 'AA BB', errors: [], 
                fields: [{ name: 'VAL', decimal: 170, hex: 'AA' }] 
            } as unknown as GeneratedFrame
        ];
        const mockProfile = {
            fields: [{ name: 'VAL' }]
        } as unknown as FrameProfile;

        it('calls download logic in exportToCSV', () => {
            const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
            vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('div') as unknown as Node);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('div') as unknown as Node);
            
            const mockAnchor = document.createElement('a');
            mockAnchor.click = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);

            exportToCSV(mockFrames, mockProfile, 'test_export');

            expect(createObjectURLSpy).toHaveBeenCalled();
            expect(mockAnchor.click).toHaveBeenCalled();
            
            vi.restoreAllMocks();
        });

        it('calls download logic in exportToJSON', () => {
            const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
            const mockAnchor = document.createElement('a');
            mockAnchor.click = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor);

            exportToJSON(mockFrames, mockProfile, 'test_export');

            expect(createObjectURLSpy).toHaveBeenCalled();
            expect(mockAnchor.click).toHaveBeenCalled();
            
            vi.restoreAllMocks();
        });

        it('calls download logic in exportToPCAP', () => {
            const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
            const mockAnchor = document.createElement('a');
            mockAnchor.click = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor);
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor);

            exportToPCAP(mockFrames, 'test_export');

            expect(createObjectURLSpy).toHaveBeenCalled();
            expect(mockAnchor.click).toHaveBeenCalled();
            
            vi.restoreAllMocks();
        });

        it('handles CSV escaping and empty lists', () => {
             const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
             // Empty list short-circuit
             exportToCSV([], null);
             expect(createObjectURLSpy).not.toHaveBeenCalled();

             // CSV escaping triggers (commas, quotes, newlines)
             const frames: GeneratedFrame[] = [{
                 frameNumber: 1, timestampMs: 1000, 
                 rawBytes: [0], rawHex: '00', 
                 errors: ['Error, with comma', 'Error "with quotes"', 'Error\nwith newline'],
                 fields: [{ name: 'F', decimal: 0, hex: '00' }]
             } as unknown as GeneratedFrame];
             const profile = { fields: [{ name: 'F' }] } as unknown as FrameProfile;
             
             exportToCSV(frames, profile);
             expect(createObjectURLSpy).toHaveBeenCalled();
             vi.restoreAllMocks();
        });

        it('handles null profile in JSON export', () => {
            const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
            vi.spyOn(document, 'createElement').mockReturnValue(document.createElement('a'));
            exportToJSON(mockFrames, null);
            expect(createObjectURLSpy).toHaveBeenCalled();
            vi.restoreAllMocks();
        });

        it('covers computeErrorStats edge cases (duration=0)', () => {
            const frames = [{ timestampMs: 1000, rawBytes: [0], errors: [] }] as unknown as GeneratedFrame[];
            const stats = computeErrorStats(frames);
            expect(stats.durationMs).toBe(1); // Fallback to 1
            expect(stats.framesPerSecond).toBe(1000);
        });

        it('covers exportToPCAP with empty data handled', () => {
             const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
             exportToPCAP([]);
             expect(createObjectURLSpy).not.toHaveBeenCalled();
             vi.restoreAllMocks();
        });

        it('exportToCSV with non-empty frames and null profile uses empty fieldNames', () => {
            // Covers the `?? []` fallback at `profile?.fields.map(...) ?? []`
            const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
            vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
            const mockAnchor = document.createElement('a');
            mockAnchor.click = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('div') as unknown as Node);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('div') as unknown as Node);

            const frames: GeneratedFrame[] = [{
                frameNumber: 1, timestampMs: 1000, rawBytes: [0xAA], rawHex: 'AA', errors: [], fields: []
            } as unknown as GeneratedFrame];

            exportToCSV(frames, null); // null profile → fieldNames = []
            expect(createObjectURLSpy).toHaveBeenCalled();
            vi.restoreAllMocks();
        });

        it('exportToJSON with empty frames sets durationMs to 0', () => {
            // Covers the `: 0` branch of `frames.length > 0 ? ... : 0`
            const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
            const mockAnchor = document.createElement('a');
            mockAnchor.click = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('div') as unknown as Node);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('div') as unknown as Node);

            exportToJSON([], null); // empty frames → durationMs = 0
            expect(createObjectURLSpy).toHaveBeenCalled();
            vi.restoreAllMocks();
        });

        it('exportToCSV covers ?? "" fallback when frame is missing a profile field', () => {
            // Profile has field 'MISSING' but frame.fields has no entry for it
            // → fieldDecMap['MISSING'] = undefined → ?? '' branch covered
            const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
            vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
            const mockAnchor = document.createElement('a');
            mockAnchor.click = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('div') as unknown as Node);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('div') as unknown as Node);

            const frames: GeneratedFrame[] = [{
                frameNumber: 1, timestampMs: 1000, rawBytes: [0x00], rawHex: '00', errors: [], fields: []
            } as unknown as GeneratedFrame];
            const profile = { fields: [{ name: 'MISSING' }] } as unknown as FrameProfile;
            exportToCSV(frames, profile); // fieldDecMap['MISSING'] === undefined → ?? ''
            expect(createObjectURLSpy).toHaveBeenCalled();
            vi.restoreAllMocks();
        });

        it('exportToCSV covers quote-only escaping branch (no comma)', () => {
            const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
            vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
            const mockAnchor = document.createElement('a');
            mockAnchor.click = vi.fn();
            vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('div') as unknown as Node);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('div') as unknown as Node);

            // Error with " but no comma → c.includes(',')=false, c.includes('"')=true
            const frames: GeneratedFrame[] = [{
                frameNumber: 1, timestampMs: 1000, rawBytes: [0x00], rawHex: '00',
                errors: ['Error "with quotes" only'], fields: []
            } as unknown as GeneratedFrame];
            exportToCSV(frames, null);
            expect(createObjectURLSpy).toHaveBeenCalled();
            vi.restoreAllMocks();
        });

        it('computeErrorStats crcFailRate is 0 when no errorFrames', () => {
            // Covers the `: 0` branch of `errorFrames > 0 ? crcFails / errorFrames : 0`
            const frames: GeneratedFrame[] = [
                { timestampMs: 0, rawBytes: [0xAA], errors: [], fields: [] } as unknown as GeneratedFrame,
                { timestampMs: 100, rawBytes: [0xBB], errors: [], fields: [] } as unknown as GeneratedFrame,
            ];
            const stats = computeErrorStats(frames);
            expect(stats.errorFrames).toBe(0);
            expect(stats.crcFailRate).toBe(0);
        });
    });
});
