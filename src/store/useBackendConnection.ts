import { useEffect, useRef } from 'react';
import type React from 'react';
import type { SimAction } from './simulationReducer';
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export function useBackendConnection(
  dispatch: React.Dispatch<SimAction>,
  msgBufferRef: React.MutableRefObject<string[]>
) {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let unlistenTick: UnlistenFn | null = null;
    let unlistenData: UnlistenFn | null = null;
    let unlistenDisconnect: UnlistenFn | null = null;
    let unlistenRxData: UnlistenFn | null = null;
    let unlistenConversation: UnlistenFn | null = null;

    const setupListeners = async () => {
      // 1. Listen for Simulation Ticks (Always needed)
      unlistenTick = await listen("TICK", (event) => {
        if (!isMountedRef.current) return;
        msgBufferRef.current.push(event.payload as string);
      });

      // 2. Listen for Raw TCP Data (legacy)
      unlistenData = await listen<number[]>("tcp-data", (event) => {
        if (!isMountedRef.current) return;
        const decoder = new TextDecoder();
        const message = decoder.decode(new Uint8Array(event.payload));
        msgBufferRef.current.push(message);
      });

      // 3. Listen for Disconnects
      unlistenDisconnect = await listen("tcp-disconnected", () => {
        if (!isMountedRef.current) return;
        console.warn('[TAURI] TCP bağlantısı koptu');
        dispatch({ type: 'SET_BACKEND_CONNECTED', connected: false });
      });

      // 4. Listen for Raw Serial RX Data
      unlistenRxData = await listen("RAW_RX_DATA", (event) => {
        if (!isMountedRef.current) return;
        const payload = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
        msgBufferRef.current.push(JSON.stringify({ type: 'RAW_RX_DATA', hex: (event.payload as any).hex }));
      });

      // 5. Listen for TX/RX Conversation entries
      unlistenConversation = await listen("CONVERSATION", (event) => {
        if (!isMountedRef.current) return;
        const payload = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
        msgBufferRef.current.push(payload);
      });
    };

    const connect = async () => {
      try {
        // Try connecting to backend bridge
        await invoke("connect_tcp", { host: "localhost", port: 5000 });
        console.log('[TAURI] Rust TCP katmanına bağlandı');
        dispatch({ type: 'SET_BACKEND_CONNECTED', connected: true });
        dispatch({ type: 'ADD_LOG', entryType: 'info', text: 'Simülasyon motoru bağlandı (Rust Backend)' });
      } catch (err) {
        // We don't throw here so simulation still works without a bridge
        console.warn('[TAURI] TCP Köprüsü bulunamadı, sadece simülasyon modu aktif.');
      }
    };

    setupListeners().then(() => {
        connect();
    });

    return () => {
      isMountedRef.current = false;
      if (unlistenTick) unlistenTick();
      if (unlistenData) unlistenData();
      if (unlistenDisconnect) unlistenDisconnect();
      if (unlistenRxData) unlistenRxData();
      if (unlistenConversation) unlistenConversation();
      invoke("disconnect_tcp").catch(() => {});
    };
  }, [dispatch, msgBufferRef]);

  return { backendWsRef: { current: null } };
}
