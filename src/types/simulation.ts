import type { ParsedField, EasingCurve, WidgetType } from './field';
import type { ErrorType } from './scenario';
import type { Trigger } from './trigger';
import type { ResponderRule, ConversationEntry, Exchange } from './responder';
import type { ValidationSession } from './validation';

export type SimulationStatus = 'stopped' | 'running' | 'paused';
export type OutputMode = 'serial' | 'tcp' | 'log';

export interface BitTransition {
  t: number;
  v: 0 | 1;
  label?: string;
}

export interface LogicSignal {
  id: string;
  name: string;
  transitions: BitTransition[];
}

export interface GeneratedFrame {
  uId: string;
  frameNumber: number;
  timestampMs: number;
  rawHex: string;
  rawBytes: number[];
  fields: ParsedField[];
  bitStream?: BitTransition[];
  activeScenarioStep?: string;
  errors: string[];
}

export interface SignalIntegrity {
  noiseLevel: number;
  jitterMs: number;
  bitFlipsEnabled: boolean;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  fieldId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
}

export interface RecordingMetadata {
  id: string;
  name: string;
  createdAt: number;
  frameCount: number;
  durationMs: number;
  data?: Array<{ time: number; frame: GeneratedFrame }>;
}

export interface TimingStats {
  averageLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  jitterMs: number;
  interPacketArrivals: number[];
}

export interface ActiveRamp {
  from: number;
  to: number;
  startMs: number;
  durationMs: number;
  curve: EasingCurve;
}

export interface ActivePulse {
  originalValue: number;
  revertAtMs: number;
}

export interface SimulationState {
  status: SimulationStatus;
  profileId: string | null;
  scenarioId: string | null;
  outputMode: OutputMode;
  serialConnected: boolean;
  networkConnected: boolean;
  isRecording: boolean;
  startedAt: number | null;
  elapsedMs: number;
  frameCount: number;
  errorCount: number;
  framesPerSecond: number;
  lastFrame: GeneratedFrame | null;
  lastRxFrame: GeneratedFrame | null;
  recentFrames: GeneratedFrame[];
  waveformHistory: Array<Record<string, number>>;
  logicHistory: LogicSignal[];
  logEntries: Array<{ time: string; text: string; type: 'info' | 'tx' | 'rx' | 'error' }>;
  fieldOverrides: Record<string, number>;
  bitOverrides: Record<string, number>;
  activeRamps: Record<string, ActiveRamp>;
  activePulses: Record<string, ActivePulse>;
  pendingErrors: ErrorType[];
  conversationLogs: ConversationEntry[];
  exchanges: Exchange[];
  selectedExchangeId: string | null;
  analyzerMode: boolean;
  displayFilter: string;
  dashboardLayout?: DashboardLayout;
  triggers: Trigger[];
  signalIntegrity: SignalIntegrity;
  watchlist: string[];
  snapshots: GeneratedFrame[];
  availablePorts?: Array<{ path: string }>;
  timingStats: TimingStats;
  diffFrames: [GeneratedFrame | null, GeneratedFrame | null];
  responderRules: ResponderRule[];
  telemetryLayouts: Record<string, string[]>;
  recordings: RecordingMetadata[];
  playbackIndex?: number;
  playbackTotal?: number;
  validationSession: ValidationSession | null;
}
