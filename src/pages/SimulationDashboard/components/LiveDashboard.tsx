import React, { memo } from 'react';
import { useSimulation } from '../../../hooks/useSimulation';
import { LayoutDashboard, X, Activity, TrendingUp, Gauge as GaugeIcon } from 'lucide-react';
import type { GeneratedFrame } from '../../../types';

interface LiveDashboardProps {
    onSelectSnapshot?: (frame: GeneratedFrame | null) => void;
    selectedSnapshotId?: number | null;
}

const LiveDashboard = memo(({ onSelectSnapshot, selectedSnapshotId }: LiveDashboardProps) => {
  const { state, toggleWatchlist, deleteSnapshot } = useSimulation();
  const { watchlist, lastFrame } = state;

  if (watchlist.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-gray-900/20 border border-dashed border-gray-800 rounded-2xl m-4">
        <LayoutDashboard size={48} className="text-gray-800 mb-4" />
        <h3 className="text-gray-400 font-mono text-sm font-bold uppercase tracking-widest mb-2">Live Dashboard Empty</h3>
        <p className="text-gray-600 text-xs font-mono max-w-[200px]">
          Pin fields from the Inspector to track them here in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-950/40 border-l border-gray-800/50 backdrop-blur-sm overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/40">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg">
            <Activity size={16} className="text-emerald-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-gray-200 text-xs font-bold font-mono">LIVE WATCH</span>
            <span className="text-gray-600 text-[9px] font-mono uppercase tracking-widest">Real-time Telemetry</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Watchlist Section */}
        {watchlist.length > 0 && (
            <div className="space-y-4">
               <h3 className="text-[9px] text-gray-600 font-mono uppercase tracking-widest px-1">Monitored Fields</h3>
               {watchlist.map((fieldName) => {
                const fieldData = lastFrame?.fields.find(f => f.name === fieldName);
                const value = fieldData?.decimal ?? 0;
                
                return (
                    <div key={fieldName} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 shadow-lg group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors" />
                    
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">{fieldName}</span>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-2xl font-mono font-bold text-white tracking-tighter">
                            {fieldData ? value.toLocaleString() : '--'}
                            </span>
                            <span className="text-[10px] text-gray-600 font-mono">VAL</span>
                        </div>
                        </div>
                        <button 
                        onClick={() => toggleWatchlist(fieldName)}
                        className="p-1 text-gray-700 hover:text-red-400 transition-colors"
                        >
                        <X size={14} />
                        </button>
                    </div>

                    <div className="h-12 flex items-end gap-1 px-1 mt-2 relative z-10">
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500 ease-out"
                                style={{ width: `${Math.min(100, (value / 255) * 100)}%` }}
                            />
                        </div>
                    </div>
                    </div>
                );
                })}
            </div>
        )}

        {/* Snapshots Section */}
        {state.snapshots.length > 0 && (
            <div className="space-y-4 mt-8">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">Snapshot Library</h3>
                    <div className="px-1.5 py-0.5 bg-blue-500/10 rounded text-blue-400 text-[9px] font-mono">{state.snapshots.length}</div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {state.snapshots.map((snap) => {
                        const isSelected = selectedSnapshotId === snap.frameNumber;
                        return (
                            <div 
                                key={snap.frameNumber} 
                                onClick={() => onSelectSnapshot?.(isSelected ? null : snap)}
                                className={`bg-gray-900/40 border rounded-lg p-3 hover:border-blue-500/50 transition-all group cursor-pointer ${
                                    isSelected ? 'border-blue-500 bg-blue-500/10' : 'border-gray-800/50'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <span className={`text-[10px] font-mono font-bold ${isSelected ? 'text-blue-400' : 'text-white'}`}>
                                            FRAME #{snap.frameNumber}
                                        </span>
                                        <span className="text-[9px] text-gray-600 font-mono">{new Date(snap.timestampMs).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteSnapshot(snap.frameNumber);
                                            }}
                                            className="p-1 text-gray-700 hover:text-red-400"
                                         >
                                            <X size={12} />
                                         </button>
                                    </div>
                                </div>
                                <div className="mt-2 font-mono text-[9px] text-gray-500 truncate">
                                    {snap.rawHex}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-800 bg-gray-950/60 text-[9px] font-mono text-gray-700 text-center uppercase tracking-widest">
         Active Watchers: {watchlist.length} | Snapshots: {state.snapshots.length}
      </div>
    </div>
  );
});

LiveDashboard.displayName = 'LiveDashboard';

export default LiveDashboard;
