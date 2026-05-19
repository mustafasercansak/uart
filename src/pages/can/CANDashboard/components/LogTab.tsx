import { useEffect, useRef, useState, useMemo } from 'react';
import { Search, Filter, Download, Trash2, X } from 'lucide-react';
import { useTranslation } from '../../../../i18n/context';
import type { CANLogEntry } from '../../../../can/types/CANBusState';

const LOG_COLOR: Record<string, string> = {
  info:        'text-gray-400',
  tx:          'text-green-400',
  rx:          'text-cyan-400',
  error:       'text-red-400',
  arbitration: 'text-purple-400',
  nmt:         'text-yellow-400',
  alarm:       'text-red-300',
};

interface LogTabProps {
  entries: CANLogEntry[];
}

export function LogTab({ entries }: LogTabProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(entries.length);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Set<string>>(new Set(['info', 'tx', 'rx', 'error', 'arbitration', 'nmt', 'alarm']));

  const toggleFilter = (type: string) => {
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filteredEntries = useMemo(() => {
    return [...entries].reverse().filter(e => {
      if (!filters.has(e.type)) return false;
      if (search && !e.text.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, filters, search]);

  // Scroll to top (newest entry) whenever new entries arrive
  useEffect(() => {
    if (entries.length !== prevLen.current && scrollRef.current && search === '') {
      scrollRef.current.scrollTop = 0;
    }
    prevLen.current = entries.length;
  }, [entries.length, search]);

  const handleExport = () => {
    if (filteredEntries.length === 0) return;
    const lines = filteredEntries.map(e => `[${e.time}] [${e.type.toUpperCase()}] ${e.text}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `can_log_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full font-mono text-[11px] bg-gray-950">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-800 bg-gray-900/50 shrink-0">
        <div className="relative flex-1 min-w-[120px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder={t('dashboard.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 rounded pl-7 pr-2 py-1 text-[10px] text-gray-200 focus:border-cyan-700 outline-none transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              <X size={10} />
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-gray-500 mr-1" />
          {Object.keys(LOG_COLOR).map(type => (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider transition-all border ${
                filters.has(type) 
                  ? `bg-gray-800 ${LOG_COLOR[type].replace('text-', 'border-').replace('400', '800').replace('300', '800')} ${LOG_COLOR[type]}` 
                  : 'bg-transparent border-transparent text-gray-600 hover:bg-gray-800'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1 border-l border-gray-800 pl-2">
          <button onClick={handleExport} className="p-1 text-gray-500 hover:text-cyan-400 hover:bg-gray-800 rounded transition-all" title={t('can.exportTxt')}>
            <Download size={13} />
          </button>
        </div>
      </div>

      <div className="px-3 py-1 bg-gray-950 text-gray-600 text-[9px] border-b border-gray-800 uppercase tracking-widest flex items-center justify-between shrink-0">
        <span>{t('can.log')}</span>
        <span className="text-gray-500 normal-case">{filteredEntries.length} / {entries.length} {t('can.entries')}</span>
      </div>

      {/* Log list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {filteredEntries.map((entry, i) => (
          <div key={i} className={`flex gap-3 px-3 py-1 border-b border-gray-900/40 hover:bg-gray-900/20 transition-colors ${LOG_COLOR[entry.type] ?? 'text-gray-400'}`}>
            <span className="text-gray-600 tabular-nums shrink-0">{entry.time}</span>
            <span className="break-all">{entry.text}</span>
          </div>
        ))}
        {filteredEntries.length === 0 && (
          <div className="p-4 text-center text-gray-600 italic">{t('can.noLogsMatchTheC')}</div>
        )}
      </div>
    </div>
  );
}
