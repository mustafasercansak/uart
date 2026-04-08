import type { ChecksumAlgorithm } from '../types';

// ─────────────────────────────────────────────
// CHECKSUM HESAPLAYICI
// ─────────────────────────────────────────────

function reflect(value: number, bits: number): number {
  let reflected = 0;
  for (let i = 0; i < bits; i++) {
    if ((value & (1 << i)) !== 0) {
      reflected |= 1 << (bits - 1 - i);
    }
  }
  return reflected;
}

function crc8(data: number[]): number {
  let crc = 0x00;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x80) !== 0) crc = ((crc << 1) ^ 0x07) & 0xff;
      else crc = (crc << 1) & 0xff;
    }
  }
  return crc;
}

function crc16(
  data: number[],
  polynomial: number,
  initialValue: number,
  xorOut: number,
  reflectIn: boolean,
  reflectOut: boolean,
): number {
  let crc = initialValue & 0xffff;
  for (let byte of data) {
    if (reflectIn) byte = reflect(byte, 8);
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ polynomial) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  if (reflectOut) crc = reflect(crc, 16);
  return (crc ^ xorOut) & 0xffff;
}

function crc32(data: number[]): number {
  let crc = 0xffffffff;
  for (let byte of data) {
    byte = reflect(byte, 8);
    crc ^= byte << 24;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x80000000) !== 0) crc = ((crc << 1) ^ 0x04c11db7) >>> 0;
      else crc = (crc << 1) >>> 0;
    }
  }
  crc = reflect(crc, 32);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ChecksumParams {
  algorithm: ChecksumAlgorithm;
  initialValue?: number;
  polynomial?: number;
  xorOut?: number;
  reflectIn?: boolean;
  reflectOut?: boolean;
}

export function calculateChecksum(data: number[], params: ChecksumParams): number[] {
  const { algorithm } = params;

  switch (algorithm) {
    case 'xor': {
      const result = data.reduce((acc, b) => acc ^ b, 0) & 0xff;
      return [result];
    }
    case 'sum_mod256': {
      const result = data.reduce((acc, b) => (acc + b) & 0xff, 0);
      return [result];
    }
    case 'crc8': {
      return [crc8(data)];
    }
    case 'crc16_ccitt': {
      const result = crc16(
        data,
        params.polynomial ?? 0x1021,
        params.initialValue ?? 0xffff,
        params.xorOut ?? 0x0000,
        params.reflectIn ?? false,
        params.reflectOut ?? false,
      );
      return [(result >> 8) & 0xff, result & 0xff];
    }
    case 'crc16_modbus': {
      const result = crc16(
        data,
        params.polynomial ?? 0x8005,
        params.initialValue ?? 0xffff,
        params.xorOut ?? 0x0000,
        params.reflectIn ?? true,
        params.reflectOut ?? true,
      );
      return [result & 0xff, (result >> 8) & 0xff]; // little-endian for Modbus
    }
    case 'crc32': {
      const result = crc32(data);
      return [
        (result >> 24) & 0xff,
        (result >> 16) & 0xff,
        (result >> 8) & 0xff,
        result & 0xff,
      ];
    }
    case 'custom': {
      // Custom: use same as CRC-16 with provided params
      const poly = params.polynomial ?? 0x1021;
      const init = params.initialValue ?? 0x0000;
      const xorout = params.xorOut ?? 0x0000;
      const refIn = params.reflectIn ?? false;
      const refOut = params.reflectOut ?? false;
      const result = crc16(data, poly, init, xorout, refIn, refOut);
      return [(result >> 8) & 0xff, result & 0xff];
    }
    default:
      return [0x00];
  }
}
