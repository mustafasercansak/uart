import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  loadProfiles, saveProfile, deleteProfile, getProfile, 
  saveScenario, getScenario, deleteScenario, 
  exportAsJson, importFromJson,
  saveSequence, loadSequences, deleteSequence
} from '../storage';
import type { FrameProfile, Scenario } from '../../types';
import type { AutomationSequence } from '../../types/automation';

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
        expect(profiles.length).toBeGreaterThan(0);
    });

    it('migrates legacy profiles that are missing framing and fields', () => {
        const legacy = [{
            id: 'legacy-1',
            name: 'Legacy Profile',
            baudRate: 9600,
            dataBits: 8,
            parity: 'None',
            stopBits: 1,
            sendIntervalMs: 50,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z'
        }];
        localStorage.setItem('uart_profiles', JSON.stringify(legacy));

        const profiles = loadProfiles();
        expect(profiles).toHaveLength(1);
        expect(profiles[0].id).toBe('legacy-1');
        expect(profiles[0].framing).toEqual({ mode: 'fixed', delimiter: undefined, header: undefined, footer: undefined });
        expect(Array.isArray(profiles[0].fields)).toBe(true);
    });

    it('saves, gets and deletes scenarios', () => {
        const mockScenario = { id: 's1', name: 'S1', steps: [] } as unknown as Scenario;
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
        const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });
        const clickSpy = vi.fn();

        // Mock document.createElement('a')
        const mockA = {
            setAttribute: vi.fn(),
            href: '',
            download: '',
            click: clickSpy
        } as unknown as HTMLAnchorElement;
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
        const readSpy = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
            if (this.onerror) {
                const event = new ProgressEvent('error');
                this.onerror.call(this, event as ProgressEvent<FileReader>);
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

    describe('Migration & Normalization Edge Cases', () => {
        it('handles null/invalid profile in migrateProfile', () => {
            localStorage.setItem('uart_profiles', JSON.stringify([null, { name: 'Valid' }]));
            const profiles = loadProfiles();
            // Should filter out null and keep the valid one
            expect(profiles.length).toBe(1);
        });

        it('normalizeField: handles invalid inputs and provides defaults', () => {
            const legacy = [{
                id: 'legacy-1',
                fields: [
                    { id: '', name: '', byteWidth: -5, order: NaN },
                    null,
                    { id: 'f2', type: 'range' }
                ]
            }];
            localStorage.setItem('uart_profiles', JSON.stringify(legacy));
            const profiles = loadProfiles();
            const fields = profiles[0].fields;
            expect(fields).toHaveLength(2);
            expect(fields[0].id).toBe('field-0');
            expect(fields[0].name).toBe('Field_1');
            expect(fields[0].byteWidth).toBe(1);
            expect(fields[0].order).toBe(0);
        });

        it('migrateProfile: handles diverse framing modes and optional fields', () => {
            const legacy = [{
                id: 'p1',
                framing: { mode: 'slip', delimiter: 0x0A, header: [0x55], footer: [0xAA] },
                parity: 'Even',
                stopBits: 2,
                sendIntervalMs: -10
            }];
            localStorage.setItem('uart_profiles', JSON.stringify(legacy));
            const profiles = loadProfiles();
            const p = profiles[0];
            expect(p.framing.mode).toBe('slip');
            expect(p.framing.delimiter).toBe(0x0A);
            expect(p.framing.header).toEqual([0x55]);
            expect(p.framing.footer).toEqual([0xAA]);
            expect(p.parity).toBe('Even');
            expect(p.stopBits).toBe(2);
            expect(p.sendIntervalMs).toBe(10); // Clamped to min 10
        });

        it('migrateProfile: handles invalid framing header/footer elements', () => {
            const legacy = [{
                id: 'p1',
                framing: { mode: 'fixed', header: [0x55, 'invalid', 0xAA], footer: [null, 0xBB] }
            }];
            localStorage.setItem('uart_profiles', JSON.stringify(legacy));
            const profiles = loadProfiles();
            expect(profiles[0].framing.header).toEqual([0x55, 0xAA]);
            expect(profiles[0].framing.footer).toEqual([0xBB]);
        });
    });

    describe('Sequence Actions', () => {
        it('saves, loads and deletes sequences', () => {
            const seq = { id: 'seq1', name: 'Seq 1', steps: [] } as unknown as AutomationSequence;
            saveSequence(seq);
            const loaded = loadSequences();
            expect(loaded).toContainEqual(seq);

            const updated = { ...seq, name: 'Updated' };
            saveSequence(updated);
            expect(loadSequences().find(s => s.id === 'seq1')?.name).toBe('Updated');

            deleteSequence('seq1');
            expect(loadSequences().find(s => s.id === 'seq1')).toBeUndefined();
        });
    });
});
