import React, { memo, useMemo } from 'react';
import { Search, Filter, Activity, Terminal, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Exchange, FrameProfile } from '../../../types';
import { FilterEngine } from '../../../engines/FilterEngine';
import { useTranslation } from '../../../i18n/context';

function isPrintable(b: number) { return b >= 0x20 && b <= 0x7e; }
function toAsciiChar(b: number): string {
  if (b === 0x0a) return '↵';
  if (b === 0x0d) return '␍';
  if (isPrintable(b)) return String.fromCharCode(b);
  return '·';
}
function isAllText(bytes: number[]): boolean {
  return bytes.length > 0 && bytes.every(b => isPrintable(b) || b === 0x0a || b === 0x0d);
}
function hexToBytes(hex: string): number[] {
  return hex.split(' ').filter(Boolean).map(h => parseInt(h, 16));
}

interface TraceTableProps {
  exchanges: Exchange[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  displayFilter: string;
  onFilterChange: (filter: string) => void;
  profile?: FrameProfile | null;
}

function framingLabel(profile: FrameProfile | null | undefined): string {
  if (!profile) return '';
  const mode = profile.framing?.mode ?? 'fixed';
  if (mode === 'delimiter') {
    const raw = profile.framing.delimiter ?? 0x0a;
    const bytes = Array.isArray(raw) ? raw : [raw];
    const str = bytes.map(b => {
      if (b === 0x0a) return '\\n';
      if (b === 0x0d) return '\\r';
      return `0x${b.toString(16).padStart(2, '0').toUpperCase()}`;
    }).join('');
    return `${str} DELİMİTER`;
  }
  if (mode === 'fixed') {
    const size = profile.fields.reduce((s, f) => s + f.byteWidth, 0);
    return `${size}B SABİT`;
  }
  return mode.toUpperCase();
}

const TraceTable = memo(({ exchanges, selectedId, onSelect, displayFilter, onFilterChange, profile }: TraceTableProps) => {
  const { t } = useTranslation();
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
            <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest">{t('trace.title')}</span>
            <div className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-mono">
                {t('trace.packets', { count: filteredExchanges.length })}
            </div>
        </div>
        
        <div className="flex items-center gap-2 flex-1 max-w-lg">
            <div className="relative flex-1 group">
                <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 transition-colors ${
                    !displayFilter ? 'text-gray-600' : (filterStatus.isValid ? 'text-emerald-500' : 'text-rose-500')
                }`} />
                <input 
                    type="text"
                    placeholder={t('trace.filterPlaceholder')}
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
              <th className="p-3 w-16">{t('trace.headers.no')}</th>
              <th className="p-3 w-28">{t('trace.headers.time')}</th>
              <th className="p-3 w-24">{t('trace.headers.source')}</th>
              <th className="p-3 w-20">{t('trace.headers.size')}</th>
              <th className="p-3">{t('trace.headers.info')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-900/50 font-mono text-[11px]">
            {filteredExchanges.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-20 text-center text-gray-700 italic">
                  <div className="flex flex-col items-center gap-3">
                    <Activity size={32} className="opacity-20 animate-pulse" />
                    <span>{t('trace.noTraffic')}</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredExchanges.map((ex, idx) => {
                const isSelected = selectedId === ex.id;
                const time = new Date(ex.startTime).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + (ex.startTime % 1000).toString().padStart(3, '0');
                const hasError = (ex.tx?.status === 'fail' || ex.rx?.status === 'fail' || (ex.tx && ex.rx && !ex.isLoopbackMatch)) && !ex.isLoopbackMatch;
                const rawHex = ex.tx?.rawHex || ex.rx?.rawHex || '';
                const rawBytes = hexToBytes(rawHex);
                const showAscii = isAllText(rawBytes);

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
                         {ex.tx ? t('trace.source.tx') : t('trace.source.rx')}
                       </span>
                    </td>
                    <td className="p-3 text-gray-500">{rawBytes.length}{t('common.byte').charAt(0).toUpperCase()}</td>
                    <td className="p-3">
                       <div className="flex flex-col gap-0.5 overflow-hidden">
                          <span className="font-mono text-[11px] text-gray-200 truncate group-hover:text-white transition-colors">
                            {rawHex}
                          </span>
                          {showAscii && (
                            <span className="font-mono text-[10px] text-emerald-400/70 truncate">
                              {rawBytes.map(toAsciiChar).join('')}
                            </span>
                          )}
                          {ex.latencyMs !== undefined && (
                            <span className="text-[10px] text-gray-600 italic">({t('trace.latency', { ms: ex.latencyMs })})</span>
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
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span>{t('trace.source.tx')}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>{t('trace.source.rx')}</span>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <span>{t('trace.bitrate')} <span className="text-gray-300">{profile?.baudRate?.toLocaleString() ?? '–'} BAUD</span></span>
            {profile && (
              <span className="px-2 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400 font-black tracking-wider">
                {profile.name} · {framingLabel(profile)}
              </span>
            )}
        </div>
      </div>
    </div>
  );
});

TraceTable.displayName = 'TraceTable';

export default TraceTable;
