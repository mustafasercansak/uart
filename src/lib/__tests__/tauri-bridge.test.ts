import { describe, it, expect } from 'vitest';
import { isTauri, invoke, listen } from '../tauri-bridge';

describe('tauri-bridge (non-Tauri environment)', () => {
  it('isTauri returns false in jsdom', () => {
    expect(isTauri()).toBe(false);
  });

  it('invoke returns undefined and does not throw outside Tauri', async () => {
    const result = await invoke<string>('some_command', { arg: 1 });
    expect(result).toBeUndefined();
  });

  it('listen returns a no-op unlisten function outside Tauri', async () => {
    const unlisten = await listen('some_event', () => {});
    expect(typeof unlisten).toBe('function');
    expect(() => unlisten()).not.toThrow();
  });
});
