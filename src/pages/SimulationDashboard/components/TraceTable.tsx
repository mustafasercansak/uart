import React, { memo, useMemo } from 'react';
import { Search, Filter, ArrowDown, ArrowUp, Activity, Terminal, Repeat, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Exchange, FrameProfile } from '../../../types';
import { FilterEngine } from '../../../engines/FilterEngine';

interface TraceTableProps {
  exchanges: Exchange[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  displayFilter: string;
  onFilterChange: (filter: string) => void;
  profile?: FrameProfile | null;
}

const TraceTable = memo(({ exchanges, selectedId, onSelect, displayFilter, onFilterChange, profile }: TraceTableProps) => {
  
  const filterStatus = useMemo(() => FilterEngine.validate(displayFilter), [displayFilter]);

  const filteredExchanges = useMemo(() => {
    if (!displayFilter) return exchanges;
    return exchanges.filter(ex => FilterEngine.evaluate(ex, displayFilter, profile || undefined));
  }, [exchanges, displayFilter, profile]);

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
        
        <div className="flex items-center gap-2 flex-1 max-w-lg">
            <div className="relative flex-1 group">
                <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 transition-colors ${
                    !displayFilter ? 'text-gray-600' : (filterStatus.isValid ? 'text-emerald-500' : 'text-rose-500')
                }`} />
                <input 
                    type="text"
                    placeholder="Filter: bpm > 100 && status == ok | id == 0x01 | contains 'FF'..."
                    className={`w-full bg-black/60 border rounded-lg py-1.5 pl-8 pr-12 text-[11px] font-mono transition-all placeholder:text-gray-700 focus:outline-none focus:ring-1 ${
                        !displayFilter 
                        ? 'border-gray-800 text-gray-300 focus:border-blue-500/50 focus:ring-blue-500/20' 
                        : (filterStatus.isValid 
                            ? 'border-emerald-500/30 text-emerald-100 bg-emerald-500/5 focus:border-emerald-500/50 focus:ring-emerald-500/20' 
                            : 'border-rose-500/30 text-rose-100 bg-rose-500/5 focus:border-rose-500/50 focus:ring-rose-500/20')
                    }`}
                    value={displayFilter}
                    onChange={(e) => onFilterChange(e.target.value)}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {displayFilter && (
                        filterStatus.isValid 
                        ? <CheckCircle2 size={12} className="text-emerald-500/50" /> 
                        : <AlertCircle size={12} className="text-rose-500/50" />
                    )}
                </div>
            </div>
            <button className={`p-2 transition-all rounded-lg border ${
                filterStatus.isValid ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-gray-800/50 border-gray-700/30 text-gray-500'
            }`}>
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
                const hasError = (ex.tx?.status === 'fail' || ex.rx?.status === 'fail' || (ex.tx && ex.rx && !ex.isLoopbackMatch)) && !ex.isLoopbackMatch;

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
                    {/* Status Dot */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center">
                        {ex.isLoopbackMatch ? (
                            <div className="flex items-center gap-1.5 text-emerald-400" title="Loopback Perfect Match">
                                <Repeat size={12} className="animate-pulse" />
                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            </div>
                        ) : (
                            <div 
                                className={`w-2 h-2 rounded-full ${
                                    (ex.tx && ex.rx) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                                    (ex.tx || ex.rx) ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-gray-800'
                                }`}
                            />
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
