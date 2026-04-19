import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadProfiles, saveProfile, deleteProfile, getProfile } from '../storage';
import type { FrameProfile } from '../../types';

describe('storage.ts', () => {
    const mockProfile: FrameProfile = {
        id: 'test-id',
        name: 'Test Profile',
        description: 'Test Description',
        baudRate: 9600,
        dataBits: 8,
        parity: 'None',
        stopBits: 1,
        sendIntervalMs: 100,
        fields: [],
        framing: { mode: 'fixed' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    beforeEach(() => {
        // Mock localStorage
        const store: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => store[key] || null),
            setItem: vi.fn((key: string, value: string) => { store[key] = value }),
            clear: vi.fn(() => { for (const key in store) delete store[key] }),
            removeItem: vi.fn((key: string) => { delete store[key] })
        });

        localStorage.clear();
        vi.clearAllMocks();
    });

    it('loads initial profiles when storage is empty', () => {
        const profiles = loadProfiles();
        expect(profiles.length).toBeGreaterThan(0);
        expect(profiles[0].name).toBe('YS2000A Patient Monitor');
    });

    it('saves and retrieves a profile', () => {
        saveProfile(mockProfile);
        const saved = getProfile('test-id');
        expect(saved).not.toBeNull();
        expect(saved?.name).toBe('Test Profile');
    });

    it('updates an existing profile', () => {
        saveProfile(mockProfile);
        const updated = { ...mockProfile, name: 'Updated Name' };
        saveProfile(updated);
        const saved = getProfile('test-id');
        expect(saved?.name).toBe('Updated Name');
    });

    it('deletes a profile', () => {
        saveProfile(mockProfile);
        deleteProfile('test-id');
        const saved = getProfile('test-id');
        expect(saved).toBeNull();
    });

    it('handles corrupted JSON in storage gracefully', () => {
        localStorage.setItem('uart_profiles', 'corrupted { json');
        const profiles = loadProfiles();
        expect(profiles).toEqual([]);
    });
});
