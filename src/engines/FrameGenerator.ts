import type {
  FrameProfile,
  Field,
  FixedConfig,
  RangeConfig,
  WaveformConfig,
  ChecksumConfig,
  FlagsConfig,
  ComputedConfig,
  GeneratedFrame,
  ParsedField,
  SimulationState,
  ErrorType,
} from '../types';
import { calculateChecksum } from './ChecksumCalculator';
import { generateWaveformSample, interpolateRamp } from './WaveformGenerator';
import { evaluateExpression } from './ExpressionEvaluator';

// ─────────────────────────────────────────────
// FRAME ÜRETICISI
// ─────────────────────────────────────────────

function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

function clampValue(value: number, width: number): number {
  const max = Math.pow(256, width) - 1;
  return Math.max(0, Math.min(max, Math.round(value)));
}

function numberToBytes(value: number, width: number, endianness: 'big' | 'little'): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < width; i++) {
    bytes.push((value >> (i * 8)) & 0xff);
  }
  if (endianness === 'big') bytes.reverse();
  return bytes;
}

function getFieldValue(
  field: Field,
  state: SimulationState,
  elapsedMs: number,
  namedValues: Record<string, number>,
): number {
  const { id, type, typeConfig, byteWidth } = field;
  const maxVal = Math.pow(256, byteWidth) - 1;

  // Check for active ramp
  if (state.activeRamps[id]) {
    const ramp = state.activeRamps[id];
    const progress = Math.min(1, (elapsedMs - ramp.startMs) / ramp.durationMs);
    return Math.round(interpolateRamp(ramp.from, ramp.to, progress, ramp.curve));
  }

  // Check for field override
  if (state.fieldOverrides[id] !== undefined) {
    return state.fieldOverrides[id];
  }

  switch (type) {
    case 'fixed': {
      const cfg = typeConfig as FixedConfig;
      return cfg.value & maxVal;
    }
    case 'range': {
      const cfg = typeConfig as RangeConfig;
      if (cfg.distribution === 'gaussian') {
        const mean = cfg.mean ?? (cfg.min + cfg.max) / 2;
        const stddev = cfg.stddev ?? (cfg.max - cfg.min) / 6;
        return clampValue(gaussianRandom(mean, stddev), byteWidth);
      }
      return clampValue(cfg.min + Math.random() * (cfg.max - cfg.min), byteWidth);
    }
    case 'ramp': {
      return 0;
    }
    case 'waveform': {
      const cfg = typeConfig as WaveformConfig;
      return clampValue(generateWaveformSample(cfg, elapsedMs), byteWidth);
    }
    case 'checksum':
      return 0; // Computed separately
    case 'flags': {
      const cfg = typeConfig as FlagsConfig;
      let value = 0;
      for (const bit of cfg.bits) {
        const bitKey = `${id}.${bit.name}`;
        if (state.bitOverrides[bitKey] !== undefined) {
          if (state.bitOverrides[bitKey]) value |= (1 << bit.index);
          continue;
        }
        let active = bit.defaultValue === 1;
        if (bit.behavior === 'timed') {
          const tcfg = bit.behaviorConfig as { activateAtMs: number; deactivateAtMs: number };
          active = elapsedMs >= tcfg.activateAtMs && elapsedMs < tcfg.deactivateAtMs;
        } else if (bit.behavior === 'random') {
          const rcfg = bit.behaviorConfig as { probability: number };
          active = Math.random() < rcfg.probability;
        }
        if (active) value |= (1 << bit.index);
      }
      return value & maxVal;
    }
    case 'computed': {
      const cfg = typeConfig as ComputedConfig;
      return evaluateExpression(cfg.expression, namedValues, cfg.clampMin, cfg.clampMax);
    }
    default:
      return 0;
  }
}

