import React, { memo } from 'react';
import type { GeneratedFrame, FrameProfile } from '../../../types';

interface PacketInspectorProps {
  frame: GeneratedFrame | null;
  profile: FrameProfile | null;
  onClose: () => void;
}

const PacketInspector = memo(({ frame, profile, onClose }: PacketInspectorProps) => {
  if (!frame) return null;

  // Calculate offsets for each field to show in the table
  let currentOffset = 0;
  const fieldDetails = (profile?.fields || []).map((field) => {
    const fieldData = frame.fields.find(f => f.name === field.name);
    const offset = currentOffset;
    currentOffset += field.byteWidth;
    return {
      ...field,
      data: fieldData,
      offset
    };
  });

  return (
    <div className="flex flex-col h-full bg-gray-950 border-l border-gray-800 animate-in slide-in-from-right duration-300 shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/40">
        <div className="flex items-center gap-3">
          <span className="text-green-500 font-mono text-xs font-bold bg-green-900/20 px-2 py-1 rounded">
            FRAME #{frame.frameNumber}
          </span>
          <span className="text-gray-400 text-[10px] font-mono uppercase tracking-widest">Detaylı İnceleme</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl p-1">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Hex Map Panel */}
        <div className="space-y-3">
          <label className="text-[10px] text-gray-600 font-mono uppercase tracking-widest font-bold">Ham Veri Haritası (Hex Map)</label>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 font-mono text-sm leading-relaxed tracking-wider flex flex-wrap gap-y-2">
            {frame.rawHex.split(' ').map((byte, idx) => {
              // Find which field this byte belongs to
              let byteOffset = 0;
              const field = profile?.fields.find(f => {
                const start = byteOffset;
                byteOffset += f.byteWidth;
                return idx >= start && idx < byteOffset;
              });

              return (
                <span 
                  key={idx} 
                  className={`px-1 rounded ${field ? getFieldBgColor(field.type) : 'text-gray-700'}`}
                  title={field?.name || 'Bilinmeyen'}
                >
                  {byte}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500/30" /><span className="text-[9px] text-gray-500 font-mono uppercase">Sync</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500/30" /><span className="text-[9px] text-gray-500 font-mono uppercase">Data</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500/30" /><span className="text-[9px] text-gray-500 font-mono uppercase">Checksum</span></div>
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="space-y-3">
          <label className="text-[10px] text-gray-600 font-mono uppercase tracking-widest font-bold">Alan Çözümleme (Breakdown)</label>
          <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-800/40 text-[9px] font-mono text-gray-500 uppercase tracking-tighter">
                  <th className="p-2 border-b border-gray-800">Ofset</th>
                  <th className="p-2 border-b border-gray-800">Alan</th>
                  <th className="p-2 border-b border-gray-800">Hex</th>
                  <th className="p-2 border-b border-gray-800">Değer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40 font-mono text-[11px]">
                {fieldDetails.map((f, i) => (
                  <tr key={i} className="hover:bg-gray-800/20 transition-colors group">
                    <td className="p-2 text-gray-600 tabular-nums">0x{f.offset.toString(16).padStart(2, '0').toUpperCase()}</td>
                    <td className="p-2">
                      <div className="flex flex-col">
                        <span className="text-gray-300 font-bold group-hover:text-green-400 transition-colors">{f.name}</span>
                        <span className="text-[9px] text-gray-600 uppercase italic">{f.type}</span>
                      </div>
                    </td>
                    <td className="p-2 text-gray-400">
                      {f.data?.hex ? `0x${f.data.hex.replace(' ', '')}` : '--'}
                    </td>
                    <td className="p-2">
                       <span className="text-gray-200">{f.data?.decimal ?? '--'}</span>
                       {f.data?.flags && (
                         <div className="mt-1 flex flex-wrap gap-1">
                           {Object.entries(f.data.flags).map(([name, val]) => (
                             <span key={name} className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-tighter border ${val ? 'bg-green-900/20 border-green-800/40 text-green-400' : 'bg-gray-800/20 border-gray-800/40 text-gray-600'}`}>
                               {name}
                             </span>
                           ))}
                         </div>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Error Markers */}
        {frame.errors.length > 0 && (
          <div className="space-y-3">
            <label className="text-[10px] text-red-600 font-mono uppercase tracking-widest font-bold">Tespit Edilen Hatalar</label>
            <div className="bg-red-900/10 border border-red-900/20 rounded-xl p-4">
              {frame.errors.map((err, idx) => (
                <div key={idx} className="flex items-center gap-3 text-red-400 text-xs font-mono">
                  <span className="text-lg">⚠</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Meta */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/20 text-[9px] font-mono text-gray-600 flex justify-between">
        <span>ZMN: {new Date(frame.timestampMs).toLocaleTimeString()}</span>
        <span>BOYUT: {frame.rawBytes.length} BYTE</span>
      </div>
    </div>
  );
});

function getFieldBgColor(type: string): string {
  switch (type) {
    case 'fixed': return 'bg-blue-500/20 text-blue-400 border border-blue-500/20';
    case 'checksum': return 'bg-red-500/20 text-red-400 border border-red-500/20';
    case 'range':
    case 'waveform':
    case 'flags':
      return 'bg-green-500/20 text-green-400 border border-green-500/20';
    default: return 'text-gray-300';
  }
}

PacketInspector.displayName = 'PacketInspector';

export default PacketInspector;
