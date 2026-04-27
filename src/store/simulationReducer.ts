import type {
  SimulationState,
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
  WidgetType,
  ConversationEntry,
  Exchange,
  ValidationSession,
  ValidationEvent,
  AutomationSequence,
  AutomationStep
} from '../types';

const MAX_RECENT_FRAMES = 50;
const MAX_LOG_ENTRIES = 100;
const MAX_WAVEFORM_POINTS = 200;
const MAX_LOGIC_TRANSITIONS = 1500;

export const INITIAL_STATE: SimulationState = {
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
  analyzerMode: true,
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
  ],
  validationSession: null,
  sequences: [],
  activeSequenceId: null
};

export type SimAction =
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
  | { type: 'ADD_CONVERSATION'; entry: ConversationEntry }
  | { type: 'UPDATE_EXCHANGE'; exchange: Exchange; lastRxFrame?: GeneratedFrame | null }
  | { type: 'SELECT_EXCHANGE'; exchangeId: string | null }
  | { type: 'SET_ANALYZER_MODE'; enabled: boolean }
  | { type: 'SET_DISPLAY_FILTER'; filter: string }
  | { type: 'TOGGLE_WATCHLIST'; fieldName: string }
  | { type: 'SET_SIGNAL_INTEGRITY'; integrity: Partial<SignalIntegrity> }
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
  | { type: 'BATCH_UPDATE'; updates: Partial<SimulationState> }
  | { type: 'START_VALIDATION'; session: ValidationSession }
  | { type: 'STOP_VALIDATION'; endTime: number; score: number }
  | { type: 'CANCEL_VALIDATION' }
  | { type: 'ADD_VALIDATION_EVENT'; event: ValidationEvent }
  | { type: 'UPDATE_VALIDATION_HISTORY'; entry: { timestamp: number; fields: Record<string, number> } }
  | { type: 'SET_ACTIVE_SEQUENCE'; id: string | null }
  | { type: 'SAVE_SEQUENCE'; sequence: AutomationSequence }
  | { type: 'DELETE_SEQUENCE'; id: string }
  | { type: 'SET_SEQUENCES'; sequences: AutomationSequence[] }
  | { type: 'CLEAR_EXCHANGES' };

