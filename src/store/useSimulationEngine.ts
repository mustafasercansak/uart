import { useEffect, useRef } from 'react';
import type React from 'react';
import type { SimAction } from './simulationReducer';
import { listen, invoke } from '../lib/tauri-bridge';
import { useTranslation } from '../i18n/context';

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 1500;
const MAX_MSG_BUFFER = 2000;

/**
 * Runs SimulationEngine inside a Web Worker.
 * Auto-restarts the worker on crash (up to MAX_RESTARTS times).
 */
export function useSimulationEngine(
  dispatch: React.Dispatch<SimAction>,
  msgBufferRef: React.MutableRefObject<string[]>,
  stateRef: React.MutableRefObject<{ outputMode: string }>
) {
  const { t } = useTranslation();
  const workerRef = useRef<Worker | null>(null);
  const serialConnectedRef = useRef(false);
  const networkConnectedRef = useRef(false);
  const restartCountRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // ── Tauri hardware listeners (registered once, survive worker restarts) ──
    const unlisteners: Array<() => void> = [];

    const pushMsg = (entry: object) => {
      if (msgBufferRef.current.length >= MAX_MSG_BUFFER) {
        msgBufferRef.current.splice(0, MAX_MSG_BUFFER / 2);
      }
      msgBufferRef.current.push(JSON.stringify(entry));
    };

    listen('serial-data', (payload) => {
      const p = payload as { hex: string; bytes: number[] };
      pushMsg({ type: 'RAW_RX_DATA', hex: p.hex });
      workerRef.current?.postMessage({ type: 'INCOMING_DATA', bytes: p.bytes });
    }).then(u => unlisteners.push(u));

    listen('serial-status', (payload) => {
      const p = payload as { connected: boolean; error?: string };
      serialConnectedRef.current = p.connected;
      workerRef.current?.postMessage({ type: 'SET_SERIAL_CONNECTED', connected: p.connected });
      pushMsg({ type: 'SERIAL_STATUS', connected: p.connected, error: p.error });
    }).then(u => unlisteners.push(u));

    listen('tcp-data', (payload) => {
      const p = payload as { hex: string; bytes: number[] };
      pushMsg({ type: 'RAW_RX_DATA', hex: p.hex });
      workerRef.current?.postMessage({ type: 'INCOMING_DATA', bytes: p.bytes });
    }).then(u => unlisteners.push(u));

    listen('tcp-status', (payload) => {
      const p = payload as { connected: boolean; error?: string };
      networkConnectedRef.current = p.connected;
      workerRef.current?.postMessage({ type: 'SET_NETWORK_CONNECTED', connected: p.connected });
      pushMsg({ type: 'NETWORK_STATUS', connected: p.connected, error: p.error });
    }).then(u => unlisteners.push(u));

    listen('tcp-server-data', (payload) => {
      const p = payload as { hex: string; bytes: number[] };
      pushMsg({ type: 'RAW_RX_DATA', hex: p.hex });
      workerRef.current?.postMessage({ type: 'INCOMING_DATA', bytes: p.bytes });
    }).then(u => unlisteners.push(u));

    listen('tcp-server-status', (payload) => {
      const p = payload as { status: string; port?: number; client?: string; error?: string };
      const connected = p.status === 'connected' || p.status === 'listening';
      networkConnectedRef.current = connected;
      workerRef.current?.postMessage({ type: 'SET_NETWORK_CONNECTED', connected });
      
      const msgText = p.status === 'connected' ? t('tcpStatus.clientConnected', { client: p.client })
                    : p.status === 'listening' ? t('tcpStatus.serverListening', { port: p.port })
                    : t('tcpStatus.serverStopped');
                    
      pushMsg({ type: 'NETWORK_STATUS', connected, error: p.error, customMessage: msgText });
    }).then(u => unlisteners.push(u));

    // ── Worker factory (called on start + each restart) ─────────────────────
    const startWorker = () => {
      if (!isMountedRef.current) return;

      const worker = new Worker(
        new URL('../workers/simulation.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === '__WRITE_HARDWARE__') {
          if (serialConnectedRef.current) {
            invoke('write_serial', { bytes: msg.bytes }).catch(console.error);
          } else if (networkConnectedRef.current) {
            if (stateRef.current.outputMode === 'tcp-server') {
              invoke('write_tcp_server', { bytes: msg.bytes }).catch(console.error);
            } else {
              invoke('write_tcp', { bytes: msg.bytes }).catch(console.error);
            }
          }
          return;
        }

        if (msgBufferRef.current.length >= MAX_MSG_BUFFER) {
          msgBufferRef.current.splice(0, MAX_MSG_BUFFER / 2);
        }
        msgBufferRef.current.push(JSON.stringify(msg));
      };

      worker.onerror = (e) => {
        console.error('[Worker] error:', e.message);
        handleWorkerCrash(t('errors.engineError', { error: e.message }));
      };

      worker.onmessageerror = () => {
        handleWorkerCrash(t('errors.engineMessageError'));
      };
    };

    const handleWorkerCrash = (reason: string) => {
      if (!isMountedRef.current) return;

      workerRef.current?.terminate();
      workerRef.current = null;

      dispatch({
        type: 'ADD_LOG',
        entryType: 'error',
        text: `⚠ Simülasyon motoru durdu: ${reason}`,
      });

      if (restartCountRef.current >= MAX_RESTARTS) {
        dispatch({
          type: 'ADD_LOG',
          entryType: 'error',
          text: `Motor ${MAX_RESTARTS} kez yeniden başlatıldı ve tekrar çöktü. Lütfen sayfayı yenileyin.`,
        });
        return;
      }

      restartCountRef.current += 1;
      const attempt = restartCountRef.current;

      dispatch({
        type: 'ADD_LOG',
        entryType: 'info',
        text: `Motor yeniden başlatılıyor... (${attempt}/${MAX_RESTARTS})`,
      });

      setTimeout(() => {
        if (!isMountedRef.current) return;
        startWorker();
        dispatch({
          type: 'ADD_LOG',
          entryType: 'info',
          text: `Motor yeniden başlatıldı (${attempt}/${MAX_RESTARTS}).`,
        });
      }, RESTART_DELAY_MS);
    };

    // ── Initial start ────────────────────────────────────────────────────────
    startWorker();
    dispatch({ type: 'SET_BACKEND_CONNECTED', connected: true });
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: 'Simülasyon motoru hazır (Worker Thread)' });

    return () => {
      isMountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      unlisteners.forEach(u => u());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { workerRef };
}
