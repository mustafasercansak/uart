/**
 * Tauri bridge — wraps invoke/listen with graceful fallback when not in Tauri.
 * Import this instead of @tauri-apps/api directly.
 */

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
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
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
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  return tauriListen(event, (e) => handler(e.payload));
}
