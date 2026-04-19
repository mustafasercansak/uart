import { useEffect, useRef } from 'react';
import type React from 'react';
import type { SimAction } from './simulationReducer';

const BACKEND_URL = 'ws://127.0.0.1:8080';

export function useBackendConnection(
  dispatch: React.Dispatch<SimAction>,
  msgBufferRef: React.MutableRefObject<string[]>
) {
  const backendWsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    let currentSocket: WebSocket | null = null;

    const connect = () => {
      if (!isMountedRef.current) return;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const socket = new WebSocket(BACKEND_URL);
      currentSocket = socket;

      socket.onopen = () => {
        if (!isMountedRef.current) { socket.close(); return; }
        console.log('[CLIENT] Sunucuya bağlandı');
        backendWsRef.current = socket;
        dispatch({ type: 'SET_BACKEND_CONNECTED', connected: true });
        dispatch({ type: 'ADD_LOG', entryType: 'info', text: 'Simülasyon motoru bağlandı (Backend)' });
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) return;
        msgBufferRef.current.push(event.data);
      };

      socket.onclose = () => {
        if (backendWsRef.current === socket) backendWsRef.current = null;
        if (isMountedRef.current) {
          console.warn('[CLIENT] Sunucu bağlantısı koptu, yeniden deneniyor...');
          dispatch({ type: 'SET_BACKEND_CONNECTED', connected: false });
          reconnectTimerRef.current = setTimeout(connect, 2000);
        }
      };

      socket.onerror = () => { socket.close(); };
    };

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (currentSocket) {
        currentSocket.onclose = null;
        if (currentSocket.readyState === WebSocket.OPEN) currentSocket.close();
      }
    };
  }, []);

  return { backendWsRef };
}
