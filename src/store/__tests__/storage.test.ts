import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadProfiles, saveProfile, deleteProfile, getProfile, saveScenario, getScenario, deleteScenario, exportAsJson, importFromJson } from '../storage';
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

    it('saves, gets and deletes scenarios', () => {
        const mockScenario = { id: 's1', name: 'S1', steps: [] } as any;
        saveScenario(mockScenario);
        expect(getScenario('s1')).toEqual(mockScenario);
        
        // Test update
        const updated = { ...mockScenario, name: 'S1 Updated' };
        saveScenario(updated);
        expect(getScenario('s1')?.name).toBe('S1 Updated');
        
        deleteScenario('s1');
        expect(getScenario('s1')).toBeNull();
    });

    it('exports data as JSON', () => {
        const mockObjectURL = 'blob:test';
        const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockObjectURL);
        const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const clickSpy = vi.fn();
        
        // Mock document.createElement('a')
        const mockA = {
            setAttribute: vi.fn(),
            href: '',
            download: '',
            click: clickSpy
        } as any;
        vi.spyOn(document, 'createElement').mockReturnValue(mockA);

        exportAsJson({ test: 1 }, 'test.json');

        expect(createSpy).toHaveBeenCalled();
        expect(mockA.href).toBe(mockObjectURL);
        expect(mockA.download).toBe('test.json');
        expect(clickSpy).toHaveBeenCalled();
        expect(revokeSpy).toHaveBeenCalled();

        createSpy.mockRestore();
        revokeSpy.mockRestore();
    });

    it('imports data from JSON file', async () => {
        const mockData = { hello: 'world' };
        const blob = new Blob([JSON.stringify(mockData)], { type: 'application/json' });
        const file = new File([blob], 'test.json', { type: 'application/json' });

        const result = await importFromJson(file);
        expect(result).toEqual(mockData);
    });

    it('handles file read errors in importFromJson', async () => {
        // Mock FileReader error using prototype spy for reliability
        const readSpy = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function(this: FileReader) {
            if (this.onerror) {
                const event = new ProgressEvent('error');
                this.onerror.call(this, event as any);
            }
        });

        const file = new File([''], 'test.json');
        await expect(importFromJson(file)).rejects.toThrow('Dosya okunamadı');
        
        readSpy.mockRestore();
    });

    it('handles invalid JSON in importFromJson', async () => {
        const file = new File(['invalid json'], 'test.json', { type: 'application/json' });
        await expect(importFromJson(file)).rejects.toThrow('Geçersiz JSON dosyası');
    });
});
