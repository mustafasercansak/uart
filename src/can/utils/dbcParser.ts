import type { CANProfileNode } from '../store/canProfileStorage';
import { MEDICAL_PROFILE_COLORS } from '../types/CANNode';

export interface DBCMessage {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  isExtended: boolean;
}

export interface DBCParseResult {
  messages: DBCMessage[];
  errors: string[];
}

/**
 * Parse a .dbc file and extract message definitions.
 * Handles standard (11-bit) and extended (29-bit) frame IDs.
 * Extended frames have bit 31 set in .dbc format (id >= 0x80000000).
 */
export function parseDBC(content: string): DBCParseResult {
  const messages: DBCMessage[] = [];
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/^BO_\s+(\d+)\s+([\w]+)\s*:\s*(\d+)\s+(\S+)/);
    if (!match) continue;

    const rawId = parseInt(match[1], 10);
    const isExtended = rawId >= 0x80000000;
    const actualId = isExtended ? (rawId & 0x1FFFFFFF) : rawId;

    if (!isExtended && actualId > 0x7FF) {
      errors.push(`Line ${i + 1}: ID 0x${actualId.toString(16).toUpperCase()} exceeds 11-bit standard frame range`);
      continue;
    }

    messages.push({
      id: actualId,
      name: match[2].replace(/_/g, ' '),
      dlc: Math.min(8, Math.max(1, parseInt(match[3], 10))),
      sender: match[4],
      isExtended,
    });
  }

  return { messages, errors };
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
