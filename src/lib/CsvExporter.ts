import { GeneratedFrame, FrameProfile, FlagsConfig } from '../types';
import { parseFrame } from '../engines/FrameParser';

export function generateCsv(frames: GeneratedFrame[], profile: FrameProfile): string {
  if (frames.length === 0) return '';

  const sortedFields = [...profile.fields].sort((a, b) => a.order - b.order);
  
  const headerRow = ['Timestamp (ms)', 'Raw (Hex)'];
  for (const f of sortedFields) {
    if (f.type === 'flags') {
      const cfg = f.typeConfig as FlagsConfig;
      if (cfg && cfg.bits) {
        for (const b of cfg.bits) {
          headerRow.push(`${f.name}_${b.name}`);
        }
      } else {
         headerRow.push(f.name);
      }
    } else {
      headerRow.push(f.name);
    }
  }

  const rows: string[] = [headerRow.map(h => `"${h}"`).join(',')];

  for (const frame of frames) {
    const parsed = parseFrame(profile, frame.rawBytes);
    const hex = frame.rawBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const row = [Math.round(frame.timestampMs).toString(), `"${hex}"`];

    if (parsed) {
      for (const p of parsed) {
        if (p.flags) {
           const fDef = sortedFields.find(sf => sf.name === p.name);
           const cfg = fDef?.typeConfig as FlagsConfig;
           if (cfg && cfg.bits) {
             for (const b of cfg.bits) {
                row.push(p.flags[b.name]?.toString() || '0');
             }
           } else {
             row.push(p.decimal.toString());
           }
        } else {
           row.push(p.decimal.toString());
        }
      }
    } else {
      const extraCols = headerRow.length - 2;
      for (let i = 0; i < extraCols; i++) {
        row.push('');
      }
    }
    
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

export function downloadCsv(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
