import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAudioAlerts } from '../useAudioAlerts';

describe('useAudioAlerts hook', () => {
    let mockOscillator: any;
    let mockGain: any;
    let mockAudioContextInstance: any;
    let AudioContextSpy: any;

    beforeEach(() => {
        // Fresh mock objects for every test
        mockOscillator = {
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            type: 'sine',
            frequency: { setValueAtTime: vi.fn() }
        };

        mockGain = {
            connect: vi.fn(),
            gain: {
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn()
            }
        };

        mockAudioContextInstance = {
            state: 'running',
            currentTime: 0,
            destination: {},
            createOscillator: vi.fn().mockReturnValue(mockOscillator),
            createGain: vi.fn().mockReturnValue(mockGain),
            resume: vi.fn().mockResolvedValue(undefined),
        };

        // Stub the global constructor with a fresh spy that returns our controlled instance
        AudioContextSpy = vi.fn().mockImplementation(() => mockAudioContextInstance);
        vi.stubGlobal('AudioContext', AudioContextSpy);
        
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    it('lazily creates AudioContext on first alert', () => {
        const { result } = renderHook(() => useAudioAlerts());
        expect(AudioContextSpy).not.toHaveBeenCalled();
        
        result.current.alertTick();
        expect(AudioContextSpy).toHaveBeenCalled();
    });

    it('triggers beep with default parameters in alertTick', () => {
        const { result } = renderHook(() => useAudioAlerts());
        result.current.alertTick();

        expect(mockOscillator.start).toHaveBeenCalled();
        expect(mockOscillator.stop).toHaveBeenCalled();
        expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(1200, 0);
    });

    it('triggers alertWarning with expected frequency', () => {
        const { result } = renderHook(() => useAudioAlerts());
        result.current.alertWarning();

        expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(660, 0);
    });

    it('triggers dual-tone beep in alertError', () => {
        const { result } = renderHook(() => useAudioAlerts());
        result.current.alertError();

        // First beep (C6)
        expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(1046, 0);
        
        // Advance timers for second beep (G5)
        vi.advanceTimersByTime(100);
        expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(784, 0);
    });

    it('handles AudioContext suspension by calling resume', () => {
        // Set state before the hook creates/resumes context
        mockAudioContextInstance.state = 'suspended';

        const { result } = renderHook(() => useAudioAlerts());
        result.current.alertTick();

        expect(mockAudioContextInstance.resume).toHaveBeenCalled();
    });
});
