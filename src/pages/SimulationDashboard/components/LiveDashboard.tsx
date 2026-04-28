import React, { memo } from 'react';
import { useSimulation } from '../../../hooks/useSimulation';
import { LayoutDashboard, X, Activity, TrendingUp, Gauge as GaugeIcon } from 'lucide-react';
import type { GeneratedFrame } from '../../../types';

interface LiveDashboardProps {
    onSelectSnapshot?: (frame: GeneratedFrame | null) => void;
    selectedSnapshotId?: number | null;
}

const LiveDashboard = memo(({ onSelectSnapshot, selectedSnapshotId }: LiveDashboardProps) => {
  const { state, removeWidget, deleteSnapshot } = useSimulation();
  const { dashboardLayout, lastFrame } = state;
  const widgets = dashboardLayout?.widgets || [];

  if (widgets.length === 0 && state.snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-gray-900/20 border border-dashed border-gray-800 rounded-2xl m-4">
        <LayoutDashboard size={48} className="text-gray-800 mb-4" />
        <h3 className="text-gray-400 font-mono text-sm font-bold uppercase tracking-widest mb-2">HUD Empty</h3>
        <p className="text-gray-600 text-xs font-mono max-w-[200px]">
          Pin fields from the Dissector to populate your live telemetry HUD.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-950/40 border-l border-gray-800/50 backdrop-blur-sm overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/40">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-500/10 rounded-lg">
            <Activity size={16} className="text-blue-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-gray-200 text-xs font-bold font-mono">TELEMETRY HUD</span>
            <span className="text-gray-600 text-[9px] font-mono uppercase tracking-widest">Active Systems Monitor</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Widgets Section */}
        {widgets.length > 0 && (
            <div className="space-y-3">
                <h3 className="text-[9px] text-gray-600 font-mono uppercase tracking-widest px-1">Active Watchers</h3>
                {widgets.map((widget) => {
                const fieldData = lastFrame?.fields.find(f => f.name.toLowerCase() === widget.fieldId.toLowerCase());
                const value = fieldData?.decimal ?? 0;
                const color = (widget.config?.color as string) || '#3b82f6';
                
                return (
                    <div key={widget.id} className="bg-gray-900/60 border border-gray-800/50 rounded-xl p-3 shadow-lg group relative overflow-hidden transition-all hover:border-gray-700/50">
                        <div className="flex justify-between items-center mb-2 relative z-10">
                            <div className="flex items-center gap-2">
                                <div className="text-[10px] text-gray-500 font-mono uppercase tracking-widest flex items-center gap-1.5">
                                    {widget.type === 'gauge' && <GaugeIcon size={10} className="text-amber-500" />}
                                    {widget.type === 'led' && <TrendingUp size={10} className="text-emerald-500" />}
                                    {widget.fieldId}
                                </div>
                            </div>
                            <button 
                                onClick={() => removeWidget(widget.id)}
                                className="p-1 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <X size={12} />
                            </button>
                        </div>
                        
                        <div className="flex justify-between items-end relative z-10">
                            <span className="text-xl font-mono font-bold tracking-tighter" style={{ color }}>
                                {fieldData ? value.toLocaleString() : '--'}
                            </span>
                            <div className="flex flex-col items-end">
                                <span className="text-[8px] font-mono text-gray-600 uppercase">{widget.type} mode</span>
                                <div className="w-12 h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                                     <div className="h-full bg-current transition-all duration-300" style={{ width: `${Math.min(100, (value/255)*100)}%`, color }} />
                                </div>
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
         Active Watchers: {state.watchlist.length} | Snapshots: {state.snapshots.length}
      </div>
    </div>
  );
});

LiveDashboard.displayName = 'LiveDashboard';

export default LiveDashboard;
