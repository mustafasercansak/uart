import type { CANFrame, J1939Info } from '../types/CANFrame';

/** Compute CAN 15-bit CRC using the standard CAN polynomial 0x4599. */
export function computeCANCRC(data: number[], arbitrationId: number, dlc: number, idFormat: 'standard' | 'extended'): number {
  const poly = 0x4599;
  let crc = 0;

  // Build the bit stream: SOF(1) + ID bits + RTR(1) + IDE(1) + r0(1) + DLC(4) + DATA
  const bits: number[] = [];
  bits.push(0); // SOF dominant

  if (idFormat === 'standard') {
    for (let i = 10; i >= 0; i--) bits.push((arbitrationId >> i) & 1);
    bits.push(0); // RTR
    bits.push(0); // IDE
    bits.push(0); // r0
  } else {
    for (let i = 28; i >= 0; i--) bits.push((arbitrationId >> i) & 1);
    bits.push(0); // RTR
    bits.push(1); // IDE = 1 for extended
    bits.push(0); // r1
    bits.push(0); // r0
  }

  for (let i = 3; i >= 0; i--) bits.push((dlc >> i) & 1);
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }

  for (const bit of bits) {
    const topBit = (crc >> 14) & 1;
    crc = ((crc << 1) | bit) & 0x7fff;
    if (topBit) crc ^= poly;
  }
  return crc;
}

/** Decode raw bytes into a CANFrame. Returns null if bytes are malformed. */
export function parseCANFrame(bytes: number[]): Omit<CANFrame, 'uid' | 'timestamp' | 'nodeId' | 'busLoadPercent'> | null {
  if (bytes.length < 3) return null;

  const byte0 = bytes[0];
  const idFormat = (byte0 & 0x80) ? 'extended' : 'standard';
  const isRTR = !!(byte0 & 0x40);
  const frameTypeBits = (byte0 >> 4) & 0x03;
  const frameType = frameTypeBits === 1 ? 'remote' : frameTypeBits === 2 ? 'error' : frameTypeBits === 3 ? 'overload' : 'data';

  let arbitrationId: number;
  let dataOffset: number;

  if (idFormat === 'standard') {
    arbitrationId = ((bytes[0] & 0x07) << 8) | bytes[1];
    dataOffset = 2;
  } else {
    arbitrationId = ((bytes[0] & 0x1f) << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    dataOffset = 4;
  }

  if (bytes.length <= dataOffset) return null;
  const dlc = bytes[dataOffset] & 0x0f;
  dataOffset++;

  if (dlc > 8 || bytes.length < dataOffset + dlc) return null;
  const data = bytes.slice(dataOffset, dataOffset + dlc);

  const crc = computeCANCRC(data, arbitrationId, dlc, idFormat);
  const errors: string[] = [];

  return { arbitrationId, idFormat, frameType, isRTR, dlc, data, crc, errors };
}

/** Encode a CANFrame back to raw bytes (simplified, for display/export). */
export function encodeCANFrame(frame: Pick<CANFrame, 'arbitrationId' | 'idFormat' | 'isRTR' | 'frameType' | 'dlc' | 'data'>): number[] {
  const bytes: number[] = [];
  const frameTypeBit = frame.frameType === 'remote' ? 1 : frame.frameType === 'error' ? 2 : frame.frameType === 'overload' ? 3 : 0;

  if (frame.idFormat === 'standard') {
    bytes.push(((frameTypeBit & 0x3) << 4) | (frame.isRTR ? 0x40 : 0) | ((frame.arbitrationId >> 8) & 0x07));
    bytes.push(frame.arbitrationId & 0xff);
  } else {
    bytes.push(0x80 | ((frameTypeBit & 0x3) << 4) | (frame.isRTR ? 0x40 : 0) | ((frame.arbitrationId >> 24) & 0x1f));
    bytes.push((frame.arbitrationId >> 16) & 0xff);
    bytes.push((frame.arbitrationId >> 8) & 0xff);
    bytes.push(frame.arbitrationId & 0xff);
  }

  bytes.push(frame.dlc & 0x0f);
  bytes.push(...frame.data.slice(0, frame.dlc));
  return bytes;
}

/** Format arbitration ID as hex string with prefix. */
export function formatArbitrationId(id: number, format: 'standard' | 'extended'): string {
  if (format === 'standard') return `0x${id.toString(16).toUpperCase().padStart(3, '0')}`;
  return `0x${id.toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * Decode SAE J1939 fields from a 29-bit extended CAN arbitration ID.
 * J1939 ID layout (MSB→LSB):
 *   [28:26] Priority (3 bits)
 *   [25]    Reserved
 *   [24]    Data Page
 *   [23:16] PF – PDU Format
 *   [15:8]  PS – PDU Specific (destination address if PF < 240, else group extension)
 *   [7:0]   SA – Source Address
 */
export function parseJ1939Id(arbitrationId: number): J1939Info {
  const priority      = (arbitrationId >> 26) & 0x07;
  const dataPage      = (arbitrationId >> 24) & 0x01;
  const pf            = (arbitrationId >> 16) & 0xFF;
  const ps            = (arbitrationId >>  8) & 0xFF;
  const sourceAddress =  arbitrationId        & 0xFF;
  const isPeer2Peer   = pf < 240;
  // PGN omits SA; for peer-to-peer (PF < 240) the destination (PS) is not part of the PGN.
  // DP occupies bit 17 of the 18-bit PGN field (bits 17-0 of the 29-bit extended ID starting at bit 8).
  const pgn = isPeer2Peer
    ? (dataPage << 17) | (pf << 8)
    : (dataPage << 17) | (pf << 8) | ps;

  return {
    priority,
    dataPage,
    pgn,
    pf,
    ps,
    sourceAddress,
    destinationAddress: isPeer2Peer ? ps : undefined,
    isPeer2Peer,
  };
}

/** Well-known J1939 PGN names for common parameter groups. */
const J1939_PGN_NAMES: Record<number, string> = {
  0xFECA: 'DM1 – Active DTCs',
  0xFECB: 'DM2 – Previously Active DTCs',
  0xFECC: 'DM3 – Clear DTCs',
  0xFECD: 'DM4 – Freeze Frame',
  0xFECE: 'DM5 – Readiness',
  0xFEEE: 'Engine Temperature',
  0xFEEF: 'Engine Fluid Level / Pressure',
  0xFEF1: 'Cruise Control / Vehicle Speed',
  0xFEF2: 'Fuel Economy',
  0xFEE5: 'Engine Hours / Revolutions',
  0xFEEC: 'Vehicle Identification',
  0xFEEB: 'Software Identification',
  0xFEDA: 'Cab Message 1',
  0xFEF0: 'Power Takeoff Information',
  0xF004: 'Electronic Engine Controller 1',
  0xF003: 'Electronic Engine Controller 2',
  0xFE6B: 'Battery Main Switch Info',
  0x0000: 'Torque/Speed Control 1',
};

export function j1939PgnName(pgn: number): string {
  return J1939_PGN_NAMES[pgn] ?? `PGN 0x${pgn.toString(16).toUpperCase().padStart(4, '0')}`;
}
