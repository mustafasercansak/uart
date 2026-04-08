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
import { tickScenarioEngine } from '../engines/ScenarioEngine';

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
  startedAt: null,
  elapsedMs: 0,
  frameCount: 0,
  errorCount: 0,
  framesPerSecond: 0,
  lastFrame: null,
  recentFrames: [],
  waveformHistory: [],
  logEntries: [],
  fieldOverrides: {},
  bitOverrides: {},
  activeRamps: {},
  activePulses: {},
  pendingErrors: [],
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
  | { type: 'ADD_LOG'; entryType: 'info' | 'tx' | 'rx' | 'error'; text: string }
  | { type: 'BATCH_LOGS'; entries: Array<SimulationState['logEntries'][0]> };

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
  connectSerial: (baudRate: number) => Promise<void>;
  disconnectSerial: () => Promise<void>;
  setProfile: (profileId: string | null) => void;
  setScenario: (scenarioId: string | null) => void;
  setOutputMode: (outputMode: OutputMode) => void;
  setUiVisible: (visible: boolean) => void;
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const logBufferRef = useRef<Array<SimulationState['logEntries'][0]>>([]);
  const lastLogFlushRef = useRef<number>(0);
  const uiUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUiUpdateRef = useRef<Partial<SimulationState> | null>(null);
  const uiVisibleRef = useRef(false);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
    if (uiUpdateIntervalRef.current) clearInterval(uiUpdateIntervalRef.current);
    intervalRef.current = null;
    uiUpdateIntervalRef.current = null;
    dispatch({ type: 'STOP' });
  }, []);

  const pause = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (uiUpdateIntervalRef.current) clearInterval(uiUpdateIntervalRef.current);
    intervalRef.current = null;
    uiUpdateIntervalRef.current = null;
    dispatch({ type: 'PAUSE' });
  }, []);

  const start = useCallback(
    (profile: FrameProfile, scenario: Scenario | null, outputMode: OutputMode) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (uiUpdateIntervalRef.current) clearInterval(uiUpdateIntervalRef.current);
      frameCountRef.current = 0;
      fpsCounterRef.current = 0;

      dispatch({
        type: 'START',
        profileId: profile.id,
        scenarioId: scenario?.id ?? null,
        outputMode,
      });

      const startTime = Date.now();

      // FPS counter (internal state only)
      fpsTimerRef.current = setInterval(() => {
        const fps = fpsCounterRef.current;
        fpsCounterRef.current = 0;
        stateRef.current = { ...stateRef.current, framesPerSecond: fps };
      }, 1000);

      // UI Update throttling loop (30 FPS)
      uiUpdateIntervalRef.current = setInterval(() => {
        // Flush log buffer every 200ms
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
      }, 33);

      intervalRef.current = setInterval(() => {
        const currentState = stateRef.current;
        if (currentState.status !== 'running') return;

        const elapsedMs = Date.now() - startTime;
        frameCountRef.current++;
        fpsCounterRef.current++;

        // Process scenario steps
        let scenarioUpdates: Partial<SimulationState> = {};
        if (scenario) {
          const result = tickScenarioEngine(scenario, profile, { ...currentState, elapsedMs });
          scenarioUpdates = result.updates;
        }

        // Generate frame
        const updatedState: SimulationState = {
          ...currentState,
          ...scenarioUpdates,
          elapsedMs,
          frameCount: frameCountRef.current,
        };

        const frame = generateFrame(profile, updatedState, frameCountRef.current);
        const hasErrors = frame.errors.length > 0;

        if (currentState.outputMode === 'serial' && writerRef.current) {
          try {
            writerRef.current.write(new Uint8Array(frame.rawBytes));
          } catch (e) {
            console.error('Serial port yazma hatası:', e);
          }
        }

        const finalUpdates: Partial<SimulationState> = {
          ...scenarioUpdates,
          lastFrame: frame,
          frameCount: frameCountRef.current,
          framesPerSecond: stateRef.current.framesPerSecond,
          errorCount: stateRef.current.errorCount + (hasErrors ? 1 : 0),
          pendingErrors: hasErrors && currentState.pendingErrors.length > 0
            ? currentState.pendingErrors.slice(1)
            : currentState.pendingErrors,
        };

        // Buffer logs instead of dispatching
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
        if (hasErrors) {
          frame.errors.forEach(err => logBufferRef.current.push({ time: timeStr, text: err, type: 'error' }));
        }
        if (currentState.outputMode !== 'log') {
          logBufferRef.current.push({ time: timeStr, text: `TX: ${frame.rawHex}`, type: 'tx' });
        }

        stateRef.current = { ...currentState, ...finalUpdates, elapsedMs };
        
        // Don't dispatch immediately, save for throttled UI update
        pendingUiUpdateRef.current = { ...finalUpdates, elapsedMs };
      }, profile.sendIntervalMs);
    },
    [],
  );

  const resume = useCallback(
    (profile: FrameProfile, scenario: Scenario | null) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (uiUpdateIntervalRef.current) clearInterval(uiUpdateIntervalRef.current);
      dispatch({ type: 'RESUME' });

      const pausedAt = stateRef.current.elapsedMs;
      const resumeStart = Date.now();

      // UI Update throttling loop (30 FPS)
      uiUpdateIntervalRef.current = setInterval(() => {
        // Flush log buffer
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
      }, 33);

      intervalRef.current = setInterval(() => {
        const currentState = stateRef.current;
        if (currentState.status !== 'running') return;

        const elapsedMs = pausedAt + (Date.now() - resumeStart);
        frameCountRef.current++;
        fpsCounterRef.current++;

        let scenarioUpdates: Partial<SimulationState> = {};
        if (scenario) {
          const result = tickScenarioEngine(scenario, profile, { ...currentState, elapsedMs });
          scenarioUpdates = result.updates;
        }

        const updatedState: SimulationState = { ...currentState, ...scenarioUpdates, elapsedMs };
        const frame = generateFrame(profile, updatedState, frameCountRef.current);
        const hasErrors = frame.errors.length > 0;

        if (currentState.outputMode === 'serial' && writerRef.current) {
          try {
            writerRef.current.write(new Uint8Array(frame.rawBytes));
          } catch (e) {
            console.error('Serial port yazma hatası:', e);
          }
        }

        const finalUpdates: Partial<SimulationState> = {
          ...scenarioUpdates,
          lastFrame: frame,
          frameCount: frameCountRef.current,
          framesPerSecond: stateRef.current.framesPerSecond,
          errorCount: stateRef.current.errorCount + (hasErrors ? 1 : 0),
          pendingErrors: hasErrors && currentState.pendingErrors.length > 0
            ? currentState.pendingErrors.slice(1)
            : currentState.pendingErrors,
        };

        // Buffer logs
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
        if (hasErrors) {
          frame.errors.forEach(err => logBufferRef.current.push({ time: timeStr, text: err, type: 'error' }));
        }
        if (currentState.outputMode !== 'log') {
          logBufferRef.current.push({ time: timeStr, text: `TX: ${frame.rawHex}`, type: 'tx' });
        }

        stateRef.current = { ...currentState, ...finalUpdates, elapsedMs };
        
        // Don't dispatch immediately, save for throttled UI update
        pendingUiUpdateRef.current = { ...finalUpdates, elapsedMs };
      }, profile.sendIntervalMs);
    },
    [],
  );

  const overrideField = useCallback((fieldId: string, value: number) => {
    dispatch({ type: 'OVERRIDE_FIELD', fieldId, value });
  }, []);

  const overrideBit = useCallback((bitKey: string, value: number) => {
    dispatch({ type: 'OVERRIDE_BIT', bitKey, value });
  }, []);

  const injectError = useCallback((errorType: ErrorType) => {
    dispatch({ type: 'INJECT_ERROR', errorType });
  }, []);

  const resetOverrides = useCallback(() => {
    dispatch({ type: 'RESET_OVERRIDES' });
  }, []);

  const connectSerial = useCallback(async (baudRate: number) => {
    try {
      const nav: any = navigator;
      if (!nav.serial) {
        alert('Tarayıcınız Web Serial API desteklemiyor (Chrome/Edge kullanın).');
        return;
      }
      const port = await nav.serial.requestPort();
      await port.open({ baudRate });
      
      const writer = port.writable.getWriter();
      portRef.current = port;
      writerRef.current = writer;
      dispatch({ type: 'SET_SERIAL_CONNECTED', connected: true });
      dispatch({ type: 'ADD_LOG', entryType: 'info', text: `Seri port bağlandı (${baudRate} baud)` });

      // Start reader loop
      abortControllerRef.current = new AbortController();
      (async () => {
        while (port.readable && !abortControllerRef.current?.signal.aborted) {
          try {
            const reader = port.readable.getReader();
            readerRef.current = reader;
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                  const hex = (value as Uint8Array).reduce((acc, b) => acc + b.toString(16).padStart(2, '0').toUpperCase() + ' ', '').trim();
                  const timeStr = new Date().toLocaleTimeString('tr-TR', { hour12: false }) + '.' + new Date().getMilliseconds().toString().padStart(3, '0');
                  logBufferRef.current.push({ time: timeStr, text: `RX: ${hex}`, type: 'rx' });
                }
              }
            } catch (err) {
              console.error('Serial read error:', err);
            } finally {
              reader.releaseLock();
              readerRef.current = null;
            }
          } catch (err) {
            console.error('Reader creation error:', err);
            break;
          }
        }
      })();

    } catch (err: any) {
      console.error('Serial port bağlantı hatası:', err);
      dispatch({ type: 'ADD_LOG', entryType: 'error', text: `Bağlantı hatası: ${err.message}` });
    }
  }, []);

  const disconnectSerial = useCallback(async () => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (writerRef.current) {
        await writerRef.current.releaseLock();
        writerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
      dispatch({ type: 'ADD_LOG', entryType: 'info', text: 'Seri port bağlantısı kesildi' });
    } catch (err) {
      console.error('Port kapatma hatası:', err);
    } finally {
      dispatch({ type: 'SET_SERIAL_CONNECTED', connected: false });
    }
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
