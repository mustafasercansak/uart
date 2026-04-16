import React, { memo } from 'react';
import { X, Activity, Camera, Pin, ArrowUp, ArrowDown } from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import { parseFrame } from '../../../engines/FrameParser';
import type { FrameProfile, Exchange, GeneratedFrame } from '../../../types';

interface PacketInspectorProps {
  exchange: Exchange | null;
  profile: FrameProfile | null;
  onClose: () => void;
}

const PacketInspector = memo(({ exchange, profile, onClose }: PacketInspectorProps) => {
  const { state, toggleWatchlist, saveSnapshot } = useSimulation();
  
  if (!exchange) return null;

  // Decide which frame to show primary or show comparison
  const txFrame = exchange.tx ? {
      ...exchange.tx,
      rawBytes: exchange.tx.rawHex.split(' ').map(h => parseInt(h, 16)),
      fields: profile ? parseFrame(profile, exchange.tx.rawHex.split(' ').map(h => parseInt(h, 16))) || [] : []
  } : null;

  const rxFrame = exchange.rx ? {
      ...exchange.rx,
      rawBytes: exchange.rx.rawHex.split(' ').map(h => parseInt(h, 16)),
      fields: profile ? parseFrame(profile, exchange.rx.rawHex.split(' ').map(h => parseInt(h, 16))) || [] : []
  } : null;

  const renderFieldTable = (frame: any, label: string, colorClass: string) => (
    <div className="flex-1 flex flex-col min-h-0 border border-gray-800 rounded-lg overflow-hidden bg-gray-900/20 shadow-inner">
      <div className={`px-3 py-2 border-b border-gray-800 bg-gray-900/80 flex items-center justify-between`}>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${colorClass}`}>{label}</span>
        <span className="text-[9px] font-mono text-gray-600">{frame.rawHex.split(' ').length}B</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse font-mono text-[10px]">
           <thead className="sticky top-0 bg-gray-900 z-10">
             <tr className="text-gray-600 border-b border-gray-800">
               <th className="p-2 w-24">Field</th>
               <th className="p-2 w-16">Hex</th>
               <th className="p-2 w-16">Dec</th>
               <th className="p-2 w-8"></th>
             </tr>
           </thead>
           <tbody className="divide-y divide-gray-800/50">
             {frame.fields.map((f: any) => {
               const isWatched = state.watchlist.includes(f.name);
               return (
                 <tr key={f.name} className="hover:bg-white/5 transition-colors group">
                   <td className="p-2 text-gray-500 font-bold">{f.name}</td>
                   <td className="p-2 text-blue-500">{f.hex}</td>
                   <td className="p-2 text-emerald-500">{f.decimal}</td>
                   <td className="p-2">
                     <button 
                        onClick={() => toggleWatchlist(f.name)}
                        className={`transition-colors ${isWatched ? 'text-yellow-500' : 'text-gray-800 hover:text-gray-600'}`}
                     >
                       <Pin size={10} />
                     </button>
                   </td>
                 </tr>
               );
             })}
           </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-950 border-l border-gray-800 animate-in slide-in-from-right duration-300 shadow-2xl relative z-50">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-blue-500" />
          <div className="flex flex-col">
            <h2 className="text-xs font-bold text-gray-100 uppercase tracking-widest font-mono">Packet Dissector</h2>
            <div className={`text-[9px] uppercase font-bold font-mono ${exchange.isLoopbackMatch ? 'text-emerald-500' : 'text-amber-500'}`}>
                {exchange.isLoopbackMatch ? 'Loopback Integrity OK' : 'Analysis Mode'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button 
            onClick={() => {
                const primaryFrame = txFrame || rxFrame;
                if (primaryFrame) saveSnapshot(primaryFrame as any);
            }}
            className="p-1.5 text-gray-500 hover:text-emerald-400 transition-colors bg-gray-900 border border-gray-800 rounded shadow-lg"
            title="Snapshot Al"
           >
             <Camera size={14} />
           </button>
           <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white transition-colors bg-gray-900 border border-gray-800 rounded shadow-lg">
             <X size={14} />
           </button>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-3 min-h-0 overflow-hidden bg-gray-950/50">
        {/* Comparison Row */}
        <div className="flex gap-2 h-1/2 min-h-0">
            {txFrame && renderFieldTable(txFrame, 'Master TX', 'text-blue-400')}
            {rxFrame && renderFieldTable(rxFrame, 'Slave RX', 'text-emerald-400')}
        </div>

        {/* Bit-Level Analysis */}
        <div className="flex-1 min-h-0 flex flex-col bg-black/60 border border-gray-800 rounded-lg p-3 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest font-mono">Binary Diff Analysis</span>
                {!exchange.isLoopbackMatch && txFrame && rxFrame && (
                    <span className="text-[9px] font-bold text-red-500 animate-pulse bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">INTEGRITY FAILURE</span>
                )}
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[9px] text-gray-500 custom-scrollbar">
                {txFrame && (
                    <div className="mb-4">
                        <div className="text-blue-500/60 mb-1.5 flex items-center gap-2 border-b border-blue-900/30 pb-1 text-[8px] font-bold uppercase tracking-tighter">
                            <ArrowUp size={10} /> Master Data Stream
                        </div>
                        <div className="grid grid-cols-5 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
                            {txFrame.rawBytes.map((b: number, i: number) => (
                                <div key={i} className="flex flex-col items-center p-1.5 bg-blue-900/5 border border-blue-900/10 rounded">
                                    <span className="text-blue-400 font-bold mb-1">{b.toString(16).toUpperCase().padStart(2, '0')}</span>
                                    <span className="text-[7px] opacity-40 leading-none">{b.toString(2).padStart(8, '0')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {rxFrame && (
                    <div>
                        <div className="text-emerald-500/60 mb-1.5 flex items-center gap-2 border-b border-emerald-900/30 pb-1 text-[8px] font-bold uppercase tracking-tighter">
                            <ArrowDown size={10} /> Slave Data Stream
                        </div>
                        <div className="grid grid-cols-5 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
                            {rxFrame.rawBytes.map((b: number, i: number) => {
                                const txByte = txFrame?.rawBytes[i];
                                const isMismatch = txByte !== undefined && txByte !== b;
                                return (
                                    <div key={i} className={`flex flex-col items-center p-1.5 rounded border ${isMismatch ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'bg-emerald-900/5 border-emerald-900/10'}`}>
                                        <span className={`font-bold mb-1 ${isMismatch ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {b.toString(16).toUpperCase().padStart(2, '0')}
                                        </span>
                                        <span className="text-[7px] opacity-40 leading-none">{b.toString(2).padStart(8, '0')}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
});

PacketInspector.displayName = 'PacketInspector';

export default PacketInspector;
