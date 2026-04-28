import React, { memo } from 'react';
import { ArrowRight, ArrowLeft, Clock, WifiOff, Trash2 } from 'lucide-react';
import type { GeneratedFrame, Exchange } from '../../../types';
import { useTranslation } from '../../../i18n/context';

interface TimelineProps {
  exchanges: Exchange[];
  onSelectFrame: (frame: GeneratedFrame) => void;
  onClear?: () => void;
  hasRealDevice?: boolean; // serial veya network bağlı mı?
}

const Timeline = memo(({ exchanges, onSelectFrame, onClear, hasRealDevice = false }: TimelineProps) => {
  const { t } = useTranslation();
  const displayExchanges = exchanges.slice(-50);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-gray-950/20">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-800/50 flex justify-between items-center bg-gray-900/40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-gray-300">TX (Sistem)</span>
          </div>
          {hasRealDevice && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] font-mono font-black uppercase tracking-wider text-gray-300">RX (Cihaz)</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!hasRealDevice && (
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-yellow-600/80 bg-yellow-950/30 border border-yellow-900/30 px-2 py-1 rounded">
              <WifiOff size={10} />
              {t('timeline.noRealDevice')}
            </div>
          )}
          <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest bg-gray-950 px-2 py-1 rounded">
            Son {displayExchanges.length} frame
          </div>
          {onClear && (
            <button
              onClick={onClear}
              className="p-1 text-gray-500 hover:text-rose-500 transition-colors flex items-center gap-1.5 bg-gray-950 px-1.5 py-1 rounded group/clear"
              title={t('timeline.clear')}
            >
              <Trash2 size={10} className="group-hover/clear:scale-110 transition-transform" />
              <span className="text-[9px] font-mono font-black uppercase tracking-widest">{t('timeline.clear')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2 relative">
        {/* Spine — yalnızca iki taraflı modda ortada, tek taraflıda solda */}
        <div
          className={`absolute top-0 bottom-0 w-px bg-gray-800/50 ${
            hasRealDevice ? 'left-1/2 -translate-x-1/2' : 'left-8'
          }`}
        />

        {displayExchanges.map((ex, idx) => {
          const prevEx = idx > 0 ? displayExchanges[idx - 1] : null;
          const delta = prevEx ? (ex.startTime - prevEx.startTime) : 0;

          return (
            <div key={ex.id} className="relative py-1.5">
              {/* Delta Time */}
              {delta > 5 && (
                <div className={`flex mb-1 ${hasRealDevice ? 'justify-center' : 'justify-start pl-12'}`}>
                  <div className="flex items-center gap-1 bg-gray-900/80 border border-gray-800 px-2 py-0.5 rounded-full z-10">
                    <Clock size={9} className="text-gray-600" />
                    <span className="text-[8px] font-mono text-gray-500">+{delta}ms</span>
                  </div>
                </div>
              )}

              <div className={`flex items-center group ${hasRealDevice ? 'justify-between' : 'justify-start pl-12'}`}>
                {/* TX Side */}
                <div className={hasRealDevice ? 'flex-1 flex justify-end pr-8' : ''}>
                  {ex.tx && (
                    <button
                      onClick={() => onSelectFrame({
                        uId: ex.id,
                        frameNumber: 0,
                        timestampMs: ex.startTime,
                        rawHex: ex.tx?.rawHex || '',
                        rawBytes: (ex.tx?.rawHex || '').split(' ').map((h: string) => parseInt(h, 16)),
                        fields: [],
                        errors: [],
                      } as unknown as GeneratedFrame)}
                      className="bg-blue-900/20 border border-blue-800/50 hover:border-blue-500/50 p-2.5 rounded-xl transition-all hover:bg-blue-900/40 text-left max-w-[280px] relative group/btn"
                    >
                      <div className="text-[8px] font-mono font-black text-blue-400 mb-1 uppercase tracking-tighter opacity-60">TX OUT</div>
                      <div className="text-[10px] font-mono text-blue-100 break-all leading-tight">{ex.tx.rawHex}</div>
                      {hasRealDevice && (
                        <div className="absolute top-1/2 -right-8 -translate-y-1/2 text-blue-500 opacity-0 group-hover/btn:opacity-100 transition-opacity">
                          <ArrowRight size={18} />
                        </div>
                      )}
                    </button>
                  )}
                </div>

                {/* Central dot — sadece iki taraflı modda */}
                {hasRealDevice && (
                  <div className="relative z-10 w-2 h-2 rounded-full bg-gray-800 border border-gray-700 group-hover:scale-125 transition-transform shrink-0" />
                )}

                {/* RX Side — sadece gerçek cihaz varsa */}
                {hasRealDevice && (
                  <div className="flex-1 flex justify-start pl-8">
                    {ex.rx && (
                      <button
                        onClick={() => onSelectFrame({
                          uId: ex.id + '-rx',
                          frameNumber: 0,
                          timestampMs: ex.rx?.timestamp || ex.startTime || 0,
                          rawHex: ex.rx?.rawHex || '',
                          rawBytes: (ex.rx?.rawHex || '').split(' ').map((h: string) => parseInt(h, 16)),
                          fields: [],
                          errors: [],
                        } as unknown as GeneratedFrame)}
                        className="bg-emerald-900/20 border border-emerald-800/50 hover:border-emerald-500/50 p-2.5 rounded-xl transition-all hover:bg-emerald-900/40 text-left max-w-[280px] relative group/btn"
                      >
                        <div className="text-[8px] font-mono font-black text-emerald-400 mb-1 uppercase tracking-tighter opacity-60">
                          RX IN
                          {ex.latencyMs != null && (
                            <span className="ml-2 text-gray-500 normal-case">{ex.latencyMs}ms</span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-emerald-100 break-all leading-tight">{ex.rx.rawHex}</div>
                        <div className="absolute top-1/2 -left-8 -translate-y-1/2 text-emerald-500 opacity-0 group-hover/btn:opacity-100 transition-opacity">
                          <ArrowLeft size={18} />
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {displayExchanges.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4 opacity-30">
            <div className="w-16 h-16 border-4 border-dashed border-gray-800 rounded-full animate-spin-slow" />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em]">{t('timeline.waitingComm')}</span>
          </div>
        )}
      </div>
    </div>
  );
});

Timeline.displayName = 'Timeline';
export default Timeline;
