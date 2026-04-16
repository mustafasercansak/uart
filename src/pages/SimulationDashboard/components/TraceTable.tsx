import React, { memo, useMemo } from 'react';
import { Search, Filter, ArrowDown, ArrowUp, Activity, Terminal } from 'lucide-react';
import type { Exchange } from '../../../types';

interface TraceTableProps {
  exchanges: Exchange[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  displayFilter: string;
}

const TraceTable = memo(({ exchanges, selectedId, onSelect, displayFilter }: TraceTableProps) => {
  
  const filteredExchanges = useMemo(() => {
    if (!displayFilter) return exchanges;
    const filter = displayFilter.toLowerCase();
    return exchanges.filter(ex => {
      const txMatch = ex.tx?.rawHex.toLowerCase().includes(filter);
      const rxMatch = ex.rx?.rawHex.toLowerCase().includes(filter);
      const errMatch = ex.tx?.status === 'fail' || ex.rx?.status === 'fail';
      return txMatch || rxMatch || (filter === 'error' && errMatch);
    });
  }, [exchanges, displayFilter]);

  return (
    <div className="flex flex-col h-full bg-gray-950/20 border border-gray-800/50 rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm">
      {/* Table Header / Toolbar */}
      <div className="p-3 bg-gray-900/40 border-b border-gray-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
            <Terminal size={14} className="text-blue-400" />
            <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest">Live Trace Stream</span>
            <div className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-mono">
                {filteredExchanges.length} PACKETS
            </div>
        </div>
        
        <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                <input 
                    type="text"
                    placeholder="Filter packets (hex, error, status...)"
                    className="w-full bg-black/40 border border-gray-800 rounded-lg py-1 pl-8 pr-3 text-[11px] font-mono text-gray-300 focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-gray-700"
                    value={displayFilter}
                    readOnly // Managed by parent for now
                />
            </div>
            <button className="p-1.5 text-gray-500 hover:text-white transition-colors bg-gray-800/50 rounded-lg border border-gray-700/30">
                <Filter size={14} />
            </button>
        </div>
      </div>

      {/* Actual Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <table className="w-full text-left border-collapse table-fixed">
          <thead className="sticky top-0 z-20 bg-gray-900 shadow-md">
            <tr className="text-[10px] font-mono text-gray-500 uppercase border-b border-gray-800">
              <th className="p-3 w-16">No.</th>
              <th className="p-3 w-28">Time</th>
              <th className="p-3 w-24">Source</th>
              <th className="p-3 w-20">Size</th>
              <th className="p-3 w-20 text-center">Status</th>
              <th className="p-3">Info / Data Stream</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-900/50 font-mono text-[11px]">
            {filteredExchanges.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-20 text-center text-gray-700 italic">
                  <div className="flex flex-col items-center gap-3">
                    <Activity size={32} className="opacity-20 animate-pulse" />
                    <span>No traffic detected matching current filter...</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredExchanges.map((ex, idx) => {
                const isSelected = selectedId === ex.id;
                const time = new Date(ex.startTime).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + (ex.startTime % 1000).toString().padStart(3, '0');
                const hasError = ex.tx?.status === 'fail' || ex.rx?.status === 'fail' || !ex.isLoopbackMatch;

                return (
                  <tr 
                    key={ex.id}
                    onClick={() => onSelect(ex.id)}
                    className={`cursor-pointer group transition-all ${
                      isSelected 
                        ? 'bg-blue-500/10 border-l-4 border-l-blue-500' 
                        : hasError ? 'bg-red-500/5 hover:bg-red-500/10 border-l-4 border-l-red-500/50' : 'hover:bg-white/5 border-l-4 border-l-transparent'
                    }`}
                  >
                    <td className="p-3 text-gray-600 tabular-nums">{idx + 1}</td>
                    <td className="p-3 text-gray-400 tabular-nums">{time}</td>
                    <td className="p-3">
                       <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border ${
                         ex.tx ? 'bg-blue-900/20 border-blue-500/20 text-blue-400' : 'bg-emerald-900/20 border-emerald-500/20 text-emerald-400'
                       }`}>
                         {ex.tx ? 'TX Master' : 'RX Slave'}
                       </span>
                    </td>
                    <td className="p-3 text-gray-500">{(ex.tx?.rawHex.split(' ').length || ex.rx?.rawHex.split(' ').length || 0)}B</td>
                    <td className="p-3 text-center">
                       <div className="flex justify-center">
                         {ex.isLoopbackMatch ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                         ) : hasError ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                         ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                         )}
                       </div>
                    </td>
                    <td className="p-3">
                       <div className="flex items-center gap-3 overflow-hidden">
                          <span className="text-gray-200 truncate group-hover:text-white transition-colors">
                            {ex.tx?.rawHex || ex.rx?.rawHex}
                          </span>
                          {ex.latencyMs !== undefined && (
                            <span className="shrink-0 text-[10px] text-gray-600 italic">({ex.latencyMs}ms latency)</span>
                          )}
                       </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="p-2.5 bg-gray-900/60 border-t border-gray-800 flex justify-between items-center text-[10px] font-mono text-gray-500">
        <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>MATCHED</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>MISMATCH / ERROR</span>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <span>BITRATE: <span className="text-gray-300">9600 BAUD</span></span>
            <span>ENCODING: <span className="text-gray-300">8N1</span></span>
        </div>
      </div>
    </div>
  );
});

TraceTable.displayName = 'TraceTable';

export default TraceTable;
