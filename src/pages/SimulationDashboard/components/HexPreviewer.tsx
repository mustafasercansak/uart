import React, { memo } from 'react';

interface HexPreviewerProps {
  bytes: number[];
  highlightRange?: { start: number; end: number };
  className?: string;
}

const HexPreviewer = memo(({ bytes, highlightRange, className = '' }: HexPreviewerProps) => {
  if (!bytes || bytes.length === 0) return null;

  // Split into 16-byte rows
  const rows: number[][] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    rows.push(bytes.slice(i, i + 16));
  }

  const isHighlighted = (idx: number) => {
    if (!highlightRange) return false;
    return idx >= highlightRange.start && idx < highlightRange.end;
  };

  return (
    <div className={`font-mono text-[11px] bg-gray-950/50 border border-gray-800 rounded-lg p-3 text-gray-400 select-all ${className}`}>
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 mb-0.5 last:mb-0 group">
          {/* Offset */}
          <span className="text-gray-600 w-10 shrink-0">
            {(rowIdx * 16).toString(16).toUpperCase().padStart(4, '0')}
          </span>

          {/* Hex View */}
          <div className="flex gap-1.5 shrink-0">
            {row.map((byte, colIdx) => {
              const globalIdx = rowIdx * 16 + colIdx;
              const highlighted = isHighlighted(globalIdx);
              
              return (
                <span 
                  key={colIdx} 
                  className={`w-5 text-center transition-colors ${
                    highlighted 
                      ? 'bg-blue-500/20 text-blue-400 font-bold border-b border-blue-500/50' 
                      : 'group-hover:text-gray-300'
                  }`}
                >
                  {byte.toString(16).toUpperCase().padStart(2, '0')}
                </span>
              );
            })}
            {/* Pad empty columns if row is short */}
            {row.length < 16 && Array(16 - row.length).fill(0).map((_, i) => (
              <span key={`pad-${i}`} className="w-5" />
            ))}
          </div>

          {/* ASCII View */}
          <div className="flex gap-0 px-2 border-l border-gray-800/50 text-gray-600 font-mono">
            {row.map((byte, colIdx) => {
              const globalIdx = rowIdx * 16 + colIdx;
              const highlighted = isHighlighted(globalIdx);
              const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
              
              return (
                <span 
                  key={colIdx} 
                  className={`${highlighted ? 'text-blue-400 bg-blue-500/10' : ''}`}
                >
                  {char}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

HexPreviewer.displayName = 'HexPreviewer';

export default HexPreviewer;
