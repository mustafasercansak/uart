import React, { memo } from 'react';
import { ArrowRight, Zap, Send, LogIn } from 'lucide-react';
import type { ConversationEntry } from '../../../types';

interface ConversationMonitorProps {
  entries: ConversationEntry[];
}

const ConversationMonitor = memo(({ entries }: ConversationMonitorProps) => {
  return (
    <div className="flex flex-col h-full bg-gray-950 border-t border-gray-800/50">
      <div className="p-3 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2">
        <Zap size={14} className="text-yellow-500" />
        <span className="text-xs font-mono uppercase tracking-widest text-gray-400">Canlı Karşılaşma Günlüğü</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {entries.length === 0 && (
          <div className="text-center py-10 opacity-30">
            <Activity size={40} className="mx-auto mb-2" />
            <p className="text-[10px] font-mono">Trafik bekleniyor...</p>
          </div>
        )}
        
        {entries.map((entry) => (
          <div key={entry.id} className="animate-in slide-in-from-left-2 duration-300">
            {entry.type === 'rx' && (
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 bg-blue-500/10 rounded border border-blue-500/20 text-blue-400">
                  <LogIn size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono font-bold text-blue-500 uppercase tracking-tighter">Gelen Paket</span>
                    <span className="text-[8px] font-mono text-gray-600">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="bg-blue-900/10 p-2 rounded-lg border border-blue-500/10 font-mono text-[11px] text-blue-100 break-all">
                    {entry.rawHex}
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
                    <span className="text-[9px] font-mono font-bold text-yellow-500 uppercase tracking-tighter">Kural Tetiklendi</span>
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
                    <span className="text-[9px] font-mono font-bold text-emerald-500 uppercase tracking-tighter">Otomatik Yanıt</span>
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
