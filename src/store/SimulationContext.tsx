import React, { useRef, useCallback, useReducer, startTransition } from 'react';
import { SimulationContext } from './context';
import type {
  SimulationState,
  FrameProfile,
  Scenario,
  OutputMode,
  ErrorType,
  GeneratedFrame,
  TimingStats,
  ResponderRule,
  RecordingMetadata,
  SimulationStatus,
  Trigger,
  SignalIntegrity,
  DashboardWidget,
  WidgetType
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { generateFrame } from '../engines/FrameGenerator';
import { parseFrame } from '../engines/FrameParser';
import { tickScenarioEngine } from '../engines/ScenarioEngine';

const BACKEND_URL = 'ws://127.0.0.1:8080';

// ─────────────────────────────────────────────
// SİMÜLASYON CONTEXT
// ─────────────────────────────────────────────

const MAX_RECENT_FRAMES = 50;
const MAX_LOG_ENTRIES = 100;
const MAX_WAVEFORM_POINTS = 512;

const INITIAL_STATE: SimulationState = {
  status: 'stopped',
  profileId: null,
  scenarioId: null,
  outputMode: 'log',
  serialConnected: false,
  networkConnected: false,
  startedAt: null,
  elapsedMs: 0,
  frameCount: 0,
  errorCount: 0,
  framesPerSecond: 0,
  lastFrame: null,
  lastRxFrame: null,
  recentFrames: [],
  waveformHistory: [],
  logEntries: [],
  fieldOverrides: {},
  bitOverrides: {},
  activeRamps: {},
  activePulses: {},
  pendingErrors: [],
  isRecording: false,
  conversationLogs: [],
  exchanges: [],
  selectedExchangeId: null,
  analyzerMode: true, // Default to true now for pro feel
  displayFilter: '',
  watchlist: [],
  snapshots: [],
  triggers: [],
  signalIntegrity: {
    noiseLevel: 0,
    jitterMs: 0,
    bitFlipsEnabled: false
  },
  dashboardLayout: {
    widgets: []
  },
  timingStats: {
    averageLatencyMs: 0,
    minLatencyMs: 0,
    maxLatencyMs: 0,
    jitterMs: 0,
    interPacketArrivals: []
  },
  diffFrames: [null, null],
  responderRules: [],
  telemetryLayouts: {},
  recordings: [],
  playbackIndex: 0,
  playbackTotal: 0,
  logicHistory: [
    { id: 'tx-main', name: 'UART TX', transitions: [] }
  ]
};

type SimAction =
  | { type: 'START'; profileId: string; scenarioId: string | null; outputMode: OutputMode }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'TICK'; elapsedMs: number; newState: Partial<SimulationState>; points: Array<Record<string, number>> }
  | { type: 'OVERRIDE_FIELD'; fieldId: string; value: number }
  | { type: 'OVERRIDE_BIT'; bitKey: string; value: number }
  | { type: 'INJECT_ERROR'; errorType: ErrorType }
  | { type: 'CONSUME_ERROR' }
  | { type: 'RESET_OVERRIDES' }
  | { type: 'SET_SERIAL_CONNECTED'; connected: boolean }
  | { type: 'SET_PROFILE'; profileId: string | null }
  | { type: 'SET_SCENARIO'; scenarioId: string | null }
  | { type: 'SET_OUTPUT_MODE'; outputMode: OutputMode }
  | { type: 'SET_NETWORK_CONNECTED'; connected: boolean }
  | { type: 'SET_RECORDING'; recording: boolean }
  | { type: 'ADD_LOG'; entryType: 'info' | 'tx' | 'rx' | 'error'; text: string }
  | { type: 'BATCH_LOGS'; entries: Array<SimulationState['logEntries'][0]> }
  | { type: 'ADD_CONVERSATION'; entry: any }
  | { type: 'UPDATE_EXCHANGE'; exchange: any; lastRxFrame?: GeneratedFrame | null }
  | { type: 'SELECT_EXCHANGE'; exchangeId: string | null }
  | { type: 'SET_ANALYZER_MODE'; enabled: boolean }
  | { type: 'SET_DISPLAY_FILTER'; filter: string }
  | { type: 'TOGGLE_WATCHLIST'; fieldName: string }
  | { type: 'SET_SIGNAL_INTEGRITY'; integrity: Partial<SimulationState['signalIntegrity']> }
  | { type: 'SET_TRIGGERS'; triggers: Trigger[] }
  | { type: 'SAVE_SNAPSHOT'; frame: GeneratedFrame }
  | { type: 'DELETE_SNAPSHOT'; frameNumber: number }
  | { type: 'INIT_STATE'; newState: Partial<SimulationState> }
  | { type: 'SET_BACKEND_CONNECTED'; connected: boolean }
  | { type: 'UPDATE_TIMING_STATS'; stats: TimingStats }
  | { type: 'SET_DIFF_FRAME'; index: 0 | 1; frame: GeneratedFrame | null }
  | { type: 'SET_RESPONDER_RULES'; rules: ResponderRule[] }
  | { type: 'SET_TELEMETRY_LAYOUT'; profileId: string; layout: string[] }
  | { type: 'SET_RECORDINGS'; recordings: RecordingMetadata[] }
  | { type: 'SET_STATUS'; status: SimulationStatus }
  | { type: 'ADD_WIDGET'; widget: DashboardWidget }
  | { type: 'REMOVE_WIDGET'; id: string }
  | { type: 'UPDATE_LAYOUT'; widgets: DashboardWidget[] }
  | { type: 'MASTER_TICK'; updates: Partial<SimulationState>; points: Array<Record<string, number>>; logEntries: Array<SimulationState['logEntries'][0]>; elapsedMs: number }
  | { type: 'BATCH_UPDATE'; updates: Partial<SimulationState> };

