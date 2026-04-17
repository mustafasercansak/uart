import React, { memo } from 'react';
import { ArrowRight, ArrowLeft, Clock } from 'lucide-react';
import type { GeneratedFrame } from '../../../types';

interface TimelineProps {
  exchanges: any[];
  onSelectFrame: (frame: GeneratedFrame) => void;
}

const Timeline = memo(({ exchanges, onSelectFrame }: TimelineProps) => {
  // Take last 50 exchanges for performance
  const displayExchanges = exchanges.slice(-50);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-gray-950/20">
      <div className="shrink-0 px-6 py-3 border-b border-gray-800/50 flex justify-between items-center bg-gray-900/40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-gray-300">TX (System)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-gray-300">RX (Device)</span>
          </div>
        </div>
        <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest bg-gray-950 px-2 py-1 rounded">
          Son {displayExchanges.length} İletişim Akışı
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2 relative">
        {/* Central Spine */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-800/50 -translate-x-1/2" />

        {displayExchanges.map((ex, idx) => {
          const prevEx = idx > 0 ? displayExchanges[idx - 1] : null;
          const delta = prevEx ? ex.timestamp - prevEx.timestamp : 0;
          
          return (
            <div key={ex.id} className="relative py-2">
              {/* Delta Time */}
              {delta > 0 && (
                <div className="flex justify-center mb-2">
                  <div className="flex items-center gap-1 bg-gray-900/80 border border-gray-800 px-2 py-0.5 rounded-full z-10">
                    <Clock size={10} className="text-gray-500" />
                    <span className="text-[8px] font-mono text-gray-400">+{delta}ms</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between group">
                {/* TX Side */}
                <div className="flex-1 flex justify-end pr-8">
                  {ex.tx && (
                    <button 
                      onClick={() => onSelectFrame({ 
                        frameNumber: 0, 
                        timestampMs: ex.timestamp, 
                        rawHex: ex.tx.rawHex, 
                        rawBytes: ex.tx.rawHex.split(' ').map((h: string) => parseInt(h, 16)),
                        fields: [],
                        errors: []
                      } as any)}
                      className="bg-blue-900/20 border border-blue-800/50 hover:border-blue-500/50 p-3 rounded-xl transition-all hover:bg-blue-900/40 text-left max-w-[240px] relative group"
                    >
                      <div className="text-[8px] font-mono font-black text-blue-400 mb-1 uppercase tracking-tighter opacity-60">TX OUT</div>
                      <div className="text-[10px] font-mono text-blue-100 break-all leading-tight">{ex.tx.rawHex}</div>
                      <div className="absolute top-1/2 -right-8 -translate-y-1/2 text-blue-500 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight size={20} />
                      </div>
                    </button>
                  )}
                </div>

                {/* Central Point */}
                <div className="relative z-10 w-2 h-2 rounded-full bg-gray-800 border border-gray-700 group-hover:scale-125 transition-transform" />

                {/* RX Side */}
                <div className="flex-1 flex justify-start pl-8">
                  {ex.rx && (
                    <button 
                      onClick={() => onSelectFrame({ 
                        frameNumber: 0, 
                        timestampMs: ex.timestamp, 
                        rawHex: ex.rx.rawHex, 
                        rawBytes: ex.rx.rawHex.split(' ').map((h: string) => parseInt(h, 16)),
                        fields: [],
                        errors: []
                      } as any)}
                      className="bg-emerald-900/20 border border-emerald-800/50 hover:border-emerald-500/50 p-3 rounded-xl transition-all hover:bg-emerald-900/40 text-left max-w-[240px] relative group"
                    >
                      <div className="text-[8px] font-mono font-black text-emerald-400 mb-1 uppercase tracking-tighter opacity-60">RX IN</div>
                      <div className="text-[10px] font-mono text-emerald-100 break-all leading-tight">{ex.rx.rawHex}</div>
                      <div className="absolute top-1/2 -left-8 -translate-y-1/2 text-emerald-500 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowLeft size={20} />
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {displayExchanges.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4 opacity-30">
             <div className="w-16 h-16 border-4 border-dashed border-gray-800 rounded-full animate-spin-slow" />
             <span className="text-[10px] font-mono uppercase tracking-[0.3em]">İletişim bekleniyor</span>
          </div>
        )}
      </div>
    </div>
  );
});

Timeline.displayName = 'Timeline';
export default Timeline;
