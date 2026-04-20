import { describe, it, expect } from 'vitest';
import { reducer, INITIAL_STATE, SimAction } from '../simulationReducer';

describe('Simulation State Stress Testing', () => {
    it('handles 1000 consecutive ticks without state corruption', () => {
        let state = INITIAL_STATE;
        const startTime = Date.now();

        for (let i = 0; i < 1000; i++) {
            const action: SimAction = {
                type: 'MASTER_TICK',
                elapsedMs: i * 1, // 1ms intervals
                updates: { frameCount: i, lastFrame: { uId: `f-${i}`, frameNumber: i, timestampMs: i, rawHex: 'FF', rawBytes: [], fields: [], errors: [] } },
                points: [{ t: i, val: Math.random() }],
                logEntries: [{ time: '00:00', text: `Log ${i}`, type: 'tx' }]
            };
            state = reducer(state, action);
        }

        const duration = Date.now() - startTime;
        
        expect(state.frameCount).toBe(999);
        expect(state.elapsedMs).toBe(999);
        
        // Circular buffer checks
        // recentFrames is capped at 50 (MAX_RECENT_FRAMES)
        expect(state.recentFrames.length).toBe(50);
        expect(state.recentFrames[0].frameNumber).toBe(999);
        
        // waveformHistory is capped at 512 (MAX_WAVEFORM_POINTS)
        expect(state.waveformHistory.length).toBe(512);
        
        // logEntries is capped at 100 (MAX_LOG_ENTRIES)
        expect(state.logEntries.length).toBe(100);
        expect(state.logEntries[99].text).toBe('Log 999');

        console.log(`Stress Test: 1000 ticks processed in ${duration}ms`);
        // Performance expectation: 1000 ticks should be very fast (< 100ms)
        expect(duration).toBeLessThan(500); 
    });

    it('handles heavy BATCH_UPDATE volume', () => {
        let state = INITIAL_STATE;
        for (let i = 0; i < 500; i++) {
            state = reducer(state, { 
                type: 'BATCH_UPDATE', 
                updates: { errorCount: i, serialConnected: i % 2 === 0 } 
            });
        }
        expect(state.errorCount).toBe(499);
        expect(state.serialConnected).toBe(false);
    });
});