function reducer(state: SimulationState, action: SimAction): SimulationState {
  switch (action.type) {
    case 'SET_PROFILE':
      return { ...state, profileId: action.profileId };
    case 'SET_SCENARIO':
      return { ...state, scenarioId: action.scenarioId };
    case 'SET_OUTPUT_MODE':
      return { ...state, outputMode: action.outputMode };
    case 'START':
      return {
        ...state,
        status: 'running',
        profileId: action.profileId,
        scenarioId: action.scenarioId,
        outputMode: action.outputMode,
        startedAt: Date.now(),
      };
    case 'STOP':
      return { ...state, status: 'stopped' };
    case 'PAUSE':
      return { ...state, status: 'paused' };
    case 'RESUME':
      return { ...state, status: 'running' };
    case 'MASTER_TICK': {
      const { updates, points, logEntries, elapsedMs } = action;
      
      const mergedFrame = (updates.lastFrame ?? state.lastFrame) as GeneratedFrame | null;
      let updatedRecent = state.recentFrames;
      if (mergedFrame && updates.lastFrame) {
        // Only update recent frames if a new frame actually arrived in this master tick
        updatedRecent = [mergedFrame, ...state.recentFrames].slice(0, MAX_RECENT_FRAMES);
      }

      let updatedWaveform = state.waveformHistory;
      if (points && points.length > 0) {
        updatedWaveform = [...state.waveformHistory, ...points].slice(-MAX_WAVEFORM_POINTS);
      }

      const combinedLogEntries = logEntries.length > 0
        ? [...state.logEntries.slice(-(MAX_LOG_ENTRIES - logEntries.length)), ...logEntries]
        : state.logEntries;

      // Handle Logic Analyzer History Update
      let newLogicHistory = [...state.logicHistory];
      if (updates.lastFrame && updates.lastFrame.bitStream) {
        newLogicHistory = newLogicHistory.map(sig => {
          if (sig.id === 'tx-main') {
            const updatedTransitions = [...sig.transitions, ...(updates.lastFrame!.bitStream || [])];
            // Keep last 4000 transitions for performance
            return {
              ...sig,
              transitions: updatedTransitions.slice(-4000)
            };
          }
          return sig;
        });
      }

      return {
        ...state,
        ...updates,
        logEntries: combinedLogEntries,
        recentFrames: updatedRecent,
        waveformHistory: updatedWaveform,
        logicHistory: newLogicHistory,
        elapsedMs: elapsedMs !== undefined ? elapsedMs : state.elapsedMs,
        // Preserve specific UI states
        selectedExchangeId: updates.selectedExchangeId !== undefined ? updates.selectedExchangeId : state.selectedExchangeId,
        watchlist: updates.watchlist || state.watchlist
      };
    }
    case 'ADD_LOG': {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
      return {
        ...state,
        logEntries: [...state.logEntries.slice(-(MAX_LOG_ENTRIES - 1)), { time: timeStr, text: action.text, type: action.entryType }]
      };
    }
    case 'OVERRIDE_FIELD':
      return {
        ...state,
        fieldOverrides: { ...state.fieldOverrides, [action.fieldId]: action.value },
      };
    case 'OVERRIDE_BIT':
      return {
        ...state,
        bitOverrides: { ...state.bitOverrides, [action.bitKey]: action.value },
      };
    case 'INJECT_ERROR':
      return {
        ...state,
        pendingErrors: [...state.pendingErrors, action.errorType],
      };
    case 'CONSUME_ERROR':
      return {
        ...state,
        pendingErrors: state.pendingErrors.slice(1),
      };
    case 'RESET_OVERRIDES':
      return {
        ...state,
        fieldOverrides: {},
        bitOverrides: {},
        activeRamps: {},
        activePulses: {},
        pendingErrors: [],
      };
    case 'SET_SERIAL_CONNECTED':
      return { ...state, serialConnected: action.connected };
    case 'SET_NETWORK_CONNECTED':
      return { ...state, networkConnected: action.connected };
    case 'SET_RECORDING':
      return { ...state, isRecording: action.recording };
    case 'ADD_CONVERSATION':
      return { 
        ...state, 
        conversationLogs: [action.entry, ...state.conversationLogs].slice(0, 100) 
      };
    case 'UPDATE_EXCHANGE':
      const updatedExchanges = [...state.exchanges];
      const existingIdx = updatedExchanges.findIndex(e => e.id === action.exchange.id);
      
      const nextExchanges = existingIdx !== -1
        ? (updatedExchanges[existingIdx] = action.exchange, updatedExchanges)
        : [action.exchange, ...state.exchanges].slice(0, 50);

      return { 
        ...state, 
        exchanges: nextExchanges,
        lastRxFrame: action.lastRxFrame || state.lastRxFrame
      };
    case 'SELECT_EXCHANGE':
      return { ...state, selectedExchangeId: action.exchangeId };
    case 'SET_ANALYZER_MODE':
      return { ...state, analyzerMode: action.enabled };
    case 'SET_DISPLAY_FILTER':
      return { ...state, displayFilter: action.filter };
    case 'TOGGLE_WATCHLIST':
      const newWatchlist = state.watchlist.includes(action.fieldName)
        ? state.watchlist.filter(f => f !== action.fieldName)
        : [...state.watchlist, action.fieldName];
      return { ...state, watchlist: newWatchlist };
    case 'SAVE_SNAPSHOT':
        if (state.snapshots.some(s => s.frameNumber === action.frame.frameNumber)) return state;
        return { ...state, snapshots: [...state.snapshots, action.frame] };
    case 'DELETE_SNAPSHOT':
        return { ...state, snapshots: state.snapshots.filter(s => s.frameNumber !== action.frameNumber) };
    case 'SET_SIGNAL_INTEGRITY':
      return {
        ...state,
        signalIntegrity: { ...state.signalIntegrity, ...action.integrity }
      };
    case 'SET_TRIGGERS':
      return { ...state, triggers: action.triggers };
    case 'INIT_STATE':
      return { 
        ...state, 
        ...action.newState,
        // Preserve strictly frontend-only or sensitive states across init
        networkConnected: state.networkConnected,
        serialConnected: action.newState.serialConnected !== undefined ? action.newState.serialConnected : state.serialConnected,
        diffFrames: action.newState.diffFrames !== undefined ? action.newState.diffFrames : state.diffFrames,
        responderRules: action.newState.responderRules !== undefined ? action.newState.responderRules : state.responderRules,
        telemetryLayouts: action.newState.telemetryLayouts || state.telemetryLayouts || {},
        // Ensure specific arrays are initialized if everything else fails
        watchlist: action.newState.watchlist || state.watchlist || [],
        snapshots: action.newState.snapshots || state.snapshots || []
      };
    case 'SET_BACKEND_CONNECTED':
      return { ...state, networkConnected: action.connected };
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'UPDATE_TIMING_STATS':
      return { ...state, timingStats: action.stats };

    case 'SET_DIFF_FRAME':
      const newDiffFrames = [...state.diffFrames] as [GeneratedFrame | null, GeneratedFrame | null];
      newDiffFrames[action.index] = action.frame;
      return { ...state, diffFrames: newDiffFrames };
    case 'SET_TELEMETRY_LAYOUT': {
      const newLayouts = { ...state.telemetryLayouts, [action.profileId]: action.layout };
      // Save globally for persistence
      try {
        const currentPro = JSON.parse(localStorage.getItem('uart_pro_state') || '{}');
        localStorage.setItem('uart_pro_state', JSON.stringify({ ...currentPro, telemetryLayouts: newLayouts }));
      } catch (e) { console.error('Layout persistence failed', e); }
      return { ...state, telemetryLayouts: newLayouts };
    }
    case 'SET_RECORDINGS':
      return { ...state, recordings: action.recordings };
    case 'SET_RESPONDER_RULES':
      return { ...state, responderRules: action.rules };
    case 'ADD_WIDGET':
      return {
        ...state,
        dashboardLayout: {
          ...state.dashboardLayout,
          widgets: [...(state.dashboardLayout?.widgets || []), action.widget]
        }
      };
    case 'REMOVE_WIDGET':
      return {
        ...state,
        dashboardLayout: {
          ...state.dashboardLayout,
          widgets: (state.dashboardLayout?.widgets || []).filter(w => w.id !== action.id)
        }
      };
    case 'UPDATE_LAYOUT':
      return {
        ...state,
        dashboardLayout: {
          ...state.dashboardLayout,
          widgets: action.widgets
        }
      };
    case 'BATCH_UPDATE':
      return { ...state, ...action.updates };
    default:
      return state;
  }
}


