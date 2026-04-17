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

export type ProtocolType = 'UART' | 'SPI' | 'I2C' | 'CAN';
export type WidgetType = 'chart' | 'gauge' | 'led' | '7segment';

// ── Virtual Peripherals ──────────────────────
export interface PeripheralState {
  id: string;
  name: string;
  protocol: ProtocolType;
  address?: number; // For I2C
  isEnabled: boolean;
  internalState: Record<string, any>;
}

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
  widgetConfig?: WidgetConfig;
}


export interface WidgetConfig {
  type: WidgetType;
  min?: number;
  max?: number;
  unit?: string;
  color?: string;
}

export type FramingMode = 'fixed' | 'delimiter' | 'slip' | 'cobs' | 'modbus';

export interface FramingConfig {
  mode: FramingMode;
  delimiter?: number; // e.g. 0x0A (\n)
  header?: number[];  // e.g. [0x55, 0xAA]
  footer?: number[];
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
  framing: FramingConfig; // New: Framing logic
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

// ─────────────────────────────────────────────
// TETIKLEYICI (TRIGGER) TİPLERİ
// ─────────────────────────────────────────────

export type TriggerAction = 
  | 'stop_simulation' 
  | 'start_recording' 
  | 'log_warning' 
  | 'inject_error' 
  | 'set_field';

export interface Trigger {
  id: string;
  name: string;
  enabled: boolean;
  condition: string; // e.g. "BPM > 100"
  action: TriggerAction;
  actionPayload?: string;
  cooldownMs?: number;
  lastTriggeredAt?: number;
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
  script?: string; // Optional JS script for dynamic response
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

export interface BitTransition {
  t: number; // Elapsed time in ms (can be fractional for us precision)
  v: 0 | 1;  // Bit value
  label?: string; // e.g., 'START', 'D0', 'STOP', 'PARITY'
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
  bitStream?: BitTransition[]; // Level 4: Hardware bit timing
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
  logicHistory: LogicSignal[]; // Level 4: Logic Analyzer History
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
  // Digital Twin & Dashboard Layout
  dashboardLayout?: DashboardLayout;
  // Professional Suite
  triggers: Trigger[];
  signalIntegrity: SignalIntegrity;
  watchlist: string[]; // Field IDs or Names
  snapshots: GeneratedFrame[];
  // Available Serial Ports (added for backend bridge)
  availablePorts?: Array<{ path: string }>;
  // Timing Analytics
  timingStats: TimingStats;
  // Diff Lab
  diffFrames: [GeneratedFrame | null, GeneratedFrame | null];
  // Responder Rules
  responderRules: ResponderRule[];
  // Per-profile telemetry widget order
  telemetryLayouts: Record<string, string[]>; // Profile ID -> Field Names in order
  // Record & Playback
  recordings: RecordingMetadata[];
  playbackIndex?: number;
  playbackTotal?: number;
}

export interface SignalIntegrity {
  noiseLevel: number; // 0.0 - 1.0
  jitterMs: number;  // 0 - 50ms
  bitFlipsEnabled: boolean;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  fieldId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, any>;
}

export interface RecordingMetadata {
  id: string;
  name: string;
  createdAt: number;
  frameCount: number;
  durationMs: number;
  data?: any[]; // The actual packets (optional for list views)
}

export interface TimingStats {
  averageLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  jitterMs: number;
  interPacketArrivals: number[]; // Last 50 for histogram
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
export interface SimulationContextType {
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
  saveRecording: (name: string, data: any[]) => void;
  deleteRecording: (id: string) => void;
  refreshRecordings: () => void;
  startPlayback: (data: any) => void;
  getPorts: () => void;
  selectExchange: (exchangeId: string | null) => void;
  setAnalyzerMode: (enabled: boolean) => void;
  setDisplayFilter: (filter: string) => void;
  toggleWatchlist: (fieldName: string) => void;
  saveSnapshot: (frame: GeneratedFrame) => void;
  deleteSnapshot: (frameNumber: number) => void;
  setDiffFrame: (index: 0 | 1, frame: GeneratedFrame | null) => void;
  setTelemetryLayout: (profileId: string, layout: string[]) => void;
  setResponderRules: (rules: ResponderRule[]) => void;
  pausePlayback: () => void;
  resumePlayback: () => void;
  seekPlayback: (index: number) => void;
  stepPlayback: (delta: number) => void;
  setSignalIntegrity: (integrity: Partial<SignalIntegrity>) => void;
  setTriggers: (triggers: Trigger[]) => void;
  addWidget: (type: WidgetType, fieldId: string) => void;
  removeWidget: (id: string) => void;
  updateLayout: (widgets: DashboardWidget[]) => void;
}

export interface GridPanel {
  id: string;
  fieldName: string;
  fieldType: string;
  color: string;
  widgetType: WidgetType;
  config?: any;
}
