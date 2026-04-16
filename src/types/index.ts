// ─────────────────────────────────────────────
// UART SİMÜLATÖR — TÜM TİP TANIMLARI
// ─────────────────────────────────────────────

export type FieldType =
  | 'fixed'
  | 'range'
  | 'ramp'
  | 'waveform'
  | 'checksum'
  | 'flags'
  | 'computed'
  | 'script';

export type Endianness = 'big' | 'little';

export type Parity = 'None' | 'Even' | 'Odd' | 'Mark' | 'Space';
export type StopBits = 1 | 1.5 | 2;

// ── Fixed Field ──────────────────────────────
export interface FixedConfig {
  value: number; // 0-255 (per byte)
}

// ── Range Field ──────────────────────────────
export type Distribution = 'uniform' | 'gaussian';

export interface RangeConfig {
  min: number;
  max: number;
  distribution: Distribution;
  mean?: number;
  stddev?: number;
}

// ── Ramp Field ───────────────────────────────
export type EasingCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface RampConfig {
  from: number;
  to: number;
  durationMs: number;
  curve: EasingCurve;
}

// ── Waveform Field ───────────────────────────
export type WaveformShape = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'custom' | 'ecg';

export interface WaveformConfig {
  shape: WaveformShape;
  frequency: number;  // Hz
  amplitude: number;
  offset: number;
  noiseLevel: number;
  customPoints?: number[];
}

// ── Checksum Field ───────────────────────────
export type ChecksumAlgorithm =
  | 'xor'
  | 'sum_mod256'
  | 'crc8'
  | 'crc16_ccitt'
  | 'crc16_modbus'
  | 'crc32'
  | 'custom';

export interface ChecksumScope {
  startFieldId: string;
  endFieldId: string;
}

export interface ChecksumConfig {
  algorithm: ChecksumAlgorithm;
  scope: ChecksumScope;
  initialValue?: number;
  polynomial?: number;
  xorOut?: number;
  reflectIn?: boolean;
  reflectOut?: boolean;
}

// ── Flags Field ──────────────────────────────
export type BitBehavior = 'fixed' | 'manual' | 'random' | 'timed';

export interface RandomBitConfig {
  probability: number;
  minDurationMs: number;
  maxDurationMs: number;
}

export interface TimedBitConfig {
  activateAtMs: number;
  deactivateAtMs: number;
}

export interface FlagBit {
  index: number;
  name: string;
  defaultValue: 0 | 1;
  behavior: BitBehavior;
  behaviorConfig: RandomBitConfig | TimedBitConfig | Record<string, never>;
}

export interface FlagsConfig {
  bits: FlagBit[];
}

// ── Computed Field ───────────────────────────
export interface ComputedConfig {
  expression: string;
  clampMin: number;
  clampMax: number;
}

// ── Script Field ─────────────────────────────
export interface ScriptConfig {
  code: string;
}

// ── Union type config ────────────────────────
export type FieldTypeConfig =
  | FixedConfig
  | RangeConfig
  | RampConfig
  | WaveformConfig
  | ChecksumConfig
  | FlagsConfig
  | ComputedConfig
  | ScriptConfig;

// ── Field ────────────────────────────────────
export interface Field {
  id: string;
  name: string;
  order: number;
  byteWidth: number;
  endianness: Endianness;
  type: FieldType;
  typeConfig: FieldTypeConfig;
}

