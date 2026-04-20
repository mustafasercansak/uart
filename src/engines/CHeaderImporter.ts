import { v4 as uuidv4 } from 'uuid';
import type { Field, FixedConfig } from '../types';

/**
 * Parses C-style struct definitions into simulation fields.
 * Supports standard types like uint8_t, int16_t, float, etc.
 */
export function parseCHeader(header: string): Field[] {
  const fields: Field[] = [];
  let order = 0;

  // Cleanup: remove comments
  const cleanHeader = header.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

  // Regex to find struct members: type name;
  const memberRegex = /([a-zA-Z_][a-zA-Z0-9_*]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\[(\d+)\])?\s*;/g;
  let match;

  const typeMap: Record<string, number> = {
    'uint8_t': 1, 'int8_t': 1, 'char': 1, 'unsigned char': 1,
    'uint16_t': 2, 'int16_t': 2, 'short': 2, 'unsigned short': 2,
    'uint32_t': 4, 'int32_t': 4, 'int': 4, 'unsigned int': 4, 'float': 4,
    'uint64_t': 8, 'int64_t': 8, 'double': 8, 'long long': 8
  };

  while ((match = memberRegex.exec(cleanHeader)) !== null) {
    const cType = match[1].trim();
    const name = match[2].trim();
    const arraySize = match[3] ? parseInt(match[3], 10) : 1;

    const byteWidth = typeMap[cType] || 1;
    
    // If it's an array, we handle it as multiple iterations or one wide field
    // For now, let's create a single field but multiply width for simplicity 
    // (Actual tool can be smarter and split them)
    const totalWidth = byteWidth * arraySize;

    fields.push({
      id: uuidv4(),
      name: name,
      order: order++,
      byteWidth: totalWidth,
      endianness: 'little', // Standard for most MCUs (ARM, ESP32)
      type: 'fixed',
      typeConfig: { value: 0 } as FixedConfig
    });
  }

  return fields;
}