export function reducer(state: SimulationState, action: SimAction): SimulationState {
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
        logicHistory: [{ id: 'tx-main', name: 'UART TX', transitions: [] }],
        waveformHistory: [],
        recentFrames: [],
        frameCount: 0,
        elapsedMs: 0
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
      const updatedRecent = (mergedFrame && updates.lastFrame)
        ? [mergedFrame, ...state.recentFrames].slice(0, MAX_RECENT_FRAMES)
        : state.recentFrames;

      const updatedWaveform = (points && points.length > 0)
        ? [...state.waveformHistory, ...points].slice(-MAX_WAVEFORM_POINTS)
        : state.waveformHistory;

      const combinedLogEntries = logEntries.length > 0
        ? [...state.logEntries.slice(-(MAX_LOG_ENTRIES - logEntries.length)), ...logEntries]
        : state.logEntries;

      let newLogicHistory = state.logicHistory;
      if (updates.lastFrame?.bitStream?.length) {
        const hasTxMain = state.logicHistory.some(s => s.id === 'tx-main');
        const base = hasTxMain ? state.logicHistory : [...state.logicHistory, { id: 'tx-main', name: 'UART TX', transitions: [] }];
        newLogicHistory = base.map(sig => {
          if (sig.id !== 'tx-main') return sig;
          const incoming = updates.lastFrame!.bitStream!;
          const current = sig.transitions;
          // Avoid allocation when already at cap and adding would exceed it
          const combined = current.length + incoming.length > MAX_LOGIC_TRANSITIONS
            ? [...current, ...incoming].slice(-MAX_LOGIC_TRANSITIONS)
            : [...current, ...incoming];
          return { ...sig, transitions: combined };
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
    case 'BATCH_LOGS':
      return {
        ...state,
        logEntries: [...state.logEntries, ...action.entries].slice(-MAX_LOG_ENTRIES)
      };
    case 'OVERRIDE_FIELD':
      return { ...state, fieldOverrides: { ...state.fieldOverrides, [action.fieldId]: action.value } };
    case 'OVERRIDE_BIT':
      return { ...state, bitOverrides: { ...state.bitOverrides, [action.bitKey]: action.value } };
    case 'INJECT_ERROR':
      return { ...state, pendingErrors: [...state.pendingErrors, action.errorType] };
    case 'CONSUME_ERROR':
      return { ...state, pendingErrors: state.pendingErrors.slice(1) };
    case 'RESET_OVERRIDES':
      return { ...state, fieldOverrides: {}, bitOverrides: {}, activeRamps: {}, activePulses: {}, pendingErrors: [] };
    case 'SET_SERIAL_CONNECTED':
      return { ...state, serialConnected: action.connected };
    case 'SET_NETWORK_CONNECTED':
      return { ...state, networkConnected: action.connected };
    case 'SET_RECORDING':
      return { ...state, isRecording: action.recording };
    case 'ADD_CONVERSATION':
      return { ...state, conversationLogs: [action.entry, ...state.conversationLogs].slice(0, 100) };
    case 'UPDATE_EXCHANGE': {
      const updatedExchanges = [...state.exchanges];
      const existingIdx = updatedExchanges.findIndex(e => e.id === action.exchange.id);
      const nextExchanges = existingIdx !== -1
        ? (updatedExchanges[existingIdx] = action.exchange, updatedExchanges)
        : [action.exchange, ...state.exchanges].slice(0, 50);
      return { ...state, exchanges: nextExchanges, lastRxFrame: action.lastRxFrame || state.lastRxFrame };
    }
    case 'SELECT_EXCHANGE':
      return { ...state, selectedExchangeId: action.exchangeId };
    case 'SET_ANALYZER_MODE':
      return { ...state, analyzerMode: action.enabled };
    case 'SET_DISPLAY_FILTER':
      return { ...state, displayFilter: action.filter };
    case 'TOGGLE_WATCHLIST': {
      const newWatchlist = state.watchlist.includes(action.fieldName)
        ? state.watchlist.filter(f => f !== action.fieldName)
        : [...state.watchlist, action.fieldName];
      return { ...state, watchlist: newWatchlist };
    }
    case 'SAVE_SNAPSHOT':
      if (state.snapshots.some(s => s.frameNumber === action.frame.frameNumber)) return state;
      return { ...state, snapshots: [...state.snapshots, action.frame] };
    case 'DELETE_SNAPSHOT':
      return { ...state, snapshots: state.snapshots.filter(s => s.frameNumber !== action.frameNumber) };
    case 'SET_SIGNAL_INTEGRITY':
      return { ...state, signalIntegrity: { ...state.signalIntegrity, ...action.integrity } };
    case 'SET_TRIGGERS':
      return { ...state, triggers: action.triggers };
    case 'INIT_STATE':
      return {
        ...state,
        ...action.newState,
        networkConnected: state.networkConnected,
        serialConnected: action.newState.serialConnected !== undefined ? action.newState.serialConnected : state.serialConnected,
        diffFrames: action.newState.diffFrames !== undefined ? action.newState.diffFrames : state.diffFrames,
        responderRules: action.newState.responderRules !== undefined ? action.newState.responderRules : state.responderRules,
        telemetryLayouts: action.newState.telemetryLayouts || state.telemetryLayouts || {},
        dashboardLayout: action.newState.dashboardLayout || state.dashboardLayout || { widgets: [] },
        watchlist: action.newState.watchlist || state.watchlist || [],
        snapshots: action.newState.snapshots || state.snapshots || []
      };
    case 'SET_BACKEND_CONNECTED':
      return { ...state, networkConnected: action.connected };
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'UPDATE_TIMING_STATS':
      return { ...state, timingStats: action.stats };
    case 'SET_DIFF_FRAME': {
      const newDiffFrames = [...state.diffFrames] as [GeneratedFrame | null, GeneratedFrame | null];
      newDiffFrames[action.index] = action.frame;
      return { ...state, diffFrames: newDiffFrames };
    }
    case 'SET_TELEMETRY_LAYOUT': {
      const newLayouts = { ...state.telemetryLayouts, [action.profileId]: action.layout };
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
      return { ...state, dashboardLayout: { ...state.dashboardLayout, widgets: action.widgets } };
    case 'BATCH_UPDATE':
      return { ...state, ...action.updates };
    case 'START_VALIDATION':
      return { ...state, validationSession: action.session };
    case 'STOP_VALIDATION':
      if (!state.validationSession) return state;
      return {
        ...state,
        validationSession: {
          ...state.validationSession,
          endTime: action.endTime,
          status: 'completed',
          complianceScore: action.score
        }
      };
    case 'CANCEL_VALIDATION':
      return { ...state, validationSession: null };
    case 'ADD_VALIDATION_EVENT':
      if (!state.validationSession) return state;
      return {
        ...state,
        validationSession: {
          ...state.validationSession,
          events: [...state.validationSession.events, action.event]
        }
      };
    case 'UPDATE_VALIDATION_HISTORY':
      if (!state.validationSession) return state;
      return {
        ...state,
        validationSession: {
          ...state.validationSession,
          dataHistory: [...state.validationSession.dataHistory, action.entry].slice(-1000)
        }
      };
    case 'SET_ACTIVE_SEQUENCE':
      return { ...state, activeSequenceId: action.id };
    case 'SAVE_SEQUENCE': {
      const idx = state.sequences.findIndex(s => s.id === action.sequence.id);
      const newSequences = idx !== -1
        ? state.sequences.map((s, i) => i === idx ? action.sequence : s)
        : [...state.sequences, action.sequence];
      return { ...state, sequences: newSequences };
    }
    case 'DELETE_SEQUENCE':
      return {
        ...state,
        sequences: state.sequences.filter(s => s.id !== action.id),
        activeSequenceId: state.activeSequenceId === action.id ? null : state.activeSequenceId
      };
    case 'SET_SEQUENCES':
      return { ...state, sequences: action.sequences };
    case 'CLEAR_EXCHANGES':
      return { ...state, exchanges: [], selectedExchangeId: null };
    default:
      return state;
  }
}
