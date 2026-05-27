import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadProfiles, saveProfile, deleteProfile, getProfile,
  saveProfiles, initProfileStorage,
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
        await expect(importFromJson(file)).rejects.toThrow('File could not be read');

        readSpy.mockRestore();
    });

    it('handles invalid JSON in importFromJson', async () => {
        const file = new File(['invalid json'], 'test.json', { type: 'application/json' });
        await expect(importFromJson(file)).rejects.toThrow('Invalid JSON file');
    });

    describe('Migration & Normalization Edge Cases', () => {
        it('handles null/invalid profile in migrateProfile', () => {
            localStorage.setItem('uart_profiles', JSON.stringify([null, { name: 'Valid' }]));
            const profiles = loadProfiles();
            // Should filter out null and keep the valid one
            expect(profiles.length).toBe(1);
        });

        it('normalizeField: handles endianness little and alarmLow/alarmHigh', () => {
            const legacy = [{
                id: 'p1',
                fields: [
                    { id: 'hr', name: 'HR', byteWidth: 1, endianness: 'little', alarmLow: 50, alarmHigh: 100 }
                ]
            }];
            localStorage.setItem('uart_profiles', JSON.stringify(legacy));
            const profiles = loadProfiles();
            const field = profiles[0].fields[0];
            expect(field.endianness).toBe('little');
            expect(field.alarmLow).toBe(50);
            expect(field.alarmHigh).toBe(100);
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

// ── Tauri FS persistence (initProfileStorage + saveProfiles mirror) ───────────

const mockInvokeFs = vi.fn();
vi.mock('../../lib/tauri-bridge', () => ({
  isTauri: () => true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke: (cmd: string, args?: unknown) => (mockInvokeFs as any)(cmd, args),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe('Tauri FS profile persistence', () => {
  const mockProfile: FrameProfile = {
    id: 'tauri-test',
    name: 'Tauri Profile',
    description: '',
    baudRate: 115200,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 100,
    fields: [],
    framing: { mode: 'fixed' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      clear: vi.fn(() => { for (const key in store) delete store[key]; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
    });
    localStorage.clear();
    mockInvokeFs.mockReset();
  });

  it('initProfileStorage — first run: migrates localStorage data to Tauri FS', async () => {
    // Seed localStorage with a profile
    saveProfiles([mockProfile]);
    // Simulate Tauri FS returning null (no file yet)
    mockInvokeFs.mockImplementation((cmd: string) => {
      if (cmd === 'load_can_profiles') return Promise.resolve(null);
      if (cmd === 'save_can_profiles') return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected command: ${cmd}`));
    });

    await initProfileStorage();

    // Should have called save_can_profiles with the migrated data
    expect(mockInvokeFs).toHaveBeenCalledWith('save_can_profiles', expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ id: 'tauri-test' })]),
    }));
  });

  it('initProfileStorage — subsequent run: FS data overwrites localStorage cache', async () => {
    // localStorage has stale/different data
    saveProfiles([{ ...mockProfile, name: 'Stale Name' }]);

    const fsProfile = { ...mockProfile, name: 'FS Authoritative', schemaVersion: 2 };
    mockInvokeFs.mockImplementation((cmd: string) => {
      if (cmd === 'load_can_profiles') return Promise.resolve([fsProfile]);
      return Promise.reject(new Error(`unexpected: ${cmd}`));
    });

    await initProfileStorage();

    // localStorage cache should now reflect the FS version
    const profiles = loadProfiles();
    expect(profiles.find(p => p.id === 'tauri-test')?.name).toBe('FS Authoritative');
  });

  it('saveProfiles — mirrors to Tauri FS', () => {
    mockInvokeFs.mockResolvedValue(undefined);

    saveProfiles([mockProfile]);

    // The fire-and-forget call is async; verify it was scheduled
    // (mockInvokeFs will be called with save_can_profiles in the next microtask)
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(mockInvokeFs).toHaveBeenCalledWith('save_can_profiles', expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ id: 'tauri-test' })]),
        }));
        resolve();
      }, 20);
    });
  });

  it('initProfileStorage — gracefully handles FS load error (falls back to migration path)', async () => {
    saveProfiles([mockProfile]);
    mockInvokeFs
      .mockRejectedValueOnce(new Error('disk error'))  // load_can_profiles fails
      .mockResolvedValue(undefined);                    // save_can_profiles succeeds

    // Should not throw
    await expect(initProfileStorage()).resolves.toBeUndefined();
  });
});
