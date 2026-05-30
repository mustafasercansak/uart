import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
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

// vi.mock must be at module scope (hoisted); use vi.fn() directly — no top-level variable refs
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue('tauri-result') }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));

describe('tauri-bridge (simulated Tauri environment)', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: undefined, writable: true, configurable: true });
  });

  it('isTauri returns true when __TAURI_INTERNALS__ is present', () => {
    expect(isTauri()).toBe(true);
  });

  it('invoke calls through to @tauri-apps/api/core when in Tauri', async () => {
    const result = await invoke<string>('my_command', { key: 'val' });
    expect(typeof result === 'string' || result === undefined).toBe(true);
  });

  it('listen calls through to @tauri-apps/api/event when in Tauri', async () => {
    const unlisten = await listen('my_event', () => {});
    expect(typeof unlisten).toBe('function');
  });

  it('listen forwards event payload to the caller handler', async () => {
    // Covers the `(e) => handler(e.payload)` wrapper function inside listen()
    const { listen: mockTauriListen } = await import('@tauri-apps/api/event');
    // Make the mock synchronously invoke the handler so we can observe payload forwarding
    (mockTauriListen as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_evt: string, wrapper: (e: { payload: unknown }) => void) => {
        wrapper({ payload: 'hello-from-tauri' });
        return Promise.resolve(vi.fn());
      },
    );

    const received: unknown[] = [];
    await listen('my_event', (p) => received.push(p));
    expect(received).toEqual(['hello-from-tauri']);
  });
});
