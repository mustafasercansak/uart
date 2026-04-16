import React, { memo, useState } from 'react';
import type { GeneratedFrame, FrameProfile } from '../../../types';
import HexPreviewer from './HexPreviewer';
import { Info, AlertTriangle, ChevronRight, Hash, Database } from 'lucide-react';

interface PacketInspectorProps {
  frame: GeneratedFrame | null;
  profile: FrameProfile | null;
  onClose: () => void;
}

const PacketInspector = memo(({ frame, profile, onClose }: PacketInspectorProps) => {
  const [hoveredFieldRange, setHoveredFieldRange] = useState<{ start: number; end: number } | null>(null);

  if (!frame) return null;

  // Calculate offsets for each field
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
      <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-500/10 rounded-lg">
            <Info size={16} className="text-blue-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-gray-200 text-xs font-bold font-mono">FRAME ANALYSIS</span>
            <span className="text-gray-500 text-[10px] font-mono uppercase tracking-widest">Protocol Dissector</span>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-all"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        
        {/* Frame Summary Card */}
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-900/40 border border-gray-800 rounded-xl p-4 shadow-inner">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-1">Frame Reference</h3>
                    <p className="text-xl font-mono font-bold text-white tracking-tighter">#{frame.frameNumber}</p>
                </div>
                <div className="text-right">
                    <h3 className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-1">Capture Time</h3>
                    <p className="text-xs font-mono text-gray-300">{new Date(frame.timestampMs).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.{frame.timestampMs % 1000}</p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 rounded-lg p-2 border border-gray-800/50">
                    <div className="flex items-center gap-2 text-[9px] text-gray-500 uppercase mb-1">
                        <Database size={10} /> <span>Payload Size</span>
                    </div>
                    <div className="text-xs font-mono text-blue-400 font-bold">{frame.rawBytes.length} Bytes</div>
                </div>
                <div className="bg-black/30 rounded-lg p-2 border border-gray-800/50">
                    <div className="flex items-center gap-2 text-[9px] text-gray-500 uppercase mb-1">
                        <Hash size={10} /> <span>Integrity</span>
                    </div>
                    <div className={`text-xs font-mono font-bold ${frame.errors.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {frame.errors.length > 0 ? 'Error Detected' : 'Valid'}
                    </div>
                </div>
            </div>
        </div>

        {/* 1. Raw Data (HexPreviewer) */}
        <div className="space-y-3">
           <div className="flex items-center justify-between">
             <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest font-bold">Bitstream View (Hex / ASCII)</label>
             <span className="text-[9px] text-gray-600 font-mono">Row: 16-Bytes</span>
           </div>
           <HexPreviewer 
             bytes={frame.rawBytes} 
             highlightRange={hoveredFieldRange || undefined}
           />
        </div>

        {/* 2. Dissection Table */}
        <div className="space-y-3">
          <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest font-bold">Field-Level Dissection</label>
          <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-800/40 text-[9px] font-mono text-gray-500 uppercase tracking-tighter">
                  <th className="p-3 border-b border-gray-800">Offset</th>
                  <th className="p-3 border-b border-gray-800">Element</th>
                  <th className="p-3 border-b border-gray-800 text-right">Value (Dec/Hex)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/20 font-mono text-[11px]">
                {fieldDetails.map((f, i) => (
                  <tr 
                    key={i} 
                    className="hover:bg-blue-500/5 transition-colors cursor-crosshair group"
                    onMouseEnter={() => setHoveredFieldRange({ start: f.offset, end: f.offset + f.byteWidth })}
                    onMouseLeave={() => setHoveredFieldRange(null)}
                  >
                    <td className="p-3 text-gray-600 tabular-nums">0x{f.offset.toString(16).padStart(2, '0').toUpperCase()}</td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                           <ChevronRight size={10} className="text-gray-700 group-hover:text-blue-500 transition-transform group-hover:translate-x-0.5" />
                           <span className="text-gray-300 font-bold group-hover:text-white transition-colors">{f.name}</span>
                        </div>
                        <span className="text-[9px] text-gray-600 uppercase ml-3">{f.type} ({f.byteWidth}B)</span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                       <div className="flex flex-col items-end">
                         <span className="text-gray-200 font-bold">{f.data?.decimal ?? '--'}</span>
                         <span className="text-[10px] text-gray-500">0x{f.data?.hex.replace(/\s+/g, '') || '--'}</span>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Flags Analysis */}
        {fieldDetails.some(f => f.data?.flags) && (
           <div className="space-y-3">
              <label className="text-[10px] text-gray-500 font-mono uppercase tracking-widest font-bold">Logical Flag Breakdown</label>
              <div className="grid grid-cols-2 gap-2">
                 {fieldDetails.filter(f => f.data?.flags).map(f => (
                    Object.entries(f.data!.flags!).map(([name, val]) => (
                      <div key={name} className={`flex items-center justify-between p-2 rounded-lg border text-[10px] font-mono ${val ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-gray-900/50 border-gray-800 text-gray-600'}`}>
                        <span className="truncate mr-2">{name}</span>
                        <span className="font-bold">{val}</span>
                      </div>
                    ))
                 ))}
              </div>
           </div>
        )}

        {/* 4. Active Issues */}
        {frame.errors.length > 0 && (
          <div className="space-y-3 pb-4">
            <div className="flex items-center gap-2 text-[10px] text-red-500 font-mono uppercase tracking-widest font-bold font-bold">
                <AlertTriangle size={12} />
                <span>Critical Anomalies</span>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-2">
              {frame.errors.map((err, idx) => (
                <div key={idx} className="flex items-start gap-3 text-red-400/90 text-[11px] font-mono leading-relaxed">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/40 text-[9px] font-mono text-gray-600 flex justify-between items-center">
        <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>ANALYZER ACTIVE</span>
        </div>
        <div className="flex gap-4">
            <span>SYNC: OK</span>
            <span>LEN: {frame.rawBytes.length}B</span>
        </div>
      </div>
    </div>
  );
});

PacketInspector.displayName = 'PacketInspector';

export default PacketInspector;
