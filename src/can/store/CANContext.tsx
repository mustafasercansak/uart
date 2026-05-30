import { useTranslation } from '../../i18n/context';
import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { canReducer, INITIAL_CAN_STATE, type CANAction } from './canReducer';
import type { CANBusState, CANBaudRate } from '../types/CANBusState';
import type { CANNode, CANFaultType } from '../types/CANNode';
import type { CANFrame } from '../types/CANFrame';
import type { CANErrorInjectionConfig } from '../types/CANErrorInjection';
import type { UDSDiagnosticConfig } from '../types/UDS';
import { invoke, listen, isTauri } from '../../lib/tauri-bridge';
import { translateBackendError } from '../../utils/backendError';

// ── Web Serial API types ────────────────────────────────────────────────────
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
// ───────────────────────────────────────────────────────────────────────────

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
  connectNetwork: (interfaceName: string) => void;
  disconnectNetwork: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  clearRecording: () => void;
  sendFrame: (arbitrationId: number, data: number[]) => void;
  sendUDSRequest: (requestId: number, payload: number[]) => void;
  setUDSConfig: (config: UDSDiagnosticConfig) => void;
  setErrorInjectionConfig: (config: CANErrorInjectionConfig) => void;
  armErrorInjection: () => void;
}

interface SocketCANFramePayload {
  arbitrationId: number;
  idFormat: 'standard' | 'extended';
  isRTR: boolean;
  dlc: number;
  data: number[];
  sessionId?: number;
}

interface PendingSocketCANTx {
  arbitrationId: number;
  data: number[];
  dlc: number;
  idFormat: 'standard' | 'extended';
  createdAt: number;
}

interface SocketCANStatusPayload {
  connected?: boolean;
  interface?: string;
  error?: string;
  sessionId?: number;
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
const SOCKETCAN_TX_ECHO_WINDOW_MS = 2000;

export function CANProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(canReducer, INITIAL_CAN_STATE);
  const stateRef = useRef(state);
  useLayoutEffect(() => { stateRef.current = state; }, [state]);

  const workerRef = useRef<Worker | null>(null);
  const restartCountRef = useRef(0);
  const stabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while a connectNetwork() call is in-flight; cleared on the first connected:true
  // event or on disconnectNetwork(). Guards against stale connected:true events from a
  // prior session re-enabling the UI after the user has already disconnected.
  const expectingConnectionRef = useRef(false);
  const isMountedRef = useRef(true);

  // Tracks serial connection state synchronously (stateRef is only refreshed after render)
  const serialConnectedRef = useRef(false);

  // Buffer for high-frequency frame updates — drained by RAF loop
  const frameBatchRef = useRef<CANFrame[]>([]);
  const pendingSocketCANTxRef = useRef<PendingSocketCANTx[]>([]);
  const activeSocketCANSessionRef = useRef<number | null>(null);
  // True once the first socketcan-status:connected has been received.
  // Before the first connection there is no prior session to filter against,
  // so frames must be allowed through even while activeSocketCANSessionRef is null.
  const hasEverConnectedRef = useRef(false);

  const clearPendingSocketCANTx = useCallback(() => {
    if (pendingSocketCANTxRef.current.length > 0) {
      pendingSocketCANTxRef.current.splice(0, pendingSocketCANTxRef.current.length);
    }
  }, []);

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

