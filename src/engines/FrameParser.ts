import type { FrameProfile, ParsedField, FlagsConfig } from '../types';

/**
 * Parses a raw byte array into structured fields based on a FrameProfile.
 */
export function parseFrame(profile: FrameProfile, bytes: number[]): ParsedField[] | null {
  const sortedFields = [...profile.fields].sort((a, b) => a.order - b.order);
  const totalProfileWidth = sortedFields.reduce((sum, f) => sum + f.byteWidth, 0);

  // If the byte count doesn't match the profile, we can't parse it reliably
  // (unless we implement sophisticated sync searching, but for now exact match is safer)
  if (bytes.length < totalProfileWidth) return null;

  const parsedFields: ParsedField[] = [];
  let currentOffset = 0;

  for (const field of sortedFields) {
    const fieldBytes = bytes.slice(currentOffset, currentOffset + field.byteWidth);
    if (fieldBytes.length < field.byteWidth) break;

    // Calculate decimal value based on endianness
    let decimalValue = 0;
    if (field.endianness === 'little') {
      for (let i = 0; i < fieldBytes.length; i++) {
        decimalValue |= (fieldBytes[i] << (i * 8));
      }
    } else {
      for (let i = 0; i < fieldBytes.length; i++) {
        decimalValue = (decimalValue << 8) | fieldBytes[i];
      }
    }

    const hexStr = fieldBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    
    const parsed: ParsedField = {
      name: field.name,
      hex: hexStr,
      decimal: decimalValue
    };

    // Parse flags if applicable
    if (field.type === 'flags') {
      const cfg = field.typeConfig as FlagsConfig;
      parsed.flags = {};
      for (const bit of cfg.bits) {
        parsed.flags[bit.name] = (decimalValue >> bit.index) & 1;
      }
    }

    parsedFields.push(parsed);
    currentOffset += field.byteWidth;
  }

  return parsedFields;
}
