import { describe, it, expect } from 'vitest';
import { computeErrorStats } from '../ExportEngine';
import type { GeneratedFrame } from '../../types';

describe('ExportEngine', () => {
    describe('computeErrorStats', () => {
        it('calculates statistics for correctly for a set of frames', () => {
            const frames: GeneratedFrame[] = [
                { 
                    frameNumber: 1, timestampMs: 1000, rawBytes: [0, 0, 0], 
                    errors: [], fields: [] 
                } as any,
                { 
                    frameNumber: 2, timestampMs: 2000, rawBytes: [0, 0, 0, 0, 0], 
                    errors: ['CHECKSUM HATASI'], fields: [] 
                } as any,
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
                { errors: ['ERROR_A'], timestampMs: 0, rawBytes: [0] } as any,
                { errors: ['ERROR_A'], timestampMs: 10, rawBytes: [0] } as any,
                { errors: ['ERROR_B'], timestampMs: 20, rawBytes: [0] } as any,
            ];
            const stats = computeErrorStats(frames);
            expect(stats.errorTypeCounts['ERROR_A']).toBe(2);
            expect(stats.errorTypeCounts['ERROR_B']).toBe(1);
        });
    });
});