// ── Frame Profile ────────────────────────────
export interface FrameProfile {
  id: string;
  name: string;
  description: string;
  baudRate: number;
  dataBits: number;
  parity: Parity;
  stopBits: StopBits;
  sendIntervalMs: number;
  fields: Field[];
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────
// SENARYO ENGINE TİPLERİ
// ─────────────────────────────────────────────

export type ScenarioTarget =
  | `field:${string}`
  | `bit:${string}.${string}`
  | 'output:baudRate';

export type ActionType =
  | 'set'
  | 'range'
  | 'ramp'
  | 'toggle'
  | 'pulse'
  | 'inject_error';

export type ErrorType =
  | 'corrupt_checksum'
  | 'skip_bytes'
  | 'wrong_sync'
  | 'extra_bytes'
  | 'delay_frame';

export interface SetActionConfig {
  value: number;
}

export interface RangeActionConfig {
  min: number;
  max: number;
}

export interface RampActionConfig {
  from?: number;
  to: number;
  durationMs: number;
  curve: EasingCurve;
}

export interface PulseActionConfig {
  value: number;
  durationMs: number;
}

export interface InjectErrorConfig {
  errorType: ErrorType;
  count: number;
  corruptByteMask?: number;
}

export type ActionConfig =
  | SetActionConfig
  | RangeActionConfig
  | RampActionConfig
  | PulseActionConfig
  | InjectErrorConfig
  | Record<string, never>;

// ── Conditional Step ─────────────────────────
export type ConditionType = 'field_value' | 'elapsed_time' | 'random';
export type ConditionOperator = '<' | '>' | '==' | '!=';

export interface StepCondition {
  type: ConditionType;
  field?: string;
  operator?: ConditionOperator;
  value?: number;
}

// ── Scenario Step ────────────────────────────
export interface ScenarioStep {
  id: string;
  atMs: number;
  target: string;
  action: ActionType;
  actionConfig: ActionConfig;
  description?: string;
  condition?: StepCondition;
}

// ── Scenario ─────────────────────────────────
export interface Scenario {
  id: string;
  name: string;
  description: string;
  profileId: string;
  loop: boolean;
  durationMs?: number;
  steps: ScenarioStep[];
  category?: ScenarioCategory;
  createdAt: string;
  updatedAt: string;
}

export type ScenarioCategory =
  | 'physiological'
  | 'error'
  | 'stress'
  | 'protocol'
  | 'combined'
  | 'custom';

// ─────────────────────────────────────────────
// RESPONDER & CONVERSATION TİPLERİ
// ─────────────────────────────────────────────

export interface ResponderAction {
  type: 'send_raw' | 'set_field' | 'inject_error';
  payload: string;
  delayMs?: number;
}

export interface ResponderRule {
  id: string;
  name: string;
  enabled: boolean;
  pattern: string; // Hex or ASCII
  patternType: 'hex' | 'ascii';
  actions: ResponderAction[];
  cooldownMs?: number;
}

export interface ConversationEntry {
  id: string;
  timestamp: number;
  type: 'rx' | 'tx' | 'match' | 'error';
  rawHex: string;
  details?: string;
  linkedId?: string; // Links RX to the TX response or vice-versa
  latencyMs?: number;
  status?: 'success' | 'fail' | 'warning';
}

export interface Exchange {
  id: string;
  startTime: number;
  tx?: ConversationEntry;
  rx?: ConversationEntry;
  match?: ConversationEntry;
  latencyMs?: number;
  isLoopbackMatch?: boolean;
}

// ─────────────────────────────────────────────
// SİMÜLASYON RUNTIME TİPLERİ
// ─────────────────────────────────────────────

export type SimulationStatus = 'stopped' | 'running' | 'paused';
export type OutputMode = 'serial' | 'tcp' | 'log';

export interface ParsedField {
  name: string;
  hex: string;
  decimal: number;
  flags?: Record<string, number>;
}

export interface GeneratedFrame {
  frameNumber: number;
  timestampMs: number;
  rawHex: string;
  rawBytes: number[];
  fields: ParsedField[];
  activeScenarioStep?: string;
  errors: string[];
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
  logEntries: Array<{ time: string; text: string; type: 'info' | 'tx' | 'rx' | 'error' }>;
  // Runtime field value overrides
  fieldOverrides: Record<string, number>;
  // Runtime bit overrides
  bitOverrides: Record<string, number>;
  // Active ramps: fieldId -> {from, to, startMs, durationMs, curve}
  activeRamps: Record<string, ActiveRamp>;
  // Active pulses: fieldId -> {originalValue, revertAtMs}
  activePulses: Record<string, ActivePulse>;
  // Error injection queue
  pendingErrors: ErrorType[];
  // Conversation History
  conversationLogs: ConversationEntry[];
  // Grouped exchanges for the comparison view
  exchanges: Exchange[];
  // Professional Analyzer State
  selectedExchangeId: string | null;
  analyzerMode: boolean;
  displayFilter: string;
  // Professional Suite
  watchlist: string[]; // Field IDs or Names
  snapshots: GeneratedFrame[];
  // Available Serial Ports (added for backend bridge)
  availablePorts?: Array<{ path: string }>;
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

// ── Output Configuration ─────────────────────
export interface SerialConfig {
  portName: string;
  baudRate: number;
  dataBits: number;
  parity: Parity;
  stopBits: StopBits;
}

export interface TcpConfig {
  host: string;
  port: number;
}

export interface OutputConfig {
  mode: OutputMode;
  serial?: SerialConfig;
  tcp?: TcpConfig;
}

// ── Sensor Template ──────────────────────────
export interface SensorTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  profile: Omit<FrameProfile, 'id' | 'createdAt' | 'updatedAt'>;
  scenarios: Array<Omit<Scenario, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>>;
}

// ── Log Entry ────────────────────────────────
export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  data?: unknown;
}
