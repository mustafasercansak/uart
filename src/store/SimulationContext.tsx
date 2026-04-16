import React, { createContext, useContext, useRef, useCallback, useReducer } from 'react';
import type {
  SimulationState,
  FrameProfile,
  Scenario,
  OutputMode,
  ErrorType,
  GeneratedFrame
} from '../types';
import { generateFrame } from '../engines/FrameGenerator';
import { parseFrame } from '../engines/FrameParser';
import { tickScenarioEngine } from '../engines/ScenarioEngine';

const BACKEND_URL = 'ws://localhost:8080';

// ─────────────────────────────────────────────
// SİMÜLASYON CONTEXT
// ─────────────────────────────────────────────

const MAX_RECENT_FRAMES = 50;
const MAX_LOG_ENTRIES = 100;
const MAX_WAVEFORM_POINTS = 100;

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
  analyzerMode: false,
  displayFilter: '',
};

type SimAction =
  | { type: 'START'; profileId: string; scenarioId: string | null; outputMode: OutputMode }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'TICK'; elapsedMs: number; newState: Partial<SimulationState> }
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
  | { type: 'UPDATE_EXCHANGE'; exchange: any }
  | { type: 'SELECT_EXCHANGE'; exchangeId: string | null }
  | { type: 'SET_ANALYZER_MODE'; enabled: boolean }
  | { type: 'SET_DISPLAY_FILTER'; filter: string }
  | { type: 'INIT_STATE'; newState: Partial<SimulationState> }
  | { type: 'SET_BACKEND_CONNECTED'; connected: boolean };

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
    case 'TICK': {
      const { elapsedMs, newState } = action;
      const mergedFrame = (newState.lastFrame ?? state.lastFrame) as GeneratedFrame | null;
      
      let updatedRecent = state.recentFrames;
      let updatedWaveform = state.waveformHistory;

      if (mergedFrame && newState.lastFrame) {
        updatedRecent = [mergedFrame, ...state.recentFrames].slice(0, MAX_RECENT_FRAMES);

        const point: Record<string, number> = { t: mergedFrame.timestampMs };
        for (const f of mergedFrame.fields) {
          point[f.name] = f.decimal;
        }
        updatedWaveform = [...state.waveformHistory.slice(-(MAX_WAVEFORM_POINTS - 1)), point];
      }

      return {
        ...state,
        ...newState,
        elapsedMs,
        recentFrames: updatedRecent,
        waveformHistory: updatedWaveform,
      };
    }
    case 'BATCH_LOGS': {
      return {
        ...state,
        logEntries: [...state.logEntries.slice(-(MAX_LOG_ENTRIES - action.entries.length)), ...action.entries]
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
      
      if (existingIdx !== -1) {
        updatedExchanges[existingIdx] = action.exchange;
        return { ...state, exchanges: updatedExchanges };
      } else {
        return { 
          ...state, 
          exchanges: [action.exchange, ...state.exchanges].slice(0, 50) 
        };
      }
    case 'TICK':
      return { 
        ...state, 
        elapsedMs: action.elapsedMs,
        status: action.newState.status || state.status,
        selectedProfileId: action.newState.selectedProfileId || state.selectedProfileId,
        ...action.newState
      };
    case 'SELECT_EXCHANGE':
      return { ...state, selectedExchangeId: action.exchangeId };
    case 'SET_ANALYZER_MODE':
      return { ...state, analyzerMode: action.enabled };
    case 'SET_DISPLAY_FILTER':
      return { ...state, displayFilter: action.filter };
    case 'INIT_STATE':
      return { 
        ...state, 
        ...action.newState 
      };
    case 'SET_BACKEND_CONNECTED':
      return { ...state, networkConnected: action.connected };
    default:
      return state;
  }
}

interface SimulationContextType {
  state: SimulationState;
  start: (profile: FrameProfile, scenario: Scenario | null, outputMode: OutputMode) => void;
  stop: () => void;
  pause: () => void;
  resume: (profile: FrameProfile, scenario: Scenario | null) => void;
  overrideField: (fieldId: string, value: number) => void;
  overrideBit: (bitKey: string, value: number) => void;
  injectError: (errorType: ErrorType) => void;
  resetOverrides: () => void;
  connectSerial: (portName: string, baudRate: number) => Promise<void>;
  disconnectSerial: () => Promise<void>;
  setProfile: (profileId: string | null) => void;
  setScenario: (scenarioId: string | null) => void;
  setOutputMode: (outputMode: OutputMode) => void;
  setUiVisible: (visible: boolean) => void;
  exportLogs: () => void;
  setProfiles: (profiles: FrameProfile[]) => void;
  connectNetwork: (url: string) => Promise<void>;
  disconnectNetwork: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  startPlayback: (data: any) => void;
  getPorts: () => void;
  selectExchange: (exchangeId: string | null) => void;
  setAnalyzerMode: (enabled: boolean) => void;
  setDisplayFilter: (filter: string) => void;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

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
  const abortControllerRef = useRef<AbortController | null>(null);
  const logBufferRef = useRef<Array<SimulationState['logEntries'][0]>>([]);
  const profilesRef = useRef<FrameProfile[]>([]);
  const lastLogFlushRef = useRef<number>(0);
  const uiUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUiUpdateRef = useRef<Partial<SimulationState> | null>(null);
  const rxBufferRef = useRef<number[]>([]);
  const fullLogRef = useRef<Array<{ time: string; text: string; type: string }>>([]);
  const uiVisibleRef = useRef(false);
  const conversationBufferRef = useRef<any[]>([]);
  const exchangeBufferRef = useRef<any[]>([]);

