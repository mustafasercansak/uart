import React, { memo } from 'react';
import { RefreshCw, ArrowRight, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { Exchange } from '../../../types';
import { useTranslation } from '../../../i18n/context';

interface ExchangeMonitorProps {
  exchanges: Exchange[];
  isLoopbackMode?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
}

const ExchangeMonitor = memo(({ exchanges, isLoopbackMode = true, selectedId, onSelect }: ExchangeMonitorProps) => {
  const { t } = useTranslation();

  const renderHexWithDiff = (txHex: string, rxHex: string) => {
    const txBytes = txHex.split(' ');
    const rxBytes = rxHex.split(' ');
    
    return rxBytes.map((byte, i) => {
      const isMatch = txBytes[i] === byte;
      const txByteExist = i < txBytes.length;
      
      return (
        <span 
          key={i} 
          className={`mr-1 px-1 rounded ${!isMatch && txByteExist ? 'bg-red-500/20 text-red-400 font-bold border border-red-500/30' : 'text-emerald-400'}`}
          title={!isMatch && txByteExist ? `Expected: ${txBytes[i]}` : ''}
        >
          {byte}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 border-t border-gray-800/50">
      <div className="p-3 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="text-blue-400 animate-spin-slow" />
          <span className="text-xs font-mono uppercase tracking-widest text-gray-400">{t('exchangeMonitor.title')}</span>
        </div>
        <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-gray-500 font-mono uppercase">{t('exchangeMonitor.matched')}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] text-gray-500 font-mono uppercase">{t('exchangeMonitor.error')}</span>
            </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {exchanges.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-20 py-10">
            <RefreshCw size={48} className="mb-4" />
            <p className="text-xs font-mono">{t('exchangeMonitor.waitingTraffic')}</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-gray-900/90 backdrop-blur z-10">
              <tr className="border-b border-gray-800">
                <th className="p-3 text-[10px] font-mono text-gray-500 uppercase">{t('exchangeMonitor.time')}</th>
                <th className="p-3 text-[10px] font-mono text-gray-500 uppercase">{t('exchangeMonitor.outgoing')}</th>
                <th className="p-3 text-[10px] font-mono text-gray-500 uppercase text-center w-12">{t('exchangeMonitor.status')}</th>
                <th className="p-3 text-[10px] font-mono text-gray-500 uppercase">{t('exchangeMonitor.incoming')}</th>
                <th className="p-3 text-[10px] font-mono text-gray-500 uppercase text-right">{t('exchangeMonitor.latency')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/50">
              {exchanges.map((ex) => {
                const isMatch = ex.tx && ex.rx && ex.tx.rawHex === ex.rx.rawHex;
                const isSelected = selectedId === ex.id;
                
                return (
                  <tr 
                    key={ex.id} 
                    onClick={() => onSelect(ex.id)}
                    className={`cursor-pointer border-b border-gray-900/30 transition-all ${
                      isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-blue-500/5 group'
                    }`}
                  >
                    <td className="p-3 text-[10px] font-mono text-gray-600 align-top">
                      {new Date(ex.startTime).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    
                    <td className="p-3 align-top min-w-[120px]">
                      {ex.tx ? (
                        <div className="font-mono text-[11px] text-blue-300 break-all leading-relaxed">
                          {ex.tx.rawHex}
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-700 italic">---</div>
                      )}
                    </td>

                    <td className="p-3 align-top text-center">
                      <div className="flex justify-center pt-0.5">
                        {!ex.rx ? (
                          <div className="w-4 h-4 rounded-full border border-dashed border-gray-800 animate-pulse" />
                        ) : isMatch ? (
                          <CheckCircle2 size={16} className="text-emerald-500" />
                        ) : ex.rx ? (
                          <XCircle size={16} className="text-red-500" />
                        ) : (
                          <ArrowRight size={16} className="text-gray-700" />
                        )}
                      </div>
                    </td>

                    <td className="p-3 align-top min-w-[120px]">
                      {ex.rx ? (
                        <div className="font-mono text-[11px] break-all leading-relaxed">
                          {ex.tx && isLoopbackMode 
                            ? renderHexWithDiff(ex.tx.rawHex, ex.rx.rawHex) 
                            : <span className="text-emerald-400">{ex.rx.rawHex}</span>
                          }
                        </div>
                      ) : (
                        <div className={`text-[10px] italic ${isLoopbackMode ? 'text-gray-600' : 'text-gray-700 animate-pulse'}`}>
                          {isLoopbackMode ? t('exchangeMonitor.mirroringData') : t('exchangeMonitor.waitingDevice')}
                        </div>
                      )}
                    </td>

                    <td className="p-3 align-top text-right">
                      {ex.latencyMs !== undefined && (
                        <div className="flex items-center justify-end gap-1 text-gray-500 font-mono text-[10px]">
                          <Clock size={10} />
                          <span>{ex.latencyMs}ms</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});

ExchangeMonitor.displayName = 'ExchangeMonitor';

export default ExchangeMonitor;