      // Reset the crash counter after the worker has run stably for a full
      // restart-delay window. Resetting on the first message would let a worker
      // that crashes after every startup message bypass MAX_RESTARTS entirely.
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = setTimeout(() => {
        restartCountRef.current = 0;
        stabilityTimerRef.current = null;
      }, RESTART_DELAY_MS * MAX_RESTARTS);

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg?.type) return;

        switch (msg.type) {
          case 'CAN_FRAME': {
            const frame = msg.frame as CANFrame;
            const isSocketCAN = stateRef.current.outputMode === 'tcp' && stateRef.current.networkConnected;
            // In SocketCAN mode suppress all engine-internal frames (nodeId < 0):
            //   nodeId === -1: tester TX — covered by vcan echo via socketcan-frame
            //   nodeId === -2: ECU simulation — covered by real hardware response via socketcan-frame
            // Simulation node frames (nodeId >= 0) still appear since they have no real counterpart.
            if (!(isSocketCAN && frame.nodeId < 0)) {
              frameBatchRef.current.push(frame);
            }
            // Only forward tester-injected frames (nodeId === -1) to SLCAN hardware.
            // ECU simulation (nodeId === -2) and simulation nodes (nodeId >= 0) must
            // never reach live hardware — same restriction as the SocketCAN write below.
            if (stateRef.current.serialConnected && serialWriterRef.current && frame.nodeId === -1) {
              const isExt = frame.idFormat === 'extended';
              const prefix = isExt ? 'T' : 't';
              const idHex = frame.arbitrationId.toString(16).toUpperCase().padStart(isExt ? 8 : 3, '0');
              const dlc = frame.dlc.toString();
              const dataHex = frame.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
              const slcanPacket = `${prefix}${idHex}${dlc}${dataHex}\r`;
              serialWriterRef.current.write(slcanPacket).catch((e) => console.error('[SLCAN] write failed:', e));
            }
            // Only forward tester-injected frames (nodeId === -1) to the real bus.
            // ECU simulation frames (nodeId === -2) and node frames (nodeId >= 0)
            // must never reach live hardware.
            if (isSocketCAN && frame.nodeId === -1) {
              invoke('write_socketcan_frame', {
                arbitrationId: frame.arbitrationId,
                data: frame.data,
                isExtended: frame.idFormat === 'extended',
                isRtr: frame.isRTR,
              }).catch((e) => console.error('[SocketCAN] write failed:', e));
            }
            break;
          }

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

          case 'CAN_WORKER_ERROR':
            // Engine method threw — log it and trigger the crash-restart path.
            handleCrash(`Engine error (${msg.msgType}): ${msg.message}`);
            break;
        }
      };

      worker.onerror = (e) => handleCrash(`Worker error: ${e.message}`);
      worker.onmessageerror = () => handleCrash(t('can.workerMessageEr'));
    };

    const handleCrash = (reason: string) => {
      if (!isMountedRef.current) return;
      if (stabilityTimerRef.current) { clearTimeout(stabilityTimerRef.current); stabilityTimerRef.current = null; }
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
      if (stabilityTimerRef.current) { clearTimeout(stabilityTimerRef.current); stabilityTimerRef.current = null; }
      cancelAnimationFrame(rafId);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Worker command helpers ──────────────────────────────────────────────────
  const send = useCallback((msg: object) => workerRef.current?.postMessage(msg), []);

  useEffect(() => {
    let disposed = false;
    let unlistenFrame: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    listen('socketcan-frame', (payload) => {
      const socketPayload = payload as SocketCANFramePayload;
      // Drop frames from any session other than the active one.
      // On the very first connection hasEverConnectedRef is false, so active is null
      // but there is no prior session to filter — allow frames through.
      // On reconnects hasEverConnectedRef is true, so null active means "between sessions"
      // and all sessionId-tagged frames are correctly dropped until the new session is set.
      if (typeof socketPayload.sessionId === 'number' && hasEverConnectedRef.current) {
        const active = activeSocketCANSessionRef.current;
        if (active === null || socketPayload.sessionId !== active) return;
      }
      const isLocalEcho = consumePendingSocketCANTx(pendingSocketCANTxRef.current, socketPayload);
      const frame = socketCANPayloadToFrame(socketPayload, stateRef.current.busLoadPercent, isLocalEcho ? -1 : 0);
      dispatch({ type: 'CAN_ADD_FRAME', frame });
      dispatch({
        type: 'CAN_ADD_LOG',
        entry: {
          time: now(),
          text: `SocketCAN ${isLocalEcho ? 'TX' : 'RX'} 0x${frame.arbitrationId.toString(16).toUpperCase()}`,
          type: isLocalEcho ? 'tx' : 'rx',
        },
      });
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenFrame = unlisten;
    });

    listen('socketcan-status', (payload) => {
      const status = payload as SocketCANStatusPayload;
      const activeSessionId = activeSocketCANSessionRef.current;
      const payloadSessionId = typeof status.sessionId === 'number' ? status.sessionId : null;

      // Drop stale disconnect events from prior sessions.
      // activeSessionId === null means we are between sessions (connectNetwork just ran but the
      // new socketcan-status:connected hasn't arrived yet) — still drop any sessionId-tagged
      // disconnect event, since disconnectNetwork() already dispatched connected:false eagerly.
      if (
        payloadSessionId !== null &&
        (activeSessionId === null || payloadSessionId !== activeSessionId) &&
        !status.connected
      ) {
        return;
      }

      if (status.connected && payloadSessionId !== null) {
        // Drop a stale connected:true that arrives after the user already disconnected.
        if (!expectingConnectionRef.current && hasEverConnectedRef.current) return;
        expectingConnectionRef.current = false;
        activeSocketCANSessionRef.current = payloadSessionId;
        hasEverConnectedRef.current = true;
      }

      // Forward error to state so UI banners can display background disconnect errors.
      dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: Boolean(status.connected), error: status.error });
      if (status.error) {
        dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `SocketCAN error: ${status.error}`, type: 'error' } });
        // Background error disconnect — clean up write_fd since the read thread cannot.
        invoke('disconnect_socketcan').catch(() => {});
        clearPendingSocketCANTx();
        expectingConnectionRef.current = false;
        if (payloadSessionId !== null && activeSocketCANSessionRef.current === payloadSessionId) {
          activeSocketCANSessionRef.current = null;
        }
        return;
      }
      if (status.connected) {
        dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `SocketCAN connected: ${status.interface ?? 'can'}`, type: 'info' } });
      } else {
        clearPendingSocketCANTx();
        if (payloadSessionId === null || activeSocketCANSessionRef.current === payloadSessionId) {
          activeSocketCANSessionRef.current = null;
        }
        dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: t('can.disconnectedFromSock'), type: 'info' } });
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenStatus = unlisten;
    });

    return () => {
      disposed = true;
      unlistenFrame?.();
      unlistenStatus?.();
    };
  }, [clearPendingSocketCANTx, t]);

  // ── Public API ──────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    send({ type: 'CAN_START' });
    dispatch({ type: 'CAN_SET_STATUS', status: 'running' });
  }, [send]);

  const stop = useCallback(() => {
    send({ type: 'CAN_STOP' });
    clearPendingSocketCANTx();
    dispatch({ type: 'CAN_SET_STATUS', status: 'stopped' });
    dispatch({ type: 'CAN_CLEAR_FRAMES' });
  }, [clearPendingSocketCANTx, send]);

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
  const clearFrames  = useCallback(() => {
    send({ type: 'CAN_STOP' });
    send({ type: 'CAN_CLEAR_FRAMES' });
    clearPendingSocketCANTx();
    dispatch({ type: 'CAN_SET_STATUS', status: 'stopped' });
    dispatch({ type: 'CAN_CLEAR_FRAMES' });
  }, [clearPendingSocketCANTx, send]);
  const toggleArbitrationDisplay = useCallback(() => dispatch({ type: 'CAN_TOGGLE_ARBITRATION_DISPLAY' }), []);
  const toggleErrorDisplay       = useCallback(() => dispatch({ type: 'CAN_TOGGLE_ERROR_DISPLAY' }), []);
  const injectFault  = useCallback((nodeId: number, fault: CANFaultType) => send({ type: 'CAN_INJECT_FAULT', nodeId, fault }), [send]);
  const recoverNode  = useCallback((nodeId: number) => send({ type: 'CAN_RECOVER_NODE', nodeId }), [send]);

  const setOutputMode = useCallback((mode: CANBusState['outputMode']) => {
    dispatch({ type: 'CAN_SET_OUTPUT_MODE', mode });
    if (mode !== 'serial' && serialConnectedRef.current) {
      // Close the physical serial port so the OS handle is released
      serialReaderRef.current?.cancel().catch(() => {});
      serialReaderRef.current = null;
      serialWriterRef.current?.close().catch(() => {});
      // eslint-disable-next-line react-hooks/immutability
      serialWriterRef.current = null;
      serialPortRef.current?.close().catch(() => {});
      serialPortRef.current = null;
      serialConnectedRef.current = false;
      dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: false });
    }
    if (mode !== 'tcp' && mode !== 'tcp-server' && stateRef.current.networkConnected) {
      clearPendingSocketCANTx();
      activeSocketCANSessionRef.current = null;
      expectingConnectionRef.current = false;
      // Dispatch eagerly so the UI transitions to disconnected immediately;
      // a stale socketcan-status event arriving later is harmless (re-confirms false).
      dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: false });
      invoke('disconnect_socketcan').catch(() => {});
    }
  }, [clearPendingSocketCANTx]);

  const serialPortRef = useRef<SerialPortLike | null>(null);
  const serialReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const serialWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(null);

  const connectSerial = useCallback(async (portName: string) => {
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
        // eslint-disable-next-line react-hooks/immutability
        serialPortRef.current = port;
        serialConnectedRef.current = true;
        dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: true });

        const textEncoder = new TextEncoderStream();
        textEncoder.readable.pipeTo(port.writable);
        // eslint-disable-next-line react-hooks/immutability
        serialWriterRef.current = textEncoder.writable.getWriter();

        // TextDecoderStream.writable is typed as WritableStream<BufferSource> in DOM lib;
        // Uint8Array satisfies BufferSource at runtime, so we narrow the writable type here.
        type Uint8ArrayDecoder = Omit<TextDecoderStream, 'writable'> & { writable: WritableStream<Uint8Array> };
        const textDecoder = new TextDecoderStream() as unknown as Uint8ArrayDecoder;
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        // eslint-disable-next-line react-hooks/immutability
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
                    const maxBytes = Math.min(dlc, Math.floor(dataHex.length / 2));
                    for (let i = 0; i < maxBytes * 2; i += 2) {
                      const byte = parseInt(dataHex.substring(i, i + 2), 16);
                      dataBytes.push(isNaN(byte) ? 0 : byte);
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
        dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: false });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Failed to connect to Serial: ${msg}`, type: 'error' } });
      serialConnectedRef.current = false;
      dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: false });
    }
  }, [send, t]);

  const disconnectSerial = useCallback(async () => {
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel();
        // eslint-disable-next-line react-hooks/immutability
        serialReaderRef.current = null;
      }
      if (serialWriterRef.current) {
        await serialWriterRef.current.close();
        // eslint-disable-next-line react-hooks/immutability
        serialWriterRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        // eslint-disable-next-line react-hooks/immutability
        serialPortRef.current = null;
      }
    } catch (e) {
      // Port/writer may already be closed — log for debugging but don't surface to user
      console.warn('[SLCAN] disconnect error (non-critical):', e);
    }
    serialConnectedRef.current = false;
    dispatch({ type: 'CAN_SET_SERIAL_CONNECTED', connected: false });
    dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Disconnected from SLCAN`, type: 'info' } });
  }, []);

  const connectNetwork = useCallback(async (interfaceName: string) => {
    // Reject TCP addresses up-front — SocketCAN takes interface names like 'vcan0', 'can0'
    if (/^tcp(-server)?:\/\//i.test(interfaceName)) {
      dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `SocketCAN does not accept TCP URLs: ${interfaceName}`, type: 'error' } });
      return;
    }
    const normalizedInterface = interfaceName
      .replace(/^socketcan:\/\//, '')
      .trim() || 'vcan0';
    clearPendingSocketCANTx();
    activeSocketCANSessionRef.current = null;
    expectingConnectionRef.current = true;
    dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `Connecting to SocketCAN ${normalizedInterface}...`, type: 'info' } });
    try {
      await invoke('connect_socketcan', { interface: normalizedInterface });
      // In non-Tauri (browser/dev) mode invoke() is a silent no-op and the
      // socketcan-status Tauri event never fires — simulate the connected event
      // so the UI and session refs are set correctly for dev-mode testing.
      if (!isTauri()) {
        expectingConnectionRef.current = false;
        const devSessionId = 1;
        activeSocketCANSessionRef.current = devSessionId;
        hasEverConnectedRef.current = true;
        dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: true });
        dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `SocketCAN connected (dev): ${normalizedInterface}`, type: 'info' } });
      }
    } catch (err: unknown) {
      expectingConnectionRef.current = false;
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: false, error: msg });
      dispatch({ type: 'CAN_ADD_LOG', entry: { time: now(), text: `SocketCAN connect failed: ${translateBackendError(t, msg)}`, type: 'error' } });
    }
  }, [clearPendingSocketCANTx, t]);

  const disconnectNetwork = useCallback(() => {
    // Dispatch synchronously so the UI is never stuck as "connected" if the backend
    // crashes before it can emit the socketcan-status event.  A stale connected:false
    // Tauri event that arrives after a fast reconnect is harmless (it just re-confirms
    // the already-false state before the new connected:true arrives).
    clearPendingSocketCANTx();
    activeSocketCANSessionRef.current = null;
    expectingConnectionRef.current = false;
    dispatch({ type: 'CAN_SET_NETWORK_CONNECTED', connected: false });
    invoke('disconnect_socketcan').catch(console.error);
  }, [clearPendingSocketCANTx]);

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
    if (stateRef.current.outputMode === 'tcp' && stateRef.current.networkConnected) {
      const dlc = Math.min(data.length, 8);
      pendingSocketCANTxRef.current.push({
        arbitrationId,
        data: data.slice(0, dlc),
        dlc,
        idFormat: arbitrationId > 0x7ff ? 'extended' : 'standard',
        createdAt: Date.now(),
      });
    }
    send({ type: 'CAN_SEND_FRAME', arbitrationId, data });
  }, [send]);

  const sendUDSRequest = useCallback((requestId: number, payload: number[]) => {
    // Pre-register all ISO-TP tester frames as pending TX so vcan echoes are
    // matched by consumePendingSocketCANTx and shown as TX (not RX) in the monitor.
    if (stateRef.current.outputMode === 'tcp' && stateRef.current.networkConnected) {
      const norm = payload.map(b => b & 0xff);
      const stMinMs = Math.max(0, stateRef.current.udsConfig.stMinMs ?? 0);
      const entries = buildIsoTpTxEntries(requestId, norm, stMinMs, Date.now());
      pendingSocketCANTxRef.current.push(...entries);
    }
    send({ type: 'CAN_SEND_UDS_REQUEST', requestId, payload });
  }, [send]);

  const setUDSConfig = useCallback((config: UDSDiagnosticConfig) => {
    send({ type: 'CAN_SET_UDS_CONFIG', config });
    dispatch({ type: 'CAN_SET_UDS_CONFIG', config });
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
      sendUDSRequest, setUDSConfig,
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

function socketCANPayloadToFrame(payload: SocketCANFramePayload, busLoadPercent: number, nodeId = 0): CANFrame {
  const data = Array.isArray(payload.data) ? payload.data.slice(0, 8) : [];
  const dlc = Math.min(payload.dlc ?? data.length, 8);
  const idFormat = payload.idFormat === 'extended' ? 'extended' : 'standard';

  return {
    uid: makeSocketCANFrameUid(),
    arbitrationId: payload.arbitrationId,
    idFormat,
    frameType: payload.isRTR ? 'remote' : 'data',
    isRTR: Boolean(payload.isRTR),
    dlc,
    data: data.slice(0, dlc),
    crc: 0, // kernel already validated CRC; avoid redundant computation on every RX frame
    timestamp: Date.now(),
    nodeId,
    busLoadPercent,
    errors: [],
  };
}

function consumePendingSocketCANTx(pending: PendingSocketCANTx[], payload: SocketCANFramePayload): boolean {
  if (pending.length === 0) return false;
  const nowMs = Date.now();
  const payloadData = Array.isArray(payload.data) ? payload.data.slice(0, Math.min(payload.dlc ?? payload.data.length, 8)) : [];
  const payloadDlc = Math.min(payload.dlc ?? payloadData.length, 8);
  const payloadIdFormat = payload.idFormat === 'extended' ? 'extended' : 'standard';

  for (let index = pending.length - 1; index >= 0; index--) {
    if (nowMs - pending[index].createdAt > SOCKETCAN_TX_ECHO_WINDOW_MS) {
      pending.splice(index, 1);
    }
  }

  const matchIndex = pending.findIndex(item => {
    if (item.arbitrationId !== payload.arbitrationId) return false;
    if (item.dlc !== payloadDlc) return false;
    if (item.idFormat !== payloadIdFormat) return false;
    // Compare all payloadDlc bytes, zero-padding item.data when it is shorter than
    // payloadDlc (transmitDiagnosticFrame pads frames to DLC=8 on the wire).
    for (let i = 0; i < payloadDlc; i++) {
      const expected = i < item.data.length ? item.data[i] : 0;
      if (expected !== payloadData[i]) return false;
    }
    return true;
  });

  if (matchIndex === -1) return false;
  pending.splice(matchIndex, 1);
  return true;
}

/**
 * Pure helper that mirrors `CANSimulationEngine.transmitIsoTpPayload`.
 * Returns the list of frame data arrays (before zero-padding to DLC=8) that the
 * engine will emit, plus a cumulative `createdAt` offset in ms based on stMinMs.
 * Used by sendUDSRequest to pre-register expected vcan echoes.
 *
 * If this function drifts from the engine implementation, vcan echoes will show
 * as RX instead of TX. Keep in sync with transmitIsoTpPayload in CANSimulationEngine.ts.
 */
function buildIsoTpTxEntries(
  arbitrationId: number,
  payload: number[],
  stMinMs: number,
  baseCreatedAt: number
): PendingSocketCANTx[] {
  const idFormat: 'standard' | 'extended' = arbitrationId > 0x7ff ? 'extended' : 'standard';
  const entries: PendingSocketCANTx[] = [];

  if (payload.length <= 7) {
    entries.push({ arbitrationId, data: [payload.length, ...payload], dlc: 8, idFormat, createdAt: baseCreatedAt });
    return entries;
  }

  const length = Math.min(payload.length, 0xfff);
  entries.push({
    arbitrationId,
    data: [0x10 | ((length >> 8) & 0x0f), length & 0xff, ...payload.slice(0, 6)],
    dlc: 8, idFormat, createdAt: baseCreatedAt,
  });

  let offset = 6;
  let seq = 1;
  let createdAt = baseCreatedAt + stMinMs;
  while (offset < length) {
    const chunk = payload.slice(offset, offset + 7);
    entries.push({ arbitrationId, data: [0x20 | (seq & 0x0f), ...chunk], dlc: 8, idFormat, createdAt });
    offset += chunk.length;
    seq = (seq + 1) & 0x0f;
    createdAt += stMinMs;
  }
  return entries;
}

function makeSocketCANFrameUid(): string {
  const bytes = new Uint32Array(2);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Date.now() >>> 0;
    bytes[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `socketcan-${Date.now()}-${bytes[0].toString(16)}${bytes[1].toString(16)}`;
}
