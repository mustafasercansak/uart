import type { BitTransition, GeneratedFrame } from '../types';
import type { CANFrame } from '../can/types/CANFrame';

export type SmartListenProtocol = 'unknown' | 'uart' | 'modbus_rtu' | 'can_standard' | 'can_extended';

export interface SmartListenResult {
  protocol: SmartListenProtocol;
  baudRate: number | null;
  confidence: number;
  marginPercent: number | null;
  evidence: string[];
}

const UART_BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400];
const CAN_BAUD_RATES = [125000, 250000, 500000, 1000000];

export function estimateBaudRateFromBitDurations(durationsMs: number[], candidates = UART_BAUD_RATES): SmartListenResult {
  const clean = durationsMs.filter((d) => Number.isFinite(d) && d > 0);
  if (clean.length === 0) {
    return emptyResult(['waiting for timing samples']);
  }

  const baudEstimates = clean.map((d) => 1000 / d);
  const estimated = median(baudEstimates);
  const closest = closestCandidate(estimated, candidates);
  const marginPercent = Math.abs(estimated - closest) / closest * 100;
  const stability = Math.max(0, 1 - normalizedMad(baudEstimates, estimated));
  const confidence = clamp((marginPercent <= 5 ? 0.55 : 0.25) + stability * 0.35 + Math.min(clean.length / 80, 0.1), 0, 0.99);

  return {
    protocol: 'unknown',
    baudRate: closest,
    confidence,
    marginPercent,
    evidence: [`estimated ${Math.round(estimated).toLocaleString()} bps from ${clean.length} bit intervals`],
  };
}

export function estimateBaudRateFromTransitions(transitions: BitTransition[], candidates = UART_BAUD_RATES): SmartListenResult {
  const durations = transitions
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((point, index, arr) => index === 0 ? 0 : point.t - arr[index - 1].t)
    .filter((d) => d > 0);

  return estimateBaudRateFromBitDurations(durations, candidates);
}

export function detectUARTTraffic(frames: GeneratedFrame[], transitions: BitTransition[] = []): SmartListenResult {
  const recent = frames.slice(0, 20);
  const bytes = recent.flatMap((frame) => frame.rawBytes);
  const timing = estimateBaudRateFromTransitions(transitions.slice(-240), UART_BAUD_RATES);
  const protocol = looksLikeModbusRTU(bytes) ? 'modbus_rtu' : bytes.length > 0 ? 'uart' : 'unknown';
  const protocolConfidence = protocol === 'modbus_rtu' ? 0.88 : bytes.length >= 4 ? 0.74 : 0.25;
  const confidence = timing.baudRate ? Math.max(protocolConfidence, timing.confidence) : protocolConfidence;

  return {
    protocol,
    baudRate: timing.baudRate,
    confidence: clamp(confidence, 0, 0.99),
    marginPercent: timing.marginPercent,
    evidence: [
      ...timing.evidence,
      protocol === 'modbus_rtu' ? 'valid Modbus RTU CRC and function-code pattern' : `${bytes.length} UART payload bytes observed`,
    ],
  };
}

export function detectCANTraffic(frames: CANFrame[], baudRateHintKbps?: number): SmartListenResult {
  const recent = frames.slice(0, 50);
  const extendedCount = recent.filter((frame) => frame.idFormat === 'extended' || frame.arbitrationId > 0x7ff).length;
  const standardCount = recent.filter((frame) => frame.idFormat === 'standard' && frame.arbitrationId <= 0x7ff).length;
  const protocol = extendedCount > standardCount ? 'can_extended' : recent.length > 0 ? 'can_standard' : 'unknown';
  const hintedBaud = baudRateHintKbps ? baudRateHintKbps * 1000 : null;
  const baudRate = hintedBaud ? closestCandidate(hintedBaud, CAN_BAUD_RATES) : null;
  const marginPercent = hintedBaud && baudRate ? Math.abs(hintedBaud - baudRate) / baudRate * 100 : null;

  return {
    protocol,
    baudRate,
    confidence: recent.length === 0 ? 0.1 : clamp(0.65 + Math.min(recent.length / 100, 0.25), 0, 0.95),
    marginPercent,
    evidence: recent.length === 0
      ? ['waiting for CAN frames']
      : [`${recent.length} CAN frames observed`, `${standardCount} standard / ${extendedCount} extended identifiers`],
  };
}

export function isLocked(result: SmartListenResult): boolean {
  return result.protocol !== 'unknown' && result.baudRate !== null && result.confidence >= 0.7 && (result.marginPercent === null || result.marginPercent <= 5);
}

function looksLikeModbusRTU(bytes: number[]): boolean {
  if (bytes.length < 8) return false;

  for (let start = 0; start <= bytes.length - 8; start++) {
    for (let length = 8; length <= Math.min(256, bytes.length - start); length++) {
      const packet = bytes.slice(start, start + length);
      const fn = packet[1];
      if (!fn || fn > 0x7f) continue;

      const expected = crc16Modbus(packet.slice(0, -2));
      const actual = packet[packet.length - 2] | (packet[packet.length - 1] << 8);
      if (expected === actual) return true;
    }
  }

  return false;
}

function crc16Modbus(bytes: number[]): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) !== 0 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc & 0xffff;
}

function closestCandidate(value: number, candidates: number[]): number {
  return candidates.reduce((best, next) => Math.abs(next - value) < Math.abs(best - value) ? next : best, candidates[0]);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function normalizedMad(values: number[], center: number): number {
  const deviations = values.map((v) => Math.abs(v - center));
  return median(deviations) / center;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function emptyResult(evidence: string[]): SmartListenResult {
  return {
    protocol: 'unknown',
    baudRate: null,
    confidence: 0,
    marginPercent: null,
    evidence,
  };
}
