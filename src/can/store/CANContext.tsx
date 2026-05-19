import { useTranslation } from '../../i18n/context';
import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { canReducer, INITIAL_CAN_STATE, type CANAction } from './canReducer';
import type { CANBusState, CANBaudRate } from '../types/CANBusState';
import type { CANNode, CANFaultType } from '../types/CANNode';
import type { CANFrame } from '../types/CANFrame';
import type { CANErrorInjectionConfig } from '../types/CANErrorInjection';

interface CANContextValue {
  state: CANBusState;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  addNode: (node: Parameters<import('../engines/CANSimulationEngine').CANSimulationEngine['addNode']>[0]) => void;
  removeNode: (nodeId: number) => void;
  updateNode: (nodeId: number, patch: Partial<CANNode>) => void;
  setBaudRate: (baudRate: CANBaudRate) => void;
  selectNode: (nodeId: number | null) => void;
  selectFrame: (uid: string | null) => void;
  setFilter: (filter: string) => void;
  clearFrames: () => void;
  toggleArbitrationDisplay: () => void;
  toggleErrorDisplay: () => void;
  injectFault: (nodeId: number, fault: CANFaultType) => void;
  recoverNode: (nodeId: number) => void;
  setOutputMode: (mode: CANBusState['outputMode']) => void;
  connectSerial: (portName: string) => void;
  disconnectSerial: () => void;
  connectNetwork: (url: string) => void;
  disconnectNetwork: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  clearRecording: () => void;
  sendFrame: (arbitrationId: number, data: number[]) => void;
  setErrorInjectionConfig: (config: CANErrorInjectionConfig) => void;
  armErrorInjection: () => void;
}

const CANContext = createContext<CANContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useCANContext(): CANContextValue {
  const { t } = useTranslation();
  const ctx = useContext(CANContext);
  if (!ctx) throw new Error(t('can.useCANContextMu'));
  return ctx;
}

const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 1500;

