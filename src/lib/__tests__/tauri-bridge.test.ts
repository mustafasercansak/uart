import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri, listen } from '../tauri-bridge';

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

describe('tauri-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('detects browser mode and gracefully ignores invoke/listen outside Tauri', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(isTauri()).toBe(false);
    await expect(invoke('test-command', { id: 1 })).resolves.toBeUndefined();
    const unlisten = await listen('test-event', vi.fn());

    expect(warnSpy).toHaveBeenCalledWith("[Tauri] invoke('test-command') called outside Tauri — ignored");
    expect(unlisten()).toBeUndefined();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockListen).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('delegates invoke and listen to Tauri APIs when internals are present', async () => {
    const unlisten = vi.fn();
    const handler = vi.fn();
    mockInvoke.mockResolvedValue('ok');
    mockListen.mockResolvedValue(unlisten);
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    await expect(invoke('test-command', { id: 2 })).resolves.toBe('ok');
    const result = await listen('test-event', handler);

    expect(mockInvoke).toHaveBeenCalledWith('test-command', { id: 2 });
    expect(mockListen).toHaveBeenCalledWith('test-event', expect.any(Function));

    const wrappedHandler = mockListen.mock.calls[0][1] as (event: { payload: unknown }) => void;
    wrappedHandler({ payload: { ok: true } });
    expect(handler).toHaveBeenCalledWith({ ok: true });
    expect(result).toBe(unlisten);
  });
});
