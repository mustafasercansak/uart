export type FieldType =
  | 'fixed'
  | 'range'
  | 'ramp'
  | 'waveform'
  | 'checksum'
  | 'flags'
  | 'computed'
  | 'script';

export interface ParsedField {
  name: string;
  hex: string;
  decimal: number;
  byteWidth: number;
  flags?: Record<string, number>;
}

export type WidgetType = 'chart' | 'gauge' | 'led' | '7segment' | 'sparkline' | 'bar';
export type Endianness = 'big' | 'little';

export interface FixedConfig {
  value: number;
}

export type Distribution = 'uniform' | 'gaussian';

export interface RangeConfig {
  min: number;
  max: number;
  distribution: Distribution;
  mean?: number;
  stddev?: number;
}

export type EasingCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface RampConfig {
  from: number;
  to: number;
  durationMs: number;
  curve: EasingCurve;
}

export type WaveformShape =
  | 'sine'
  | 'triangle'
  | 'sawtooth'
  | 'square'
  | 'custom'
  | 'ecg'
  | 'resp_pressure'
  | 'resp_flow';

export interface WaveformConfig {
  shape: WaveformShape;
  frequency: number;
  amplitude: number;
  offset: number;
  noiseLevel: number;
  phase?: number;
  customPoints?: number[];
}

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

export interface ComputedConfig {
  expression: string;
  clampMin: number;
  clampMax: number;
}

export interface ScriptConfig {
  code: string;
}

export type FieldTypeConfig =
  | FixedConfig
  | RangeConfig
  | RampConfig
  | WaveformConfig
  | ChecksumConfig
  | FlagsConfig
  | ComputedConfig
  | ScriptConfig;

export interface WidgetConfig {
  type: WidgetType;
  min?: number;
  max?: number;
  unit?: string;
  color?: string;
}

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