export function generateFrame(
  profile: FrameProfile,
  state: SimulationState,
  frameNumber: number,
): GeneratedFrame {
  const elapsedMs = state.elapsedMs;
  const errors: string[] = [];

  const sortedFields = [...profile.fields].sort((a, b) => a.order - b.order);
  const namedValues: Record<string, number> = {};
  const fieldBytes: Record<string, number[]> = {};

  // Pass 1: non-checksum, non-computed
  for (const field of sortedFields) {
    if (field.type === 'checksum' || field.type === 'computed') continue;
    const value = getFieldValue(field, state, elapsedMs, namedValues);
    namedValues[field.name] = value;
    fieldBytes[field.id] = numberToBytes(value, field.byteWidth, field.endianness);
  }

  // Pass 2: computed fields
  for (const field of sortedFields) {
    if (field.type !== 'computed') continue;
    const value = getFieldValue(field, state, elapsedMs, namedValues);
    namedValues[field.name] = value;
    fieldBytes[field.id] = numberToBytes(value, field.byteWidth, field.endianness);
  }

  // Pass 3: checksum fields
  for (const field of sortedFields) {
    if (field.type !== 'checksum') continue;
    const csFieldCfg = field.typeConfig as ChecksumConfig;

    const scopeBytes: number[] = [];
    let inScope = false;
    for (const f of sortedFields) {
      if (f.type === 'checksum') continue;
      if (f.id === csFieldCfg.scope.startFieldId) inScope = true;
      if (inScope) scopeBytes.push(...(fieldBytes[f.id] ?? []));
      if (f.id === csFieldCfg.scope.endFieldId) break;
    }

    const checksumBytes = calculateChecksum(scopeBytes, {
      algorithm: csFieldCfg.algorithm,
      initialValue: csFieldCfg.initialValue,
      polynomial: csFieldCfg.polynomial,
      xorOut: csFieldCfg.xorOut,
      reflectIn: csFieldCfg.reflectIn,
      reflectOut: csFieldCfg.reflectOut,
    });

    namedValues[field.name] = checksumBytes[0] ?? 0;
    fieldBytes[field.id] = checksumBytes.slice(0, field.byteWidth);
  }

  // Build output
  const allBytes: number[] = [];
  const parsedFields: ParsedField[] = [];

  for (const field of sortedFields) {
    const bytes = fieldBytes[field.id] ?? Array(field.byteWidth).fill(0);
    allBytes.push(...bytes);

    const decimalValue = bytes.length === 1
      ? bytes[0]
      : bytes.reduce((acc, b, i) => acc | (b << (i * 8)), 0);
    const hexStr = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

    const parsed: ParsedField = { name: field.name, hex: hexStr, decimal: decimalValue };

    if (field.type === 'flags') {
      const cfg = field.typeConfig as FlagsConfig;
      parsed.flags = {};
      for (const bit of cfg.bits) {
        parsed.flags[bit.name] = (decimalValue >> bit.index) & 1;
      }
    }

    parsedFields.push(parsed);
  }

  // Apply error injection
  let finalBytes = [...allBytes];
  const pendingError = state.pendingErrors[0];
  if (pendingError) {
    const result = applyError(finalBytes, pendingError);
    finalBytes = result.bytes;
    if (result.error) errors.push(result.error);
  }

  const rawHex = finalBytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

  return {
    frameNumber,
    timestampMs: elapsedMs,
    rawHex,
    rawBytes: finalBytes,
    fields: parsedFields,
    errors,
  };
}

interface ErrorResult {
  bytes: number[];
  error: string | null;
}

function applyError(bytes: number[], errorType: ErrorType): ErrorResult {
  const result = [...bytes];

  switch (errorType) {
    case 'corrupt_checksum':
      if (result.length > 0) result[result.length - 1] ^= 0xff;
      return { bytes: result, error: 'CHECKSUM HATASI: Checksum bozuldu' };
    case 'skip_bytes':
      return {
        bytes: result.slice(0, Math.max(1, result.length - 2)),
        error: 'PROTOKOL HATASI: Eksik byte',
      };
    case 'wrong_sync':
      if (result.length > 0) result[0] = (result[0] ^ 0xff) & 0xff;
      return { bytes: result, error: 'PROTOKOL HATASI: Yanlış sync byte' };
    case 'extra_bytes':
      return {
        bytes: [...result, 0xde, 0xad, 0xbe, 0xef],
        error: 'PROTOKOL HATASI: Ekstra çöp byte',
      };
    case 'delay_frame':
      return { bytes: result, error: 'ZAMANLAMA HATASI: Frame gecikmesi' };
    default:
      return { bytes: result, error: null };
  }
}
