export { reducer, INITIAL_STATE } from './simulationReducer';
export type { SimAction } from './simulationReducer';

import React, { useRef, useCallback, useReducer } from 'react';
import { SimulationContext } from './context';
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
  ValidationTarget
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { parseFrame } from '../engines/FrameParser';
import { reducer, INITIAL_STATE } from './simulationReducer';
import { useBackendConnection } from './useBackendConnection';
import { useUIUpdateLoop } from './useUIUpdateLoop';
import type { SimulationState } from '../types';

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const msgBufferRef = useRef<string[]>([]);
  const profilesRef = useRef<FrameProfile[]>([]);
  const uiVisibleRef = useRef(false);
  const conversationBufferRef = useRef<any[]>([]);
  const exchangeBufferRef = useRef<any[]>([]);
  const pendingUiUpdateRef = useRef<Partial<SimulationState> | null>(null);
  const rxBufferRef = useRef<number[]>([]);
  const fullLogRef = useRef<Array<{ time: string; text: string; type: string }>>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const isInitializedRef = useRef(false);

  // ── BACKEND CONNECTION ───────────────────────
  const { backendWsRef } = useBackendConnection(dispatch, msgBufferRef);

  // ── UI UPDATE LOOP ───────────────────────────
  useUIUpdateLoop({
    stateRef,
    msgBufferRef,
    profilesRef,
    uiVisibleRef,
    conversationBufferRef,
    exchangeBufferRef,
    dispatch,
  });

  // ── PERSISTENCE ──────────────────────────────
  React.useEffect(() => {
    try {
      const persisted = localStorage.getItem('uart_pro_state');
      const legacyLayouts = localStorage.getItem('uart_telemetry_layouts');
      const parsed = persisted ? JSON.parse(persisted) : {};
      const layouts = legacyLayouts ? JSON.parse(legacyLayouts) : (parsed.telemetryLayouts || {});
      dispatch({
        type: 'INIT_STATE', newState: {
          watchlist: parsed.watchlist || [],
          snapshots: parsed.snapshots || [],
          analyzerMode: parsed.analyzerMode ?? true,
          telemetryLayouts: layouts,
          dashboardLayout: parsed.dashboardLayout || { widgets: [] }
        }
      });
      isInitializedRef.current = true;
    } catch (e) {
      console.error('Failed to load persisted state', e);
      isInitializedRef.current = true;
    }
  }, []);

  React.useEffect(() => {
    if (!isInitializedRef.current) return;
    const toPersist = {
      watchlist: state.watchlist,
      snapshots: state.snapshots,
      analyzerMode: state.analyzerMode,
      dashboardLayout: state.dashboardLayout
    };
    localStorage.setItem('uart_pro_state', JSON.stringify(toPersist));
  }, [state.watchlist, state.snapshots, state.analyzerMode, state.dashboardLayout]);

  // ── MEDICAL VALIDATION MONITORING ───────────
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
              ? `${target.fieldName} normale döndü: ${value} ${target.unit}`
              : `${target.fieldName} limit dışı: ${value} ${target.unit} (Beklenen: ${target.expectedMin}-${target.expectedMax})`,
            fieldName: target.fieldName,
            value,
            targetRange: [target.expectedMin, target.expectedMax]
          }
        });
      }
    });
  }, [state.lastRxFrame, state.validationSession?.status]);

  // ── SIMULATION CONTROLS ──────────────────────
  const start = useCallback((profile: FrameProfile, scenario: Scenario | null, outputMode: OutputMode) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'START', profile, scenario, outputMode }));
    dispatch({ type: 'START', profileId: profile.id, scenarioId: scenario?.id ?? null, outputMode });
  }, []);

  const stop = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'STOP' }));
    dispatch({ type: 'STOP' });
  }, []);

  const pause = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'PAUSE' }));
    dispatch({ type: 'PAUSE' });
  }, []);

  const resume = useCallback((_profile: FrameProfile, _scenario: Scenario | null) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'RESUME' }));
    dispatch({ type: 'RESUME' });
  }, []);

  const overrideField = useCallback((fieldId: string, value: number) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'OVERRIDE_FIELD', fieldId, value }));
    dispatch({ type: 'OVERRIDE_FIELD', fieldId, value });
  }, []);

  const overrideBit = useCallback((bitKey: string, value: number) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'OVERRIDE_BIT', bitKey, value }));
    dispatch({ type: 'OVERRIDE_BIT', bitKey, value });
  }, []);

  const injectError = useCallback((errorType: ErrorType) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'INJECT_ERROR', errorType }));
    dispatch({ type: 'INJECT_ERROR', errorType });
  }, []);

  const resetOverrides = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'RESET_OVERRIDES' }));
    dispatch({ type: 'RESET_OVERRIDES' });
  }, []);

  // ── SERIAL / NETWORK ─────────────────────────
  const connectSerial = useCallback(async (portName: string, baudRate: number) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'CONNECT_SERIAL', config: { portName, baudRate } }));
  }, []);

  const disconnectSerial = useCallback(async () => {
    backendWsRef.current?.send(JSON.stringify({ type: 'DISCONNECT_SERIAL' }));
  }, []);

  const connectNetwork = useCallback(async (url: string) => {
    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          wsRef.current = ws;
          dispatch({ type: 'SET_NETWORK_CONNECTED', connected: true });
          dispatch({ type: 'ADD_LOG', entryType: 'info', text: `Network bağlandı: ${url}` });
          resolve();
        };

        ws.onmessage = (event) => {
          const bytes = Array.from(new Uint8Array(event.data));
          const hex = bytes.reduce((acc, b) => acc + b.toString(16).padStart(2, '0').toUpperCase() + ' ', '').trim();
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

          const logEntry = { time: timeStr, text: `RX (NET): ${hex}`, type: 'rx' as const };
          fullLogRef.current.push(logEntry);

          const currentProfile = stateRef.current.profileId
            ? profilesRef.current.find(p => p.id === stateRef.current.profileId)
            : null;

          if (currentProfile) {
            rxBufferRef.current.push(...bytes);
            const totalWidth = currentProfile.fields.reduce((s: number, f: any) => s + f.byteWidth, 0);
            if (rxBufferRef.current.length >= totalWidth) {
              const frameBytes = rxBufferRef.current.slice(0, totalWidth);
              rxBufferRef.current = rxBufferRef.current.slice(totalWidth);
              const parseResult = parseFrame(currentProfile, frameBytes);
              if (parseResult) {
                const rxFrame = {
                  uId: `net-rx-${Date.now()}-${Math.random()}`,
                  frameNumber: 0,
                  timestampMs: Date.now(),
                  rawHex: hex,
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
          dispatch({ type: 'ADD_LOG', entryType: 'info', text: 'Network bağlantısı kesildi' });
        };

        ws.onerror = (err) => {
          console.error('WS Error:', err);
          dispatch({ type: 'ADD_LOG', entryType: 'error', text: 'Network hatası oluştu' });
          reject(err);
        };
      } catch (err: any) {
        reject(err);
      }
    });
  }, []);

  const disconnectNetwork = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
  }, []);

  // ── LOGGING ──────────────────────────────────
  const exportLogs = useCallback(() => {
    if (fullLogRef.current.length === 0) return;
    const headers = ['Time', 'Type', 'Text'];
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
  }, []);

  // ── RECORDING & PLAYBACK ─────────────────────
  const startRecording = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'BEGIN_RECORD' }));
    dispatch({ type: 'SET_RECORDING', recording: true });
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: 'Kayıt başlatıldı...' });
  }, []);

  const stopRecording = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'END_RECORD' }));
  }, []);

  const saveRecording = useCallback((name: string, data: any[]) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'SAVE_RECORDING', name, data }));
  }, []);

  const deleteRecording = useCallback((id: string) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'DELETE_RECORDING', id }));
  }, []);

  const refreshRecordings = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'LIST_RECORDINGS' }));
  }, []);

  const startPlayback = useCallback((data: any) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'START_PLAYBACK', data }));
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: `Kayıt oynatılıyor: ${data.length} frame.` });
  }, []);

  const pausePlayback = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'PAUSE_PLAYBACK' }));
    dispatch({ type: 'PAUSE' });
  }, []);

  const resumePlayback = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'RESUME_PLAYBACK' }));
    dispatch({ type: 'RESUME' });
  }, []);

  const seekPlayback = useCallback((index: number) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'SEEK_PLAYBACK', index }));
  }, []);

  const stepPlayback = useCallback((delta: number) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'STEP_PLAYBACK', delta }));
  }, []);

  // ── SIGNAL & TRIGGERS ────────────────────────
  const setSignalIntegrity = useCallback((integrity: Partial<SignalIntegrity>) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'SET_SIGNAL_INTEGRITY', integrity }));
    dispatch({ type: 'SET_SIGNAL_INTEGRITY', integrity });
  }, []);

  const setTriggers = useCallback((triggers: Trigger[]) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'SET_TRIGGERS', triggers }));
    dispatch({ type: 'SET_TRIGGERS', triggers });
  }, []);

  // ── DASHBOARD WIDGETS ────────────────────────
  const addWidget = useCallback((type: WidgetType, fieldId: string) => {
    dispatch({
      type: 'ADD_WIDGET', widget: {
        id: uuidv4(), type, fieldId,
        x: 0, y: 0,
        w: type === 'chart' ? 4 : 2,
        h: type === 'chart' ? 4 : 3
      }
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_WIDGET', id });
  }, []);

  const updateLayout = useCallback((widgets: DashboardWidget[]) => {
    dispatch({ type: 'UPDATE_LAYOUT', widgets });
  }, []);

  // ── VALIDATION ───────────────────────────────
  const startValidation = useCallback(({ name, deviceId, operator, targets }: {
    name: string; deviceId: string; operator: string; targets: ValidationTarget[];
  }) => {
    const session: any = {
      id: uuidv4(), name, deviceId, operator,
      status: 'running',
      startTime: Date.now(),
      targets,
      events: [{ id: uuidv4(), timestamp: Date.now(), type: 'session_start', message: `Validasyon seansı başlatıldı: ${name}` }],
      dataHistory: [],
      complianceScore: 100
    };
    dispatch({ type: 'START_VALIDATION', session });
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: `VALIDASYON BAŞLATILDI: ${name}` });
  }, []);

  const stopValidation = useCallback(() => {
    if (!stateRef.current.validationSession) return;
    const failures = stateRef.current.validationSession.events.filter(e => e.type === 'compliance_failure').length;
    const score = Math.max(0, 100 - (failures * 10));
    dispatch({ type: 'STOP_VALIDATION', endTime: Date.now(), score });
    dispatch({ type: 'ADD_LOG', entryType: 'info', text: `VALIDASYON TAMAMLANDI. Skor: ${score}%` });
  }, []);

  return (
    <SimulationContext.Provider
      value={{
        state,
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
        getPorts: () => { backendWsRef.current?.send(JSON.stringify({ type: 'GET_PORTS' })); },
        selectExchange: (exchangeId) => dispatch({ type: 'SELECT_EXCHANGE', exchangeId }),
        setAnalyzerMode: (enabled) => dispatch({ type: 'SET_ANALYZER_MODE', enabled }),
        setDisplayFilter: (filter) => dispatch({ type: 'SET_DISPLAY_FILTER', filter }),
        toggleWatchlist: (fieldName) => dispatch({ type: 'TOGGLE_WATCHLIST', fieldName }),
        saveSnapshot: (frame) => dispatch({ type: 'SAVE_SNAPSHOT', frame }),
        deleteSnapshot: (frameNumber) => dispatch({ type: 'DELETE_SNAPSHOT', frameNumber }),
        setDiffFrame: (index, frame) => dispatch({ type: 'SET_DIFF_FRAME', index, frame }),
        setTelemetryLayout: (profileId, layout) => dispatch({ type: 'SET_TELEMETRY_LAYOUT', profileId, layout }),
        setResponderRules: (rules: ResponderRule[]) => {
          backendWsRef.current?.send(JSON.stringify({ type: 'UPDATE_RULES', rules }));
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
        deleteValidationSession: (_id) => dispatch({ type: 'CANCEL_VALIDATION' }),
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
}
