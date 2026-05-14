import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadLastSettings, saveLastSettings } from '../lastSettings';

const KEY = 'uart_last_settings';

describe('lastSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadLastSettings', () => {
    it('returns defaults when localStorage is empty', () => {
      const settings = loadLastSettings();
      expect(settings.selectedPort).toBe('');
      expect(settings.profileId).toBeNull();
      expect(settings.scenarioId).toBeNull();
      expect(settings.outputMode).toBe('log');
    });

    it('returns stored value merged with defaults', () => {
      localStorage.setItem(KEY, JSON.stringify({ selectedPort: '/dev/ttyUSB0', profileId: 'p1' }));
      const settings = loadLastSettings();
      expect(settings.selectedPort).toBe('/dev/ttyUSB0');
      expect(settings.profileId).toBe('p1');
      expect(settings.scenarioId).toBeNull();
      expect(settings.outputMode).toBe('log');
    });

    it('returns defaults when stored JSON is corrupted', () => {
      localStorage.setItem(KEY, 'NOT_VALID_JSON{{{');
      const settings = loadLastSettings();
      expect(settings.selectedPort).toBe('');
      expect(settings.profileId).toBeNull();
    });

    it('returns all stored fields correctly', () => {
      const stored = { selectedPort: 'COM3', profileId: 'abc', scenarioId: 'scn1', outputMode: 'serial' };
      localStorage.setItem(KEY, JSON.stringify(stored));
      const settings = loadLastSettings();
      expect(settings).toMatchObject(stored);
    });
  });

  describe('saveLastSettings', () => {
    it('writes patch to localStorage', () => {
      saveLastSettings({ selectedPort: 'COM5' });
      const raw = localStorage.getItem(KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.selectedPort).toBe('COM5');
    });

    it('merges patch with existing settings', () => {
      localStorage.setItem(KEY, JSON.stringify({ selectedPort: 'COM1', profileId: 'p1', scenarioId: null, outputMode: 'log' }));
      saveLastSettings({ profileId: 'p2' });
      const parsed = JSON.parse(localStorage.getItem(KEY)!);
      expect(parsed.selectedPort).toBe('COM1');
      expect(parsed.profileId).toBe('p2');
    });

    it('does not throw when localStorage throws (quota exceeded)', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(() => saveLastSettings({ selectedPort: 'X' })).not.toThrow();
      spy.mockRestore();
    });

    it('persists outputMode correctly', () => {
      saveLastSettings({ outputMode: 'serial' });
      expect(loadLastSettings().outputMode).toBe('serial');
    });
  });
});
