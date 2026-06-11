import React, { memo, useState, useMemo } from 'react';
import { ArrowRight, Zap, Send, LogIn } from 'lucide-react';
import type { ConversationEntry } from '../../../types';
import { useTranslation } from '../../../i18n/context';

type FilterType = 'all' | 'rx' | 'tx' | 'match';

interface ConversationMonitorProps {
  entries: ConversationEntry[];
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

const ConversationMonitor = memo(({ entries }: ConversationMonitorProps) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter(e => e.type === filter);
  }, [entries, filter]);

  const counts = useMemo(() => ({
    rx: entries.filter(e => e.type === 'rx').length,
    tx: entries.filter(e => e.type === 'tx').length,
    match: entries.filter(e => e.type === 'match').length,
  }), [entries]);

  const filterButtons: { key: FilterType; label: string; color: string; activeColor: string }[] = [
    { key: 'all', label: `${t('conversationMonitor.filterAll')} (${entries.length})`, color: 'border-gray-700 text-gray-500', activeColor: 'border-gray-400 text-gray-200 bg-gray-800' },
    { key: 'rx', label: `RX (${counts.rx})`, color: 'border-blue-900 text-blue-700', activeColor: 'border-blue-500 text-blue-300 bg-blue-950/40' },
    { key: 'tx', label: `TX (${counts.tx})`, color: 'border-emerald-900 text-emerald-700', activeColor: 'border-emerald-500 text-emerald-300 bg-emerald-950/40' },
    { key: 'match', label: `${t('conversationMonitor.filterMatch')} (${counts.match})`, color: 'border-yellow-900 text-yellow-700', activeColor: 'border-yellow-500 text-yellow-300 bg-yellow-950/40' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-950 border-t border-gray-800/50">
      <div className="p-3 border-b border-gray-800 bg-gray-900/50 flex items-center gap-3 flex-wrap">
        <Zap size={14} className="text-yellow-500 shrink-0" />
        <span className="text-xs font-mono uppercase tracking-widest text-gray-400 shrink-0">{t('conversationMonitor.title')}</span>
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {filterButtons.map(btn => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border transition-all ${filter === btn.key ? btn.activeColor : btn.color}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {filtered.length === 0 && (
          <div className="text-center py-10 opacity-30">
            <Activity size={40} className="mx-auto mb-2" />
            <p className="text-[10px] font-mono">{entries.length === 0 ? t('conversationMonitor.waitingTraffic') : t('conversationMonitor.noMatchFilter')}</p>
          </div>
        )}

        {filtered.map((entry) => (
          <div key={entry.id} className="animate-in slide-in-from-left-2 duration-300">
            {entry.type === 'rx' && (
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 bg-blue-500/10 rounded border border-blue-500/20 text-blue-400">
                  <LogIn size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono font-bold text-blue-500 uppercase tracking-tighter">{t('conversationMonitor.incoming')}</span>
                    <span className="text-[9px] font-mono text-gray-400">{fmtTime(entry.timestamp)}</span>
                  </div>
                  <div className="bg-blue-900/10 p-2 rounded-lg border border-blue-500/10 font-mono text-[11px] break-all">
                    {entry.details ? (
                      <>
                        <span className="text-blue-100">{entry.details}</span>
                        <div className="text-blue-500/40 text-[9px] mt-1 leading-relaxed">{entry.rawHex}</div>
                      </>
                    ) : (
                      <span className="text-blue-100">{entry.rawHex}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {entry.type === 'match' && (
              <div className="flex items-start gap-3 ml-6">
                <div className="mt-1 p-1 bg-yellow-500/10 rounded border border-yellow-500/20 text-yellow-400">
                  <Zap size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono font-bold text-yellow-500 uppercase tracking-tighter">{t('conversationMonitor.ruleTriggered')}</span>
                    <span className="text-[9px] font-mono text-gray-400">{fmtTime(entry.timestamp)}</span>
                  </div>
                  <div className="bg-yellow-900/10 px-2 py-1 rounded-md border border-yellow-500/10 font-mono text-[10px] text-yellow-200">
                    {entry.details}
                  </div>
                </div>
              </div>
            )}

            {entry.type === 'tx' && (
              <div className="flex items-start gap-3 ml-12">
                <div className="mt-1 p-1 bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-400">
                  <Send size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono font-bold text-emerald-500 uppercase tracking-tighter">{t('conversationMonitor.autoResponse')}</span>
                    <span className="text-[9px] font-mono text-gray-400">{fmtTime(entry.timestamp)}</span>
                  </div>
                  <div className="bg-emerald-900/10 p-2 rounded-lg border border-emerald-500/10 font-mono text-[10px] text-emerald-100 break-all">
                    {entry.rawHex}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

ConversationMonitor.displayName = 'ConversationMonitor';

export default ConversationMonitor;

import { Activity } from 'lucide-react';