export function CANProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(canReducer, INITIAL_CAN_STATE);
  const stateRef = useRef(state);
  useLayoutEffect(() => { stateRef.current = state; }, [state]);

  const workerRef = useRef<Worker | null>(null);
  const restartCountRef = useRef(0);
  const isMountedRef = useRef(true);

  // Buffer for high-frequency frame updates — drained by RAF loop
  const frameBatchRef = useRef<CANFrame[]>([]);

  // ── Worker lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    const startWorker = () => {
      if (!isMountedRef.current) return;

      const worker = new Worker(
        new URL('../workers/can.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg?.type) return;

        switch (msg.type) {
      case 'CAN_FRAME':
            // Buffer frames; drain in RAF to avoid flooding React renders
            frameBatchRef.current.push(msg.frame as CANFrame);
            if (stateRef.current.serialConnected && serialWriterRef.current) {
              const frame = msg.frame as CANFrame;
              const isExt = frame.idFormat === 'extended';
              const prefix = isExt ? 'T' : 't';
              const idHex = frame.arbitrationId.toString(16).toUpperCase().padStart(isExt ? 8 : 3, '0');
              const dlc = frame.dlc.toString();
              const dataHex = frame.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
              const slcanPacket = `${prefix}${idHex}${dlc}${dataHex}\r`;
              serialWriterRef.current.write(slcanPacket).catch(() => {});
            }
            break;

          case 'CAN_ARBITRATION':
            dispatch({ type: 'CAN_ADD_ARBITRATION', event: msg.event });
            break;

          case 'CAN_LOG':
            dispatch({ type: 'CAN_ADD_LOG', entry: msg.entry });
            break;

          case 'CAN_STATE_UPDATE':
            dispatch({ type: 'CAN_PATCH_STATE', patch: msg.patch });
            break;

          case 'CAN_FULL_STATE':
            dispatch({ type: 'CAN_PATCH_STATE', patch: msg.state });
            break;

          case 'CAN_FAULT_EVENT':
            dispatch({ type: 'CAN_ADD_FAULT_EVENT', event: msg.event });
            break;
        }
      };

      worker.onerror = (e) => handleCrash(`Worker error: ${e.message}`);
      worker.onmessageerror = () => handleCrash(t('can.workerMessageEr'));
    };

    const handleCrash = (reason: string) => {
      if (!isMountedRef.current) return;
      workerRef.current?.terminate();
      workerRef.current = null;
      dispatch({ type: 'CAN_SET_STATUS', status: 'stopped' });
      dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `CAN engine crashed: ${reason}`, type: 'error' } });

      if (restartCountRef.current >= MAX_RESTARTS) return;
      restartCountRef.current++;
      setTimeout(() => { if (isMountedRef.current) startWorker(); }, RESTART_DELAY_MS);
    };

    startWorker();

    // RAF loop — drain frame buffer once per animation frame
    let rafId: number;
    const drainFrames = () => {
      if (frameBatchRef.current.length > 0) {
        const batch = frameBatchRef.current.splice(0);
        // Dispatch the latest frame only; reducer accumulates count
        for (const frame of batch) {
          dispatch({ type: 'CAN_ADD_FRAME', frame });
        }
      }
      rafId = requestAnimationFrame(drainFrames);
    };
    rafId = requestAnimationFrame(drainFrames);

    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(rafId);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Worker command helpers ──────────────────────────────────────────────────
  const send = useCallback((msg: object) => workerRef.current?.postMessage(msg), []);

  // ── Public API ──────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    send({ type: 'CAN_START' });
    dispatch({ type: 'CAN_SET_STATUS', status: 'running' });
  }, [send]);

  const stop = useCallback(() => {
    send({ type: 'CAN_STOP' });
    dispatch({ type: 'CAN_SET_STATUS', status: 'stopped' });
    dispatch({ type: 'CAN_CLEAR_FRAMES' });
  }, [send]);

  const pause = useCallback(() => {
    send({ type: 'CAN_PAUSE' });
    dispatch({ type: 'CAN_SET_STATUS', status: 'paused' });
  }, [send]);

  const resume = useCallback(() => {
    send({ type: 'CAN_RESUME' });
    dispatch({ type: 'CAN_SET_STATUS', status: 'running' });
  }, [send]);

  const addNode = useCallback((node: Parameters<CANContextValue['addNode']>[0]) => {
    send({ type: 'CAN_ADD_NODE', node });
  }, [send]);

  const removeNode = useCallback((nodeId: number) => {
    send({ type: 'CAN_REMOVE_NODE', nodeId });
    dispatch({ type: 'CAN_SET_NODES', nodes: stateRef.current.nodes.filter(n => n.id !== nodeId) });
  }, [send]);

  const updateNode = useCallback((nodeId: number, patch: Partial<CANNode>) => {
    send({ type: 'CAN_UPDATE_NODE', nodeId, patch });
  }, [send]);

  const setBaudRate = useCallback((baudRate: CANBaudRate) => {
    send({ type: 'CAN_SET_BAUD_RATE', baudRate });
    dispatch({ type: 'CAN_SET_BAUD_RATE', baudRate });
  }, [send]);

  const selectNode   = useCallback((nodeId: number | null) => dispatch({ type: 'CAN_SELECT_NODE', nodeId }), []);
  const selectFrame  = useCallback((uid: string | null)    => dispatch({ type: 'CAN_SELECT_FRAME', uid }), []);
  const setFilter    = useCallback((filter: string)         => dispatch({ type: 'CAN_SET_FILTER', filter }), []);
  const clearFrames  = useCallback(() => { send({ type: 'CAN_STOP' }); dispatch({ type: 'CAN_CLEAR_FRAMES' }); }, [send]);
  const toggleArbitrationDisplay = useCallback(() => dispatch({ type: 'CAN_TOGGLE_ARBITRATION_DISPLAY' }), []);
  const toggleErrorDisplay       = useCallback(() => dispatch({ type: 'CAN_TOGGLE_ERROR_DISPLAY' }), []);
  const injectFault  = useCallback((nodeId: number, fault: CANFaultType) => send({ type: 'CAN_INJECT_FAULT', nodeId, fault }), [send]);
  const recoverNode  = useCallback((nodeId: number) => send({ type: 'CAN_RECOVER_NODE', nodeId }), [send]);

  const setOutputMode = useCallback((mode: CANBusState['outputMode']) => {
    dispatch({ type: 'CAN_SET_OUTPUT_MODE', mode });
    // If switching away from serial/network, disconnect them
    if (mode !== 'serial') dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: false });
    if (mode !== 'tcp' && mode !== 'tcp-server') dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: false });
  }, []);

  interface SerialPortLike {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    getInfo(): { usbProductId?: number };
  }
  interface SerialInterface {
    getPorts(): Promise<SerialPortLike[]>;
    requestPort(): Promise<SerialPortLike>;
  }

  const serialPortRef = useRef<SerialPortLike | null>(null);
  const serialReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const serialWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(null);

  const connectSerial = useCallback(async (portName: string) => {
    dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: true });
    dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Connecting to SLCAN on ${portName}...`, type: 'info' } });

    try {
      if ('serial' in navigator) {
        const serial = (navigator as Navigator & { serial: SerialInterface }).serial;
        const ports = await serial.getPorts();
        let port = ports.find((p) => {
          const info = p.getInfo();
          return info.usbProductId !== undefined;
        }) ?? ports[0];

        if (!port) {
          port = await serial.requestPort();
        }

        await port.open({ baudRate: 115200 });
        serialPortRef.current = port;

        const textEncoder = new TextEncoderStream();
        textEncoder.readable.pipeTo(port.writable as unknown as WritableStream<Uint8Array>);
        // eslint-disable-next-line react-hooks/immutability
        serialWriterRef.current = textEncoder.writable.getWriter();

        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable as unknown as WritableStream<Uint8Array>);
        const reader = textDecoder.readable.getReader();
        serialReaderRef.current = reader;

        dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: t('can.successfullyConne'), type: 'info' } });

        (async () => {
          try {
            let buffer = '';
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                buffer += value;
                const lines = buffer.split('\r');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith('t') || line.startsWith('T')) {
                    const isExtended = line.startsWith('T');
                    const idLength = isExtended ? 8 : 3;
                    const idHex = line.substring(1, 1 + idLength);
                    const dlc = parseInt(line.substring(1 + idLength, 2 + idLength), 10);
                    const dataHex = line.substring(2 + idLength);

                    const dataBytes: number[] = [];
                    for (let i = 0; i < dlc * 2; i += 2) {
                      dataBytes.push(parseInt(dataHex.substring(i, i + 2), 16));
                    }
                    const arbId = parseInt(idHex, 16);

                    send({ type: 'CAN_SEND_FRAME', arbitrationId: arbId, data: dataBytes });
                  }
                }
              }
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Serial read error: ${msg}`, type: 'error' } });
          }
        })();
      } else {
        dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: t('can.webSerialNotSupported'), type: 'info' } });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Failed to connect to Serial: ${msg}`, type: 'error' } });
      dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: false });
    }
  }, [send, t]);

  const disconnectSerial = useCallback(async () => {
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel();
        serialReaderRef.current = null;
      }
      if (serialWriterRef.current) {
        await serialWriterRef.current.close();
        // eslint-disable-next-line react-hooks/immutability
        serialWriterRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
    } catch {
      // ignore disconnect errors
    }
    dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: false });
    dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Disconnected from SLCAN`, type: 'info' } });
  }, []);

  const connectNetwork = useCallback((url: string) => {
    dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: true });
    dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Mock connected to SocketCAN at ${url}`, type: 'info' } });
  }, []);

  const disconnectNetwork = useCallback(() => {
    dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: false });
    dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Disconnected from SocketCAN`, type: 'info' } });
  }, []);

  const startRecording = useCallback(() => {
    dispatch({ type: 'CAN_CLEAR_RECORDING' });
    dispatch({ type: 'CAN_SET_RECORDING', isRecording: true });
    dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: t('can.startedRecordin'), type: 'info' } });
  }, [t]);

  const stopRecording = useCallback(() => {
    dispatch({ type: 'CAN_SET_RECORDING', isRecording: false });
    dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Stopped recording (${stateRef.current.recordedFrames.length} frames)`, type: 'info' } });
  }, []);

  const clearRecording = useCallback(() => {
    dispatch({ type: 'CAN_CLEAR_RECORDING' });
  }, []);

  const sendFrame = useCallback((arbitrationId: number, data: number[]) => {
    send({ type: 'CAN_SEND_FRAME', arbitrationId, data });
  }, [send]);

  const setErrorInjectionConfig = useCallback((config: CANErrorInjectionConfig) => {
    send({ type: 'CAN_SET_ERROR_INJECTION_CONFIG', config });
  }, [send]);

  const armErrorInjection = useCallback(() => {
    send({ type: 'CAN_ARM_ERROR_INJECTION' });
  }, [send]);

  return (
    <CANContext.Provider value={{
      state, start, stop, pause, resume,
      addNode, removeNode, updateNode, setBaudRate,
      selectNode, selectFrame, setFilter, clearFrames,
      toggleArbitrationDisplay, toggleErrorDisplay,
      injectFault, recoverNode, setOutputMode,
      connectSerial, disconnectSerial, connectNetwork, disconnectNetwork,
      startRecording, stopRecording, clearRecording, sendFrame,
      setErrorInjectionConfig, armErrorInjection
    }}>
      {children}
    </CANContext.Provider>
  );
}

function now(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}
