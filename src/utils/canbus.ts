import type { CANFrame, CANIdType } from '../types/protocols/canbus';

export function crc15CAN(bits: number[]): number {
  const poly = 0x4599;
  let crc = 0;
  for (const bit of bits) {
    const topBit = (crc >> 14) & 1;
    crc = ((crc << 1) | bit) & 0x7fff;
    if (topBit) crc ^= poly;
  }
  return crc;
}

function byteToBits(byte: number): number[] {
  const bits: number[] = [];
  for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  return bits;
}

export function buildCANFrameBits(frame: CANFrame): number[] {
  const bits: number[] = [];

  // SOF
  bits.push(0);

  if (frame.idType === 'standard') {
    // 11-bit ID
    for (let i = 10; i >= 0; i--) bits.push((frame.id >> i) & 1);
    bits.push(frame.frameType === 'remote' ? 1 : 0); // RTR
    bits.push(0); // IDE (standard)
    bits.push(0); // reserved
  } else {
    // 29-bit ID (extended)
    for (let i = 28; i >= 18; i--) bits.push((frame.id >> i) & 1); // base 11 bits
    bits.push(1); // SRR
    bits.push(1); // IDE (extended)
    for (let i = 17; i >= 0; i--) bits.push((frame.id >> i) & 1); // extension 18 bits
    bits.push(frame.frameType === 'remote' ? 1 : 0); // RTR
    bits.push(0); bits.push(0); // r1, r0
  }

  // DLC (4 bits)
  for (let i = 3; i >= 0; i--) bits.push((frame.dlc >> i) & 1);

  // Data bytes
  for (let i = 0; i < frame.dlc; i++) {
    bits.push(...byteToBits(frame.data[i] ?? 0));
  }

  // CRC (15 bits)
  const crc = crc15CAN(bits.slice(1)); // skip SOF
  for (let i = 14; i >= 0; i--) bits.push((crc >> i) & 1);
  bits.push(1); // CRC delimiter

  // ACK slot + delimiter
  bits.push(1); bits.push(1);

  // EOF (7 recessive bits)
  for (let i = 0; i < 7; i++) bits.push(1);

  return applyBitStuffing(bits, 1); // stuff after SOF
}

function applyBitStuffing(bits: number[], startFrom: number): number[] {
  const result: number[] = [...bits.slice(0, startFrom)];
  let consecutive = 0;
  let lastBit = bits[startFrom - 1] ?? -1;

  for (let i = startFrom; i < bits.length; i++) {
    const bit = bits[i];
    result.push(bit);
    if (bit === lastBit) {
      consecutive++;
      if (consecutive === 4) {
        result.push(bit ^ 1); // insert opposite stuffing bit
        consecutive = 0;
        lastBit = bit ^ 1;
        continue;
      }
    } else {
      consecutive = 0;
    }
    lastBit = bit;
  }

  return result;
}

export function buildCANFrame(
  id: number,
  data: number[],
  idType: CANIdType = 'standard',
  nodeId?: string,
): CANFrame {
  const dlc = Math.min(data.length, 8);
  const frameBits = buildCANFrameBits({ id, idType, frameType: 'data', dlc, data, crc: 0, timestamp: Date.now() });
  const crc = crc15CAN(frameBits.slice(1, 1 + 11 + (idType === 'extended' ? 18 : 0) + 4 + dlc * 8));
  return {
    id,
    idType,
    frameType: 'data',
    dlc,
    data: data.slice(0, dlc),
    crc,
    timestamp: Date.now(),
    nodeId,
    raw: frameBits.join(''),
  };
}

export function frameIdHex(frame: CANFrame): string {
  const width = frame.idType === 'extended' ? 8 : 3;
  return '0x' + frame.id.toString(16).toUpperCase().padStart(width, '0');
}

export function frameDataHex(frame: CANFrame): string {
  return frame.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function matchesFilter(frame: CANFrame, filterId: number, filterMask: number): boolean {
  return (frame.id & filterMask) === (filterId & filterMask);
}

// Decode common CAN data interpretations
export function decodeCANData(data: number[]): { uint16BE: number[]; int16BE: number[]; uint8: number[] } {
  const uint16BE: number[] = [];
  const int16BE: number[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const raw = (data[i] << 8) | data[i + 1];
    uint16BE.push(raw);
    int16BE.push(raw > 0x7fff ? raw - 0x10000 : raw);
  }
  return { uint16BE, int16BE, uint8: [...data] };
}
