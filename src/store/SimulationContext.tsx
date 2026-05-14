import React, { useRef, useCallback, useReducer, useLayoutEffect } from 'react';
import { SimulationContext } from './context';
import { useTranslation } from '../i18n/context';
import type {
  FrameProfile,
  Scenario,
  OutputMode,
  ErrorType,
  GeneratedFrame,
  ResponderRule,
  Trigger,
  SignalIntegrity,
  DashboardWidget,
  WidgetType,
  ConversationEntry,
  Exchange,
  ValidationSession,
  AutomationSequence,
  Field,
  ValidationTarget,
  ScriptablePeripheral
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { parseFrame } from '../engines/FrameParser';
import { reducer, INITIAL_STATE, validateAndMigrateState } from './simulationReducer';
import { useSimulationEngine } from './useSimulationEngine';
import { useUIUpdateLoop } from './useUIUpdateLoop';
import { invoke } from '../lib/tauri-bridge';
import { loadLastSettings, saveLastSettings } from '../lib/lastSettings';
// SimulationEngine is now in a Web Worker — commands go via workerRef.postMessage()
import type { SimulationState } from '../types';
import {
  loadSequences,
  saveSequence,
  deleteSequence
} from './storage';
import { usePeripheralStore } from './usePeripheralStore';
import type { PeripheralState } from './usePeripheralStore';

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const msgBufferRef = useRef<string[]>([]);
  const profilesRef = useRef<FrameProfile[]>([]);
  const uiVisibleRef = useRef(false);
  const conversationBufferRef = useRef<ConversationEntry[]>([]);
  const exchangeBufferRef = useRef<Exchange[]>([]);
  const pendingUiUpdateRef = useRef<Partial<SimulationState> | null>(null);
  const rxBufferRef = useRef<number[]>([]);
  const fullLogRef = useRef<Array<{ time: string; text: string; type: string }>>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const isInitializedRef = useRef(false);

  /** Waveform samples stored outside React state — charts read this via RAF, not renders */
  const waveformHistoryRef = useRef<Array<Record<string, number>>>([]);

  // ── ENGINE (Web Worker) ──────────────────────────────────────────────────────
  const { workerRef } = useSimulationEngine(dispatch, msgBufferRef, stateRef);
  const send = (msg: unknown) => workerRef.current?.postMessage(msg);

  // ── UI UPDATE LOOP (unchanged) ───────────────────────────────────────────────
  useUIUpdateLoop({
    stateRef,
    msgBufferRef,
    profilesRef,
    uiVisibleRef,
    conversationBufferRef,
    exchangeBufferRef,
    waveformHistoryRef,
    dispatch,
  });

  // ── PERSISTENCE ──────────────────────────────────────────────────────────────
  React.useEffect(() => {
    try {
      const persisted = localStorage.getItem('uart_pro_state');
      const legacyLayouts = localStorage.getItem('uart_telemetry_layouts');
      const raw = persisted ? JSON.parse(persisted) : {};
      // Schema guard — only accept plain objects, reject corrupted blobs
      const parsed: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const layouts = (() => {
        try { return legacyLayouts ? JSON.parse(legacyLayouts) : (parsed.telemetryLayouts ?? {}); }
        catch { return {}; }
      })();
      const last = loadLastSettings();
      const migrated = validateAndMigrateState({ ...parsed, telemetryLayouts: layouts });
      dispatch({
        type: 'INIT_STATE', newState: {
          ...migrated,
          sequences: loadSequences(),
          profileId: last.profileId,
          scenarioId: last.scenarioId,
          outputMode: (last.outputMode as SimulationState['outputMode']) || migrated.outputMode || 'log',
        }
      });
      isInitializedRef.current = true;
    } catch (error) {
      console.error('Failed to load persisted state, using defaults', error);
      isInitializedRef.current = true;
    }
  }, []);

  React.useEffect(() => {
    if (!isInitializedRef.current) return;
    const toPersist = {
      watchlist: state.watchlist,
      snapshots: state.snapshots,
      analyzerMode: state.analyzerMode,
      dashboardLayout: state.dashboardLayout,
      signalIntegrity: state.signalIntegrity,
    };
    localStorage.setItem('uart_pro_state', JSON.stringify(toPersist));
  }, [state.watchlist, state.snapshots, state.analyzerMode, state.dashboardLayout, state.signalIntegrity]);

  // ── MEDICAL VALIDATION MONITORING ────────────────────────────────────────────
  React.useEffect(() => {
    if (!state.validationSession || state.validationSession.status !== 'running' || !state.lastRxFrame) return;

    const frame = state.lastRxFrame;
    const session = state.validationSession;
    const timestamp = Date.now();

    const currentFields: Record<string, number> = {};
    frame.fields.forEach(f => currentFields[f.name] = f.decimal);
    dispatch({ type: 'UPDATE_VALIDATION_HISTORY', entry: { timestamp, fields: currentFields } });

    session.targets.forEach(target => {
      const field = frame.fields.find(f =>
        f.name.toLowerCase().replace(/[^a-z0-9]/g, '') === target.fieldName.toLowerCase().replace(/[^a-z0-9]/g, '')
      );
      if (!field) return;

      const value = field.decimal;
      const isSuccess = value >= target.expectedMin && value <= target.expectedMax;
      const lastEvent = session.events.filter(e => e.fieldName === target.fieldName).slice(-1)[0];
      const wasSuccess = lastEvent ? lastEvent.type === 'compliance_success' : true;

      if (isSuccess !== wasSuccess) {
        dispatch({
          type: 'ADD_VALIDATION_EVENT',
          event: {
            id: uuidv4(),
            timestamp,
            type: isSuccess ? 'compliance_success' : 'compliance_failure',
            message: isSuccess
              ? t('simulation.validation.returnedToNormal', { field: target.fieldName, value, unit: target.unit })
              : t('simulation.validation.outOfLimits', { field: target.fieldName, value, unit: target.unit, min: target.expectedMin, max: target.expectedMax }),
            fieldName: target.fieldName,
            value,
            targetRange: [target.expectedMin, target.expectedMax]
          }
        });
      }
    });
  }, [state.lastRxFrame, state.validationSession, state.validationSession?.status, t]);

  // ── PERIPHERAL SYNC ──────────────────────────────────────────────────────────
  const peripherals = usePeripheralStore((s: PeripheralState) => s.peripherals);
  React.useEffect(() => {
    send({
      type: 'UPDATE_PERIPHERALS',
      peripherals: peripherals.map((p: ScriptablePeripheral) => ({
        id: p.id, name: p.name, protocol: p.protocol,
        script: p.script, initialState: p.initialState, isActive: p.isActive
      }))
    });
  }, [peripherals]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SIMULATION CONTROLS ───────────────────────────────────────────────────────
  const start = useCallback((profile: FrameProfile, scenario: Scenario | null, outputMode: OutputMode) => {
    waveformHistoryRef.current = [];
    send({ type: 'START', profile, scenario, outputMode });
    dispatch({ type: 'START', profileId: profile.id, scenarioId: scenario?.id ?? null, outputMode });
    saveLastSettings({ profileId: profile.id, scenarioId: scenario?.id ?? null, outputMode });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    send({ type: 'STOP' });
    dispatch({ type: 'STOP' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback(() => {
    send({ type: 'PAUSE' });
    dispatch({ type: 'PAUSE' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resume = useCallback((_profile: FrameProfile, _scenario: Scenario | null) => {
    send({ type: 'RESUME' });
    dispatch({ type: 'RESUME' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const overrideField = useCallback((fieldId: string, value: number) => {
    send({ type: 'OVERRIDE_FIELD', fieldId, value });
    dispatch({ type: 'OVERRIDE_FIELD', fieldId, value });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const overrideBit = useCallback((bitKey: string, value: number) => {
    send({ type: 'OVERRIDE_BIT', bitKey, value });
    dispatch({ type: 'OVERRIDE_BIT', bitKey, value });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const injectError = useCallback((errorType: ErrorType) => {
    send({ type: 'INJECT_ERROR', errorType });
    dispatch({ type: 'INJECT_ERROR', errorType });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetOverrides = useCallback(() => {
    send({ type: 'RESET_OVERRIDES' });
    dispatch({ type: 'RESET_OVERRIDES' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearExchanges = useCallback(() => {
    exchangeBufferRef.current = [];
    dispatch({ type: 'CLEAR_EXCHANGES' });
  }, [dispatch]);

  // ── SERIAL / NETWORK ──────────────────────────────────────────────────────────
  const connectSerial = useCallback(async (portName: string, baudRate: number) => {
    await invoke('connect_serial', { portName, baudRate }).catch((e: unknown) => {
      dispatch({ type: 'ADD_LOG', entryType: 'error', text: `Seri port hatası: ${e}` });
    });
  }, []);

  const disconnectSerial = useCallback(async () => {
    await invoke('disconnect_serial').catch(console.error);
    send({ type: 'SET_SERIAL_CONNECTED', connected: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectNetwork = useCallback(async (url: string) => {
    if (url.startsWith('tcp-server://')) {
      const portPart = url.replace('tcp-server://', '');
      const port = Number.parseInt(portPart || '5000', 10);

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        dispatch({ type: 'ADD_LOG', entryType: 'error', text: t('simulation.network.invalidPort', { port: portPart ?? '' }) });
        return;
      }

      await invoke('start_tcp_server', { port }).catch((e: unknown) => {
        dispatch({ type: 'ADD_LOG', entryType: 'error', text: `TCP Sunucu hatası: ${e}` });
      });
      return;
    }

    if (url.startsWith('tcp://')) {
      const target = url.replace('tcp://', '');
      const [hostPart, portPart] = target.split(':');
      const host = hostPart || '127.0.0.1';
      const port = Number.parseInt(portPart || '5000', 10);

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        dispatch({ type: 'ADD_LOG', entryType: 'error', text: t('simulation.network.invalidPort', { port: portPart ?? '' }) });
        return;
      }

      await invoke('connect_tcp', { host, port }).catch((e: unknown) => {
        dispatch({ type: 'ADD_LOG', entryType: 'error', text: `TCP hatası: ${e}` });
      });
      return;
    }

    // WebSocket URL — direct browser connection
    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          wsRef.current = ws;
          dispatch({ type: 'SET_NETWORK_CONNECTED', connected: true });
          dispatch({ type: 'ADD_LOG', entryType: 'info', text: t('simulation.network.connected', { url }) });
          resolve();
        };

        ws.onmessage = (event) => {
          const bytes = Array.from(new Uint8Array(event.data));
          const hex = bytes.reduce((acc, b) => acc + b.toString(16).padStart(2, '0').toUpperCase() + ' ', '').trim();
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

          const logEntry = { time: timeStr, text: t('simulation.network.rxNet', { hex }), type: 'rx' as const };
          fullLogRef.current.push(logEntry);
          if (fullLogRef.current.length > 2000) fullLogRef.current = fullLogRef.current.slice(-2000);

          const currentProfile = stateRef.current.profileId
            ? profilesRef.current.find(p => p.id === stateRef.current.profileId)
            : null;

          if (currentProfile) {
            rxBufferRef.current.push(...bytes);
            const totalWidth = currentProfile.fields.reduce((s: number, f: Field) => s + f.byteWidth, 0);
            if (rxBufferRef.current.length >= totalWidth) {
              const frameBytes = rxBufferRef.current.slice(0, totalWidth);
              rxBufferRef.current = rxBufferRef.current.slice(totalWidth);
              const parseResult = parseFrame(currentProfile, frameBytes);
              if (parseResult) {
                const frameHex = frameBytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                const rxFrame = {
                  uId: `net-rx-${Date.now()}-${Math.random()}`,
                  frameNumber: 0,
                  timestampMs: Date.now(),
                  rawHex: frameHex,
                  rawBytes: frameBytes,
                  fields: parseResult,
                  errors: []
                };
                pendingUiUpdateRef.current = { ...pendingUiUpdateRef.current, lastRxFrame: rxFrame };
              }
            }
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          dispatch({ type: 'SET_NETWORK_CONNECTED', connected: false });
          dispatch({ type: 'ADD_LOG', entryType: 'info', text: t('simulation.network.disconnected') });
        };

        ws.onerror = (err) => { console.error('WS Error:', err); };
      } catch (error) {
        reject(error);
      }
    });
  }, [dispatch, fullLogRef, profilesRef, rxBufferRef, stateRef, t]);

  const disconnectNetwork = useCallback(() => {
    invoke('disconnect_tcp').catch(console.error);
    invoke('stop_tcp_server').catch(console.error);
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
  }, []);

  // ── LOGGING ───────────────────────────────────────────────────────────────────
  const exportLogs = useCallback(() => {
    if (fullLogRef.current.length === 0) return;
    const headers = [t('common.time'), t('common.type'), t('common.text')];
    const rows = fullLogRef.current.map(l => [l.time, l.type, `"${l.text.replace(/"/g, '""')}"`]);
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `uart_session_${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [fullLogRef]);

  // ── RECORDING & PLAYBACK ──────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    send({ type: 'START_RECORDING' });
    dispatch({ type: 'SET_RECORDING', recording: true });
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: t('simulation.recording.started') });
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    send({ type: 'STOP_RECORDING' });
    dispatch({ type: 'SET_RECORDING', recording: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRecording = useCallback(async (name: string, data: Array<{ time: number; frame: GeneratedFrame }>) => {
    await invoke('save_recording', { name, data }).catch((e: unknown) => {
      dispatch({ type: 'ADD_LOG', entryType: 'error', text: `Kayıt kaydedilemedi: ${e}` });
    });
  }, [dispatch]);

  const deleteRecording = useCallback(async (id: string) => {
    await invoke('delete_recording', { id }).catch((e: unknown) => {
      dispatch({ type: 'ADD_LOG', entryType: 'error', text: `Kayıt silinemedi: ${e}` });
    });
  }, [dispatch]);

  const refreshRecordings = useCallback(async () => {
    const recordings = await invoke<Array<{ id: string; name: string; createdAt: number; frameCount: number; durationMs: number }>>('list_recordings').catch(() => []);
    msgBufferRef.current.push(JSON.stringify({ type: 'RECORDINGS_LIST', recordings }));
  }, [msgBufferRef]);

  const startPlayback = useCallback((data: Array<{ time: number; frame: GeneratedFrame }>) => {
    send({ type: 'START_PLAYBACK', data });
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: t('simulation.recording.playbackStarted', { count: data.length }) });
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  const pausePlayback = useCallback(() => {
    send({ type: 'PAUSE_PLAYBACK' });
    dispatch({ type: 'PAUSE' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resumePlayback = useCallback(() => {
    send({ type: 'RESUME_PLAYBACK' });
    dispatch({ type: 'RESUME' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seekPlayback = useCallback((index: number) => {
    send({ type: 'SEEK_PLAYBACK', index });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stepPlayback = useCallback((delta: number) => {
    send({ type: 'STEP_PLAYBACK', delta });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SIGNAL & TRIGGERS ─────────────────────────────────────────────────────────
  const setSignalIntegrity = useCallback((integrity: Partial<SignalIntegrity>) => {
    send({ type: 'SET_SIGNAL_INTEGRITY', integrity });
    dispatch({ type: 'SET_SIGNAL_INTEGRITY', integrity });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setTriggers = useCallback((triggers: Trigger[]) => {
    send({ type: 'SET_TRIGGERS', triggers });
    dispatch({ type: 'SET_TRIGGERS', triggers });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DASHBOARD WIDGETS ─────────────────────────────────────────────────────────
  const addWidget = useCallback((type: WidgetType, fieldId: string) => {
    dispatch({
      type: 'ADD_WIDGET', widget: {
        id: uuidv4(), type, fieldId,
        x: 0, y: 0,
        w: type === 'chart' ? 4 : 2,
        h: type === 'chart' ? 4 : 3
      }
    });
  }, [dispatch]);

  const removeWidget = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_WIDGET', id });
  }, [dispatch]);

  const updateLayout = useCallback((widgets: DashboardWidget[]) => {
    dispatch({ type: 'UPDATE_LAYOUT', widgets });
  }, [dispatch]);

  // ── VALIDATION ────────────────────────────────────────────────────────────────
  const startValidation = useCallback(({ name, deviceId, operator, targets }: {
    name: string; deviceId: string; operator: string; targets: ValidationTarget[];
  }) => {
    const session: ValidationSession = {
      id: uuidv4(), name, deviceId, operator,
      status: 'running',
      startTime: Date.now(),
      targets,
      events: [{ id: uuidv4(), timestamp: Date.now(), type: 'session_start', message: t('simulation.validation.sessionStarted', { name }) }],
      dataHistory: [],
      complianceScore: 100
    };
    dispatch({ type: 'START_VALIDATION', session });
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: t('simulation.validation.sessionStartedLog', { name }) });
  }, [dispatch, t]);

  const stopValidation = useCallback(() => {
    if (!stateRef.current.validationSession) return;
    const failures = stateRef.current.validationSession.events.filter(e => e.type === 'compliance_failure').length;
    const score = Math.max(0, 100 - (failures * 10));
    dispatch({ type: 'STOP_VALIDATION', endTime: Date.now(), score });
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: t('simulation.validation.sessionCompleted', { score }) });
  }, [dispatch, stateRef, t]);

  return (
    <SimulationContext.Provider
      value={{
        state,
        waveformHistoryRef,
        start,
        stop,
        pause,
        resume,
        overrideField,
        overrideBit,
        injectError,
        resetOverrides,
        connectSerial,
        disconnectSerial,
        setProfile: (profileId) => dispatch({ type: 'SET_PROFILE', profileId }),
        setScenario: (scenarioId) => dispatch({ type: 'SET_SCENARIO', scenarioId }),
        setOutputMode: (outputMode) => dispatch({ type: 'SET_OUTPUT_MODE', outputMode }),
        clearExchanges,
        setUiVisible: (visible) => { uiVisibleRef.current = visible; },
        exportLogs,
        setProfiles: (profiles) => { profilesRef.current = profiles; },
        connectNetwork,
        disconnectNetwork,
        startRecording,
        stopRecording,
        saveRecording,
        deleteRecording,
        refreshRecordings,
        startPlayback,
        pausePlayback,
        resumePlayback,
        seekPlayback,
        stepPlayback,
        getPorts: () => {
          invoke<Array<{ path: string }>>('list_serial_ports')
            .then(ports => {
              msgBufferRef.current.push(JSON.stringify({ type: 'PORTS_LIST', ports }));
            })
            .catch(console.error);
        },
        selectExchange: (exchangeId) => dispatch({ type: 'SELECT_EXCHANGE', exchangeId }),
        setAnalyzerMode: (enabled) => dispatch({ type: 'SET_ANALYZER_MODE', enabled }),
        setDisplayFilter: (filter) => dispatch({ type: 'SET_DISPLAY_FILTER', filter }),
        toggleWatchlist: (fieldName) => dispatch({ type: 'TOGGLE_WATCHLIST', fieldName }),
        saveSnapshot: (frame) => dispatch({ type: 'SAVE_SNAPSHOT', frame }),
        deleteSnapshot: (frameNumber) => dispatch({ type: 'DELETE_SNAPSHOT', frameNumber }),
        setDiffFrame: (index, frame) => dispatch({ type: 'SET_DIFF_FRAME', index, frame }),
        setTelemetryLayout: (profileId, layout) => dispatch({ type: 'SET_TELEMETRY_LAYOUT', profileId, layout }),
        setResponderRules: (rules: ResponderRule[]) => {
          send({ type: 'SET_RESPONDER_RULES', rules });
          dispatch({ type: 'SET_RESPONDER_RULES', rules });
        },
        setSignalIntegrity,
        setTriggers,
        addWidget,
        removeWidget,
        updateLayout,
        startValidation,
        stopValidation,
        cancelValidation: () => dispatch({ type: 'CANCEL_VALIDATION' }),
        deleteValidationSession: (_id: string) => dispatch({ type: 'CANCEL_VALIDATION' }),
        sendRawData: (hex: string) => {
          const bytes = hex.trim().split(/\s+/).map(h => parseInt(h, 16)).filter(b => !isNaN(b));
          if (bytes.length === 0) return;

          send({ type: 'INJECT_RAW_TX', bytes });
        },
        automation: {
          saveSequence: (seq: AutomationSequence) => {
            saveSequence(seq);
            dispatch({ type: 'SAVE_SEQUENCE', sequence: seq });
          },
          deleteSequence: (id: string) => {
            deleteSequence(id);
            dispatch({ type: 'DELETE_SEQUENCE', id });
          },
          setActiveSequence: (id: string | null) => {
            dispatch({ type: 'SET_ACTIVE_SEQUENCE', id });
          }
        },
        setCustomWaveform: (waveform: number[] | null) => {
          send({ type: 'SET_CUSTOM_WAVEFORM', waveform });
          dispatch({ type: 'SET_CUSTOM_WAVEFORM', waveform });
        }
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
}
