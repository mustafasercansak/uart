/**
 * Tauri bridge — wraps invoke/listen with graceful fallback when not in Tauri.
 * Import this instead of @tauri-apps/api directly.
 *
 * Static imports are intentional: @tauri-apps/api/core and /event are already
 * pulled into the bundle by Tauri plugin packages, so dynamic imports would be
 * ineffective and only produce Vite warnings.
 */
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function invoke<T = void>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauri()) {
    console.warn(`[Tauri] invoke('${cmd}') called outside Tauri — ignored`);
    return undefined as T;
  }
  return tauriInvoke<T>(cmd, args);
}

type UnlistenFn = () => void;

export async function listen(
  event: string,
  handler: (payload: unknown) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }
  return tauriListen(event, (e) => handler(e.payload));
}
