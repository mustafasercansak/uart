import type {
  FrameProfile,
  Field,
  FixedConfig,
  RangeConfig,
  WaveformConfig,
  ChecksumConfig,
  FlagsConfig,
  ComputedConfig,
  ScriptConfig,
  GeneratedFrame,
  ParsedField,
  SimulationState,
  ErrorType,
  BitTransition,
  Parity,
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

function numberToBytes(value: number, width: number, endianness: 'big' | 'little', isAscii?: boolean): number[] {
  if (isAscii) {
    const str = Math.round(value).toString().padStart(width, '0');
    const bytes = Array.from(str).map(c => c.charCodeAt(0));
    return bytes.slice(0, width);
  }

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
      const cfg = { ...typeConfig as WaveformConfig };

      // Custom Waveform Injection
      if (state.customWaveform && state.customWaveform.length > 0) {
        const samples = state.customWaveform;
        // Map time to sample index based on frequency (Hz)
        const periodMs = 1000 / (cfg.frequency || 1);
        const progress = (elapsedMs % periodMs) / periodMs;
        const index = Math.floor(progress * samples.length);
        return clampValue(samples[index], byteWidth);
      }

      // Explicit frequencySource: any field can drive this waveform's frequency
      if (cfg.frequencySource) {
        const srcVal = namedValues[cfg.frequencySource] ?? 0;
        if (srcVal > 0) cfg.frequency = srcVal / 60;
      } else {
        // Legacy medical auto-sync (backward-compat when frequencySource is not set)
        if (cfg.shape === 'ecg') {
          const bpm = namedValues['BPM'] || namedValues['HR'] || 0;
          if (bpm > 0) cfg.frequency = bpm / 60;
        }
        if (cfg.shape === 'resp_pressure' || cfg.shape === 'resp_flow') {
          const rr = namedValues['RR'] || namedValues['Respiration'] || 0;
          if (rr > 0) cfg.frequency = rr / 60;
        }
      }

      return clampValue(generateWaveformSample(cfg, elapsedMs), byteWidth);
    }
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
    case 'script': {
      const cfg = typeConfig as ScriptConfig;
      try {
        // Scripts have access to:
        // t: elapsed time in ms
        // i: frame count
        // f: previous field values
        const fn = new Function('t', 'i', 'f', `
          try {
            ${cfg.code}
          } catch(e) {
            return 0;
          }
        `);
        const result = fn(elapsedMs, state.frameCount, namedValues);
        return clampValue(Number(result) || 0, byteWidth);
      } catch (_e) {
        return 0;
      }
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
    fieldBytes[field.id] = numberToBytes(value, field.byteWidth, field.endianness, field.isAscii);
  }

  // Pass 2: computed fields
  for (const field of sortedFields) {
    if (field.type !== 'computed') continue;
    const value = getFieldValue(field, state, elapsedMs, namedValues);
    namedValues[field.name] = value;
    fieldBytes[field.id] = numberToBytes(value, field.byteWidth, field.endianness, field.isAscii);
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
      : field.endianness === 'little'
        ? bytes.reduce((acc, b, _i) => acc | (b << (_i * 8)), 0)
        : bytes.reduce((acc, b) => (acc << 8) | b, 0);

    const hexStr = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

    const parsed: ParsedField = { name: field.name, hex: hexStr, decimal: decimalValue, byteWidth: field.byteWidth };

    if (field.type === 'flags') {
      const cfg = field.typeConfig as FlagsConfig;
      parsed.flags = {};
      for (const bit of cfg.bits) {
        parsed.flags[bit.name] = (decimalValue >> bit.index) & 1;
      }
    }

    parsedFields.push(parsed);
  }

  // Apply signal integrity noise (random bit flips)
  let finalBytes = [...allBytes];

  if (state.signalIntegrity?.bitFlipsEnabled && state.signalIntegrity?.noiseLevel > 0) {
    finalBytes = applySignalNoise(finalBytes, state.signalIntegrity.noiseLevel);
  }

  // Apply error injection (one-shot logic errors)
  const pendingError = state.pendingErrors[0];
  if (pendingError) {
    const result = applyError(finalBytes, pendingError);
    finalBytes = result.bytes;
    if (result.error) errors.push(result.error);
  }

  // Apply framing protocol wrappers (Level 1: Smart Protocol Decoders)
  finalBytes = applyFraming(finalBytes, profile.framing);

  // Level 4: Generate Logic Bitstream
  const bitStream = bytesToBitstream(finalBytes, profile, elapsedMs);

  const rawHex = finalBytes.map((b: number) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

  return {
    uId: `generated-${elapsedMs}-${Math.random()}`,
    frameNumber,
    timestampMs: elapsedMs,
    rawHex,
    rawBytes: finalBytes,
    fields: parsedFields,
    bitStream,
    errors,
  };
}

/**
 * Level 4: UART Bitstream Generator
 * Converts byte array to a sequence of bits with timing
 */
function bytesToBitstream(bytes: number[], profile: FrameProfile, startT: number): BitTransition[] {
  const baudRate = profile.baudRate || 9600;
  const bitDurationMs = 1000 / baudRate;
  const transitions: BitTransition[] = [];
  let currentT = startT;

  // UART Idle state is High (1)
  transitions.push({ t: currentT, v: 1 });

  for (const byte of bytes) {
    // 1. START BIT (0)
    transitions.push({ t: currentT, v: 0, label: 'START' });
    currentT += bitDurationMs;

    // 2. DATA BITS (LSB First)
    for (let i = 0; i < (profile.dataBits || 8); i++) {
      const bitValue = ((byte >> i) & 1) as 0 | 1;
      // Only record transition if value changed or it's the first bit of the byte
      transitions.push({ t: currentT, v: bitValue, label: `D${i}` });
      currentT += bitDurationMs;
    }

    // 3. PARITY BIT (Optional)
    if (profile.parity && profile.parity !== 'None') {
      const parityBit = calculateParity(byte, profile.parity);
      transitions.push({ t: currentT, v: parityBit as 0 | 1, label: 'PARITY' });
      currentT += bitDurationMs;
    }

    // 4. STOP BIT (1)
    transitions.push({ t: currentT, v: 1, label: 'STOP' });
    currentT += bitDurationMs * (profile.stopBits || 1);
  }

  // Back to IDLE
  transitions.push({ t: currentT, v: 1 });

  return transitions;
}

function calculateParity(byte: number, mode: Parity): number {
  let ones = 0;
  for (let i = 0; i < 8; i++) {
    if ((byte >> i) & 1) ones++;
  }

  if (mode === 'Even') return ones % 2 === 0 ? 0 : 1;
  if (mode === 'Odd') return ones % 2 === 0 ? 1 : 0;
  if (mode === 'Mark') return 1;
  if (mode === 'Space') return 0;
  return 0;
}

/**
 * Level 1: Protocol Framing Wrappers
 */
function applyFraming(bytes: number[], config: { mode?: string; header?: number[]; footer?: number[]; delimiter?: number }): number[] {
  if (!config || !config.mode || config.mode === 'fixed') {
    const header = config?.header || [];
    const footer = config?.footer || [];
    return [...header, ...bytes, ...footer];
  }

  switch (config.mode) {
    case 'slip':
      return encodeSLIP(bytes);
    case 'cobs':
      return encodeCOBS(bytes);
    case 'modbus':
      return encodeModbus(bytes);
    case 'delimiter': {
      const delim = config.delimiter !== undefined ? config.delimiter : 0x0A;
      return [...bytes, delim];
    }
    default:
      return bytes;
  }
}

function encodeSLIP(bytes: number[]): number[] {
  const SLIP_END = 0xC0;
  const SLIP_ESC = 0xDB;
  const SLIP_ESC_END = 0xDC;
  const SLIP_ESC_ESC = 0xDD;

  const result: number[] = [SLIP_END];
  for (const b of bytes) {
    if (b === SLIP_END) {
      result.push(SLIP_ESC, SLIP_ESC_END);
    } else if (b === SLIP_ESC) {
      result.push(SLIP_ESC, SLIP_ESC_ESC);
    } else {
      result.push(b);
    }
  }
  result.push(SLIP_END);
  return result;
}

function encodeCOBS(bytes: number[]): number[] {
  const result: number[] = [];
  let codeIndex = 0;
  let code = 1;

  result.push(0x00); // Placeholder for first code

  for (const b of bytes) {
    if (b === 0) {
      result[codeIndex] = code;
      codeIndex = result.length;
      result.push(0x00);
      code = 1;
    } else {
      result.push(b);
      code++;
      if (code === 0xFF) {
        result[codeIndex] = code;
        codeIndex = result.length;
        result.push(0x00);
        code = 1;
      }
    }
  }
  result[codeIndex] = code;
  result.push(0x00); // Frame end marker
  return result;
}

function encodeModbus(bytes: number[]): number[] {
  // Simple Modbus RTU framing: Data + CRC16
  const crc = calculateCRC16(bytes);
  return [...bytes, crc & 0xFF, (crc >> 8) & 0xFF];
}

function calculateCRC16(bytes: number[]): number {
  let crc = 0xFFFF;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc;
}

/**
 * Simulates physical layer noise by flipping bits randomly based on noiseLevel.
 */
function applySignalNoise(bytes: number[], noiseLevel: number): number[] {
  if (noiseLevel <= 0) return bytes;

  return bytes.map(byte => {
    let corruptedByte = byte;
    for (let bit = 0; bit < 8; bit++) {
      // If noiseLevel is 0.01, there is a 1% chance for EACH BIT to flip
      if (Math.random() < noiseLevel) {
        corruptedByte ^= (1 << bit);
      }
    }
    return corruptedByte;
  });
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