  // ── BACKEND CONNECTION ───────────────────────
  React.useEffect(() => {
    const connect = () => {
      const socket = new WebSocket(BACKEND_URL);
      socket.onopen = () => {
        console.log('Connected to backend simulation engine');
        backendWsRef.current = socket;
        dispatch({ type: 'SET_BACKEND_CONNECTED', connected: true });
        dispatch({ type: 'ADD_LOG', entryType: 'info', text: 'Simülasyon motoru bağlandı (Backend)' });
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'INITIAL_STATE') {
          dispatch({ type: 'INIT_STATE', newState: msg.state });
          if (msg.exchanges) {
            msg.exchanges.forEach((ex: any) => dispatch({ type: 'UPDATE_EXCHANGE', exchange: ex }));
          }
        } else if (msg.type === 'TICK') {
          // Process tick for UI
          pendingUiUpdateRef.current = { 
            lastFrame: msg.frame,
            elapsedMs: msg.elapsedMs,
            frameCount: msg.frame.frameNumber,
            status: msg.status,
            selectedProfileId: msg.selectedProfileId,
            exchanges: msg.exchanges || [] 
          };
        } else if (msg.type === 'LOG') {
          logBufferRef.current.push(msg.entry);
          fullLogRef.current.push(msg.entry);
        } else if (msg.type === 'RECORDING_FINISHED') {
          dispatch({ type: 'SET_RECORDING', recording: false });
          const blob = new Blob([JSON.stringify(msg.data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `uart_session_${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.json`;
          a.click();
          dispatch({ type: 'ADD_LOG', entryType: 'info', text: `Kayıt tamamlandı ve indirildi: ${msg.data.length} frame.` });
        } else if (msg.type === 'CONVERSATION') {
          conversationBufferRef.current.push(msg.entry);
        } else if (msg.type === 'EXCHANGE') {
          exchangeBufferRef.current.push(msg.exchange);
        } else if (msg.type === 'RAW_RX_DATA') {
          dispatch({ type: 'ADD_LOG', entryType: 'rx', text: `[RAW RX]: ${msg.hex}` });
        } else if (msg.type === 'SERIAL_STATUS') {
          dispatch({ type: 'SET_SERIAL_CONNECTED', connected: msg.connected });
          if (msg.error) {
            dispatch({ type: 'ADD_LOG', entryType: 'error', text: `Seri Port Hatası: ${msg.error}` });
          }
        } else if (msg.type === 'PORTS_LIST') {
          pendingUiUpdateRef.current = { ...pendingUiUpdateRef.current, availablePorts: msg.ports } as any;
        }
      };
      socket.onclose = () => {
        console.warn('Backend connection lost');
        backendWsRef.current = null;
        dispatch({ type: 'SET_BACKEND_CONNECTED', connected: false });
        setTimeout(connect, 2000); // Auto-reconnect
      };
      socket.onerror = () => {
        socket.close();
      };
    };
    connect();
    return () => backendWsRef.current?.close();
  }, []);

  // ── UI UPDATE LOOP ───────────────────────────
  React.useEffect(() => {
    const timer = setInterval(() => {
       // Flush logs
       if (logBufferRef.current.length > 0 && Date.now() - lastLogFlushRef.current > 200) {
        const entries = [...logBufferRef.current];
        logBufferRef.current = [];
        lastLogFlushRef.current = Date.now();
        dispatch({ type: 'BATCH_LOGS', entries });
      }

      if (pendingUiUpdateRef.current && uiVisibleRef.current) {
        const update = pendingUiUpdateRef.current;
        pendingUiUpdateRef.current = null;
        dispatch({ type: 'TICK', elapsedMs: update.elapsedMs ?? 0, newState: update });
      }

      // Flush conversations
      if (conversationBufferRef.current.length > 0) {
          const convEntries = [...conversationBufferRef.current];
          conversationBufferRef.current = [];
          convEntries.forEach(entry => dispatch({ type: 'ADD_CONVERSATION', entry }));
      }

      // Flush exchanges
      if (exchangeBufferRef.current.length > 0) {
          const exEntries = [...exchangeBufferRef.current];
          exchangeBufferRef.current = [];
          exEntries.forEach(exchange => dispatch({ type: 'UPDATE_EXCHANGE', exchange }));
      }
    }, 33);
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
    // Current backend doesn't handle pendingErrors via sync yet, let's just trigger it locally
    // Actually best to send it to backend
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

          // RX Parsing logic same as serial...
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
        startRecording: () => {
          backendWsRef.current?.send(JSON.stringify({ type: 'BEGIN_RECORD' }));
          dispatch({ type: 'SET_RECORDING', recording: true });
          dispatch({ type: 'ADD_LOG', entryType: 'info', text: 'Kayıt başlatıldı...' });
        },
        stopRecording: () => {
          backendWsRef.current?.send(JSON.stringify({ type: 'END_RECORD' }));
        },
        startPlayback: (data: any) => {
          backendWsRef.current?.send(JSON.stringify({ type: 'START_PLAYBACK', data }));
          dispatch({ type: 'ADD_LOG', entryType: 'info', text: `Kayıt oynatılıyor: ${data.length} frame.` });
        },
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
        }
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulationContext() {
  const context = useContext(SimulationContext);
  if (context === undefined) {
    throw new Error('useSimulationContext must be used within a SimulationProvider');
  }
  return context;
}