// SimulationContextType is imported from ../types

// Context is now imported from ./context.ts

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCountRef = useRef(0);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const portRef = useRef<any>(null);
  const writerRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const backendWsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logBufferRef = useRef<Array<SimulationState['logEntries'][0]>>([]);
  const profilesRef = useRef<FrameProfile[]>([]);
  const lastLogFlushRef = useRef(Date.now());
  const frameCounterRef = useRef(0);
  const msgBufferRef = useRef<string[]>([]);
  const waveformBufferRef = useRef<Array<Record<string, number>>>([]);

  const assignUid = useCallback((frame: any) => ({
    ...frame,
    uId: `${frame.frameNumber}-${frame.timestampMs || Date.now()}-${frameCounterRef.current++}`
  }), []);
  const uiUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUiUpdateRef = useRef<Partial<SimulationState> | null>(null);
  const rxBufferRef = useRef<number[]>([]);
  const fullLogRef = useRef<Array<{ time: string; text: string; type: string }>>([]);
  const uiVisibleRef = useRef(false);
  const conversationBufferRef = useRef<any[]>([]);
  const exchangeBufferRef = useRef<any[]>([]);

  // ── PERSISTENCE (PRO SUITE) ──────────────────
  React.useEffect(() => {
    try {
      const persisted = localStorage.getItem('uart_pro_state');
      const legacyLayouts = localStorage.getItem('uart_telemetry_layouts');
      
      const parsed = persisted ? JSON.parse(persisted) : {};
      const layouts = legacyLayouts ? JSON.parse(legacyLayouts) : (parsed.telemetryLayouts || {});

      dispatch({ type: 'INIT_STATE', newState: {
        watchlist: parsed.watchlist || [],
        snapshots: parsed.snapshots || [],
        analyzerMode: parsed.analyzerMode ?? true,
        telemetryLayouts: layouts
      }});
    } catch (e) {
      console.error('Failed to load persisted state', e);
    }
  }, []);

  React.useEffect(() => {
    const toPersist = {
      watchlist: state.watchlist,
      snapshots: state.snapshots,
      analyzerMode: state.analyzerMode
    };
    localStorage.setItem('uart_pro_state', JSON.stringify(toPersist));
  }, [state.watchlist, state.snapshots, state.analyzerMode]);

  // ── BACKEND CONNECTION ───────────────────────
  React.useEffect(() => {
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
        if (!isMountedRef.current) {
            socket.close();
            return;
        }
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
            reconnectTimerRef.current = setTimeout(connect, 2000); // Auto-reconnect
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    if (isMountedRef.current) {
        connect();
    }

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
      }
      if (currentSocket) {
          currentSocket.onclose = null; // Prevent reconnect loop
          // Only close if it's actually open or connecting
          if (currentSocket.readyState === WebSocket.OPEN) {
            currentSocket.close();
          }
      }
    };
  }, []);

  // ── UI UPDATE LOOP ───────────────────────────
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!uiVisibleRef.current) return;

      const rawMsgs = msgBufferRef.current;
      msgBufferRef.current = [];
      
      const masterBatch: Partial<SimulationState> = {};
      const newPoints: any[] = [];
      const newLogs: any[] = [];
      let latestElapsed = stateRef.current.elapsedMs;

      // 1. Process Message Buffer
      for (const raw of rawMsgs) {
        try {
          const parsed = JSON.parse(raw);
          const msgs = Array.isArray(parsed) ? parsed : [parsed];
          
          for (const msg of msgs) {
            switch(msg.type) {
              case 'INITIAL_STATE':
                startTransition(() => {
                  dispatch({ type: 'INIT_STATE', newState: msg.state });
                });
                break;
              case 'TICK':
                const frameWithUid = assignUid(msg.frame);
                masterBatch.lastFrame = frameWithUid;
                masterBatch.status = msg.status;
                masterBatch.profileId = msg.selectedProfileId;
                latestElapsed = msg.elapsedMs;
                
                const point: Record<string, number> = { t: msg.frame.timestampMs };
                msg.frame.fields.forEach((f: any) => point[f.name] = f.decimal);
                newPoints.push(point);

                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
                newLogs.push({ time: timeStr, text: `TX: ${msg.frame.rawHex}`, type: 'tx' });
                break;
              case 'LOG':
                newLogs.push(msg.entry);
                break;
              case 'EXCHANGE':
                exchangeBufferRef.current.push(msg.exchange);
                break;
              case 'CONVERSATION':
                conversationBufferRef.current.push(msg.entry);
                break;
              case 'RAW_RX_DATA':
                if (profilesRef.current.length > 0) {
                  const profile = profilesRef.current.find(p => p.id === stateRef.current.profileId);
                  
                  const now = new Date();
                  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
                  newLogs.push({ time: timeStr, text: `RX: ${msg.hex}`, type: 'rx' });

                  if (profile) {
                    const bytes = msg.hex.split(' ').map((h: string) => parseInt(h, 16));
                    const fields = parseFrame(profile, bytes);
                    masterBatch.lastRxFrame = assignUid({
                      frameNumber: 0,
                      timestampMs: Date.now(),
                      rawHex: msg.hex,
                      rawBytes: bytes,
                      fields: fields || [],
                      errors: []
                    });
                  }
                }
                break;
              case 'STATUS_UPDATE':
                masterBatch.status = msg.status;
                break;
              case 'PORTS_LIST':
                masterBatch.availablePorts = msg.ports;
                break;
              case 'SERIAL_STATUS':
                masterBatch.serialConnected = msg.connected;
                if (msg.error) {
                  newLogs.push({ 
                    time: new Date().toLocaleTimeString(), 
                    text: `SERİ PORT HATASI: ${msg.error}`, 
                    type: 'error' 
                  });
                } else if (msg.connected) {
                  newLogs.push({ 
                    time: new Date().toLocaleTimeString(), 
                    text: 'Seri port başarıyla bağlandı.', 
                    type: 'info' 
                  });
                }
                break;
            }
          }
        } catch (e) {}
      }

      // 2. Process Buffered Conversations
      if (conversationBufferRef.current.length > 0) {
        const convEntries = [...conversationBufferRef.current];
        conversationBufferRef.current = [];
        masterBatch.conversationLogs = [...convEntries, ...stateRef.current.conversationLogs].slice(0, 100);
      }

      // 3. Process Buffered Exchanges & Timing
      if (exchangeBufferRef.current.length > 0) {
        const exEntries = [...exchangeBufferRef.current];
        exchangeBufferRef.current = [];
        const currentExchanges = [...stateRef.current.exchanges];
        let latestLat: number | null = null;

        exEntries.forEach(ex => {
          const idx = currentExchanges.findIndex(e => e.id === ex.id);
          if (idx !== -1) currentExchanges[idx] = ex;
          else currentExchanges.unshift(ex);
          if (ex.latencyMs !== undefined) latestLat = ex.latencyMs;
        });

        if (latestLat !== null) {
          const arrivals = [...stateRef.current.timingStats.interPacketArrivals, latestLat].slice(-50);
          masterBatch.timingStats = {
            averageLatencyMs: arrivals.reduce((a, b) => a + b, 0) / arrivals.length,
            minLatencyMs: Math.min(...arrivals),
            maxLatencyMs: Math.max(...arrivals),
            jitterMs: arrivals.length > 1 ? arrivals.slice(1).reduce((acc, v, i) => acc + Math.abs(v - arrivals[i]), 0) / (arrivals.length - 1) : 0,
            interPacketArrivals: arrivals
          };
        }

        masterBatch.exchanges = currentExchanges.slice(0, 50);
      }

      // 4. Atomic Dispatch as Non-Blocking Transition
      startTransition(() => {
        dispatch({
          type: 'MASTER_TICK',
          updates: masterBatch,
          points: newPoints,
          logEntries: newLogs,
          elapsedMs: latestElapsed
        });
      });
    }, 66);
    return () => clearInterval(timer);
  }, []);

  const stop = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'STOP' }));
    dispatch({ type: 'STOP' });
  }, []);

  const pause = useCallback(() => {
    backendWsRef.current?.send(JSON.stringify({ type: 'PAUSE' }));
    dispatch({ type: 'PAUSE' });
  }, []);

  const start = useCallback(
    (profile: FrameProfile, scenario: Scenario | null, outputMode: OutputMode) => {
      backendWsRef.current?.send(JSON.stringify({ 
        type: 'START', 
        profile, 
        scenario, 
        outputMode 
      }));
      dispatch({
        type: 'START',
        profileId: profile.id,
        scenarioId: scenario?.id ?? null,
        outputMode,
      });
    },
    [],
  );

  const resume = useCallback(
    (profile: FrameProfile, scenario: Scenario | null) => {
      backendWsRef.current?.send(JSON.stringify({ type: 'RESUME' }));
      dispatch({ type: 'RESUME' });
    },
    [],
  );

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

  const connectSerial = useCallback(async (portName: string, baudRate: number) => {
    backendWsRef.current?.send(JSON.stringify({ 
        type: 'CONNECT_SERIAL', 
        config: { portName, baudRate }
    }));
  }, []);

  const disconnectSerial = useCallback(async () => {
    backendWsRef.current?.send(JSON.stringify({ type: 'DISCONNECT_SERIAL' }));
  }, []);

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
          logBufferRef.current.push(logEntry);
          fullLogRef.current.push(logEntry);

          const currentProfile = stateRef.current.profileId 
            ? profilesRef.current.find((p) => p.id === stateRef.current.profileId) 
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
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const setProfiles = useCallback((profiles: FrameProfile[]) => {
    profilesRef.current = profiles;
  }, []);

  const setProfile = useCallback((profileId: string | null) => {
    dispatch({ type: 'SET_PROFILE', profileId });
  }, []);

  const setScenario = useCallback((scenarioId: string | null) => {
    dispatch({ type: 'SET_SCENARIO', scenarioId });
  }, []);

  const setOutputMode = useCallback((outputMode: OutputMode) => {
    dispatch({ type: 'SET_OUTPUT_MODE', outputMode });
  }, []);

  const setUiVisible = useCallback((visible: boolean) => {
    uiVisibleRef.current = visible;
  }, []);

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

  const setSignalIntegrity = useCallback((integrity: Partial<SignalIntegrity>) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'SET_SIGNAL_INTEGRITY', integrity }));
    dispatch({ type: 'SET_SIGNAL_INTEGRITY', integrity });
  }, []);

  const setTriggers = useCallback((triggers: Trigger[]) => {
    backendWsRef.current?.send(JSON.stringify({ type: 'SET_TRIGGERS', triggers }));
    dispatch({ type: 'SET_TRIGGERS', triggers });
  }, []);

  const addWidget = useCallback((type: WidgetType, fieldId: string) => {
    const newWidget: DashboardWidget = {
      id: uuidv4(),
      type,
      fieldId,
      x: 0,
      y: 0,
      w: type === 'chart' ? 4 : 2,
      h: type === 'chart' ? 4 : 3
    };
    dispatch({ type: 'ADD_WIDGET', widget: newWidget });
  }, []);

  const removeWidget = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_WIDGET', id });
  }, []);

  const updateLayout = useCallback((widgets: DashboardWidget[]) => {
    dispatch({ type: 'UPDATE_LAYOUT', widgets });
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
        setProfile,
        setScenario,
        setOutputMode,
        setUiVisible,
        exportLogs,
        setProfiles,
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
          backendWsRef.current?.send(JSON.stringify({ type: 'GET_PORTS' }));
        },
        selectExchange: (exchangeId: string | null) => {
          dispatch({ type: 'SELECT_EXCHANGE', exchangeId });
        },
        setAnalyzerMode: (enabled: boolean) => {
          dispatch({ type: 'SET_ANALYZER_MODE', enabled });
        },
        setDisplayFilter: (filter: string) => {
          dispatch({ type: 'SET_DISPLAY_FILTER', filter });
        },
        toggleWatchlist: (fieldName: string) => {
          dispatch({ type: 'TOGGLE_WATCHLIST', fieldName });
        },
        saveSnapshot: (frame: GeneratedFrame) => {
          dispatch({ type: 'SAVE_SNAPSHOT', frame });
        },
        deleteSnapshot: (frameNumber: number) => {
          dispatch({ type: 'DELETE_SNAPSHOT', frameNumber });
        },
        setDiffFrame: (index: 0 | 1, frame: GeneratedFrame | null) => {
          dispatch({ type: 'SET_DIFF_FRAME', index, frame });
        },
        setTelemetryLayout: (profileId: string, layout: string[]) => {
          dispatch({ type: 'SET_TELEMETRY_LAYOUT', profileId, layout });
        },
        setSignalIntegrity,
        setTriggers,
        addWidget,
        removeWidget,
        updateLayout,
        setResponderRules: (rules: ResponderRule[]) => {
          backendWsRef.current?.send(JSON.stringify({ type: 'UPDATE_RULES', rules }));
          dispatch({ type: 'SET_RESPONDER_RULES', rules });
        }
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
}
