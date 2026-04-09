import React, { useState, memo, useMemo } from 'react';
import type { GeneratedFrame, FrameProfile, FlagsConfig } from '../../../types';

interface VisualProtocolAnalyzerProps {
  frame: GeneratedFrame | null;
  profile: FrameProfile | null;
}

const VisualProtocolAnalyzer = memo(({ frame, profile }: VisualProtocolAnalyzerProps) => {
  const [selectedByteIndex, setSelectedByteIndex] = useState<number | null>(null);

  // Calculate field mapping for each byte index
  const byteMap = useMemo(() => {
    if (!profile) return [];
    const map: Array<{ field: any; byteInField: number }> = [];
    let currentByte = 0;
    for (const field of profile.fields) {
      for (let i = 0; i < field.byteWidth; i++) {
        map.push({ field, byteInField: i });
      }
    }
    return map;
  }, [profile]);

  if (!frame || !profile) {
    return (
      <div className="h-24 flex items-center justify-center bg-gray-950/20 border-t border-gray-800 text-gray-700 font-mono text-[10px] uppercase tracking-[0.3em]">
        Analizör için veri bekleniyor...
      </div>
    );
  }

  const selectedByteValue = (selectedByteIndex !== null && frame.rawBytes[selectedByteIndex] !== undefined) ? frame.rawBytes[selectedByteIndex] : null;
  const selectedByteInfo = (selectedByteIndex !== null && byteMap[selectedByteIndex]) ? byteMap[selectedByteIndex] : null;

  return (
    <div className="bg-gray-900 border-t border-gray-800 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-1.5 flex items-center justify-between border-b border-gray-800 bg-gray-950/40">
        <div className="text-gray-500 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
          Görsel Protokol Analizörü (Bit-Level)
        </div>
        <div className="flex gap-4">
           {['fixed', 'range', 'waveform', 'flags', 'checksum'].map(type => (
             <div key={type} className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${getTypeColor(type)} opacity-40`} />
               <span className="text-[8px] text-gray-600 font-mono uppercase">{type}</span>
             </div>
           ))}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Byte Grid */}
        <div className="flex flex-wrap gap-2">
          {frame.rawBytes.map((byte, idx) => {
            const info = byteMap[idx];
            const isSelected = selectedByteIndex === idx;
            const type = info?.field.type || 'unknown';
            const color = getTypeColor(type);

            return (
              <div 
                key={idx}
                onClick={() => setSelectedByteIndex(isSelected ? null : idx)}
                className={`
                  relative group cursor-pointer transition-all duration-200
                  w-10 h-12 flex flex-col items-center justify-center rounded-lg border
                  ${isSelected ? 'scale-110 z-10 shadow-lg' : 'hover:scale-105'}
                  ${isSelected ? 'bg-gray-800 border-gray-400' : 'bg-black/40 border-gray-800 hover:border-gray-600'}
                `}
                style={isSelected ? { borderColor: color.replace('text-', '').replace('bg-', '') } : {}}
              >
                <div className={`text-[8px] font-mono opacity-40 mb-1`}>{idx.toString(16).padStart(2,'0')}</div>
                <div className={`text-sm font-mono font-bold transition-colors ${isSelected ? 'text-white' : color}`}>
                  {byte.toString(16).padStart(2, '0').toUpperCase()}
                </div>
                {/* Visual indicator for byte type */}
                <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-lg ${color} opacity-40`} />
              </div>
            );
          })}
        </div>

        {/* Bit Breakdown Panel */}
        <div className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${selectedByteIndex !== null ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'}
        `}>
          {selectedByteIndex !== null && selectedByteValue !== null && (
            <div className="bg-black/40 rounded-xl border border-gray-800 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-gray-800/50 pb-2">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                    Byte {selectedByteIndex} ({selectedByteInfo?.field.name}) Detayı:
                  </span>
                  <span className="text-sm font-mono font-bold text-gray-200">
                    0b{selectedByteValue.toString(2).padStart(8, '0')}
                  </span>
                </div>
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-gray-800 ${getTypeColor(selectedByteInfo?.field.type || '')}`}>
                  {selectedByteInfo?.field.type}
                </span>
              </div>

              <div className="flex gap-2">
                {[7, 6, 5, 4, 3, 2, 1, 0].map(bitIdx => {
                  const isSet = (selectedByteValue >> bitIdx) & 1;
                  // If it's a flags field, find the label for this bit (adjusted for multi-byte fields)
                  let flagLabel = null;
                  if (selectedByteInfo?.field.type === 'flags') {
                    const cfg = selectedByteInfo.field.typeConfig as FlagsConfig;
                    const absoluteBitIdx = (selectedByteInfo.byteInField * 8) + bitIdx;
                    flagLabel = cfg.bits.find(b => b.index === absoluteBitIdx)?.name;
                  }

                  return (
                    <div key={bitIdx} className="flex-1 flex flex-col items-center gap-1.5 group/bit">
                      <div className={`
                        w-full h-8 rounded-lg border flex items-center justify-center font-mono font-bold text-xs transition-all
                        ${isSet 
                          ? 'bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.3)]' 
                          : 'bg-gray-900 border-gray-800 text-gray-700'
                        }
                      `}>
                        {isSet ? '1' : '0'}
                      </div>
                      <div className="text-[8px] font-mono text-gray-600 uppercase tracking-tighter truncate w-full text-center group-hover/bit:text-gray-400 transition-colors">
                        {flagLabel || `Bit ${bitIdx}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function getTypeColor(type: string): string {
  switch (type) {
    case 'fixed': return 'text-blue-400 bg-blue-500';
    case 'checksum': return 'text-red-400 bg-red-500';
    case 'flags': return 'text-yellow-400 bg-yellow-500';
    case 'range':
    case 'waveform':
      return 'text-green-400 bg-green-500';
    default: return 'text-gray-500 bg-gray-500';
  }
}

VisualProtocolAnalyzer.displayName = 'VisualProtocolAnalyzer';

export default VisualProtocolAnalyzer;
