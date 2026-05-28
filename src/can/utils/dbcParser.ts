import type { CANProfileNode } from '../store/canProfileStorage';
import { MEDICAL_PROFILE_COLORS } from '../types/CANNode';

export interface DBCSignal {
  name: string;
  startBit: number;
  length: number;
  byteOrder: 'little_endian' | 'big_endian'; // 1 = Intel (little), 0 = Motorola (big)
  isSigned: boolean;
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  receivers: string[];
  muxIndicator?: 'multiplexer' | 'multiplexed';
  muxValue?: number;
}

export interface DBCMessage {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  isExtended: boolean;
  signals: DBCSignal[];
}

export interface DBCValueTable {
  messageId: number;
  signalName: string;
  values: Record<number, string>;
}

export interface DBCParseResult {
  messages: DBCMessage[];
  valueTables: DBCValueTable[];
  errors: string[];
}

const SG_REGEX = /^\s*SG_\s+(\w+)\s*(M|m\d+)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]*)\|([^\]]*)\]\s*"([^"]*)"\s*(.*)/;
const VAL_REGEX = /^VAL_\s+(\d+)\s+(\w+)\s+(.*?)\s*;/;

/**
 * Parse a .dbc file and extract message and signal definitions.
 * Handles standard (11-bit) and extended (29-bit) frame IDs,
 * signal definitions (SG_), multiplexing (M/m), and value tables (VAL_).
 */
export function parseDBC(content: string): DBCParseResult {
  const messages: DBCMessage[] = [];
  const valueTables: DBCValueTable[] = [];
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);

  let currentMessage: DBCMessage | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // BO_ — message definition
    const msgMatch = trimmed.match(/^BO_\s+(\d+)\s+([\w]+)\s*:\s*(\d+)\s+(\S+)/);
    if (msgMatch) {
      const rawId = parseInt(msgMatch[1], 10);
      const isExtended = rawId >= 0x80000000;
      const actualId = isExtended ? (rawId & 0x1FFFFFFF) : rawId;

      if (!isExtended && actualId > 0x7FF) {
        errors.push(`Line ${i + 1}: ID 0x${actualId.toString(16).toUpperCase()} exceeds 11-bit standard frame range`);
        currentMessage = null;
        continue;
      }

      currentMessage = {
        id: actualId,
        name: msgMatch[2].replace(/_/g, ' '),
        dlc: Math.min(8, Math.max(0, parseInt(msgMatch[3], 10))),
        sender: msgMatch[4],
        isExtended,
        signals: [],
      };
      messages.push(currentMessage);
      continue;
    }

    // SG_ — signal definition (must be inside a message block)
    const sgMatch = trimmed.match(SG_REGEX);
    if (sgMatch && currentMessage) {
      const muxRaw = sgMatch[2]?.trim();
      let muxIndicator: DBCSignal['muxIndicator'];
      let muxValue: number | undefined;

      if (muxRaw === 'M') {
        muxIndicator = 'multiplexer';
      } else if (muxRaw?.startsWith('m')) {
        muxIndicator = 'multiplexed';
        muxValue = parseInt(muxRaw.slice(1), 10);
      }

      const signal: DBCSignal = {
        name: sgMatch[1],
        startBit: parseInt(sgMatch[3], 10),
        length: parseInt(sgMatch[4], 10),
        byteOrder: sgMatch[5] === '1' ? 'little_endian' : 'big_endian',
        isSigned: sgMatch[6] === '-',
        factor: isNaN(parseFloat(sgMatch[7])) ? 1 : parseFloat(sgMatch[7]),
        offset: parseFloat(sgMatch[8]) || 0,
        min: parseFloat(sgMatch[9]) || 0,
        max: parseFloat(sgMatch[10]) || 0,
        unit: sgMatch[11],
        receivers: sgMatch[12].split(',').map(r => r.trim()).filter(Boolean),
        muxIndicator,
        muxValue,
      };

      currentMessage.signals.push(signal);
      continue;
    }

    // Blank line or new top-level keyword ends the current message context
    if (trimmed === '' || /^[A-Z_]+_/.test(trimmed)) {
      if (!/^SG_|^BO_/.test(trimmed)) currentMessage = null;
    }

    // VAL_ — value/enum table
    const valMatch = trimmed.match(VAL_REGEX);
    if (valMatch) {
      const msgId = parseInt(valMatch[1], 10);
      const signalName = valMatch[2];
      const valueMap: Record<number, string> = {};
      const pairs = valMatch[3].matchAll(/(\d+)\s+"([^"]*)"/g);
      for (const pair of pairs) {
        valueMap[parseInt(pair[1], 10)] = pair[2];
      }
      valueTables.push({ messageId: msgId, signalName, values: valueMap });
    }
  }

  return { messages, valueTables, errors };
}

/**
 * Extract a signal value from a CAN data byte array using little-endian (Intel) or
 * big-endian (Motorola) bit ordering, then apply factor/offset scaling.
 */
export function extractSignalValue(data: number[], signal: DBCSignal): number {
  const buf = new Uint8Array(8);
  for (let i = 0; i < Math.min(data.length, 8); i++) buf[i] = data[i];

  let rawValue = 0;

  if (signal.byteOrder === 'little_endian') {
    // Intel byte order: startBit is the LSB position
    for (let i = 0; i < signal.length; i++) {
      const bitPos = signal.startBit + i;
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = bitPos % 8;
      if (byteIdx < 8 && (buf[byteIdx] >> bitIdx) & 1) {
        rawValue += 2 ** i; // avoid `|=` / `<<` which truncate to 32 bits
      }
    }
  } else {
    // Motorola byte order: startBit is the MSB position in DBC bit numbering
    // where bit N of byte B = byte B, physical bit N%8 (bit 7 = MSB of that byte).
    // Traverse from MSB downward; at byte LSB (bitPos%8===0) jump to MSB of next byte (+15).
    let bitPos = signal.startBit;
    for (let i = signal.length - 1; i >= 0; i--) {
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = bitPos % 8;
      if (byteIdx < 8 && (buf[byteIdx] >> bitIdx) & 1) {
        rawValue += 2 ** i; // avoid `|=` / `<<` which truncate to 32 bits
      }
      if (bitPos % 8 === 0) bitPos += 15;
      else bitPos--;
    }
  }

  // Sign extension for signed signals — uses arithmetic to stay above 32-bit JS limit
  if (signal.isSigned && signal.length > 0) {
    const halfRange = 2 ** (signal.length - 1);
    if (rawValue >= halfRange) rawValue -= 2 * halfRange;
  }

  return rawValue * signal.factor + signal.offset;
}

export function dbcToProfileNodes(messages: DBCMessage[]): CANProfileNode[] {
  return messages.map((msg, idx) => ({
    id: idx + 1,
    name: msg.name,
    profile: 'custom' as const,
    color: MEDICAL_PROFILE_COLORS['custom'],
    baseArbitrationId: msg.id,
    sendIntervalMs: 100,
    isActive: true,
    nodeId: idx + 1,
    frameFormat: msg.isExtended ? 'extended' as const : 'standard' as const,
    dlc: msg.dlc,
    nmtInitialState: 'operational' as const,
    priority: 0,
  }));
}
