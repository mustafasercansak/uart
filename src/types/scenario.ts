import type { EasingCurve } from './field';

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

export type ConditionType = 'field_value' | 'elapsed_time' | 'random';
export type ConditionOperator = '<' | '>' | '==' | '!=';

export interface StepCondition {
  type: ConditionType;
  field?: string;
  operator?: ConditionOperator;
  value?: number;
}

export interface ScenarioStep {
  id: string;
  atMs: number;
  target: string;
  action: ActionType;
  actionConfig: ActionConfig;
  description?: string;
  condition?: StepCondition;
}

export type ScenarioCategory =
  | 'physiological'
  | 'error'
  | 'stress'
  | 'protocol'
  | 'combined'
  | 'custom';

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
