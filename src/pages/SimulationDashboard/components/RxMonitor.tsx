import { memo, useEffect, useRef, useState } from 'react';
import { GitCompare, Radio, Trash2, LayoutDashboard } from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import type { GeneratedFrame } from '../../../types';
import { useTranslation } from '../../../i18n/context';

interface RxMonitorProps {
  lastRxFrame: GeneratedFrame | null;
  selectedFrameId?: number;
  onSelectFrame?: (frame: GeneratedFrame) => void;
}

const MAX_RX_HISTORY = 50;

const RxMonitor = memo(({ lastRxFrame, selectedFrameId, onSelectFrame }: RxMonitorProps) => {
  const { setDiffFrame, addWidget } = useSimulation();
  const { t } = useTranslation();
  const [rxHistory, setRxHistory] = useState<GeneratedFrame[]>([]);
  const prevRxUid = useRef<string | null>(null);

  // Yeni frame gelince geçmişe ekle
  useEffect(() => {
    if (!lastRxFrame) return;
    if (lastRxFrame.uId === prevRxUid.current) return;
    prevRxUid.current = lastRxFrame.uId;
    setRxHistory((prev) => [lastRxFrame, ...prev].slice(0, MAX_RX_HISTORY));
  }, [lastRxFrame]);

  const clearHistory = () => {
    setRxHistory([]);
    prevRxUid.current = null;
  };

  return (
    <div className="flex flex-col border-b border-gray-800 bg-blue-900/5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60">
        <div className="flex items-center gap-2">
          <Radio size={12} className={rxHistory.length > 0 ? 'text-blue-400 animate-pulse' : 'text-gray-600'} />
          <span className="text-blue-400 text-[10px] font-mono uppercase tracking-wider">
            {t('rxMonitor.title')}
          </span>
          {rxHistory.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-900/40 text-blue-300 border border-blue-800/40">
              {rxHistory.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {lastRxFrame && (
            <>
              <button
                onClick={() => setDiffFrame(0, lastRxFrame)}
                className="p-1 hover:bg-blue-500/20 text-blue-500 rounded transition-colors"
                title={t('rxMonitor.slotA')}
              >
                <GitCompare size={11} />
              </button>
              <button
                onClick={() => setDiffFrame(1, lastRxFrame)}
                className="p-1 hover:bg-purple-500/20 text-purple-500 rounded transition-colors"
                title={t('rxMonitor.slotB')}
              >
                <GitCompare size={11} />
              </button>
            </>
          )}
          {rxHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="p-1 hover:bg-red-900/30 text-gray-600 hover:text-red-400 rounded transition-colors"
              title={t('rxMonitor.clearHistory')}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Frame list */}
      <div className="max-h-52 overflow-y-auto custom-scrollbar">
        {rxHistory.length === 0 ? (
          <div className="px-4 py-3 text-gray-700 font-mono text-[10px] italic">
            {t('rxMonitor.waitingData')}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {rxHistory.map((frame, idx) => {
              const isLatest = idx === 0;
              const isSelected = selectedFrameId === frame.frameNumber;

              return (
                <div
                  key={frame.uId}
                  className={`group px-3 py-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-900/30'
                      : isLatest
                      ? 'bg-blue-950/20 hover:bg-blue-900/20'
                      : 'hover:bg-gray-800/20'
                  }`}
                  onClick={() => onSelectFrame?.(frame)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {/* Timestamp */}
                    <span className="text-[9px] font-mono text-gray-600 shrink-0">
                      {new Date(frame.timestampMs).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                      })}
                    </span>

                    {/* Byte count */}
                    <span className="text-[9px] font-mono text-gray-600 shrink-0">
                      {frame.rawBytes.length}B
                    </span>

                    {isLatest && (
                      <span className="text-[8px] font-mono text-blue-400 animate-pulse ml-auto shrink-0">
                        {t('rxMonitor.new')}
                      </span>
                    )}

                    {frame.errors.length > 0 && (
                      <span className="text-[8px] font-mono text-red-400 ml-auto shrink-0">⚠</span>
                    )}

                    {/* Diff buttons on hover */}
                    <div className="hidden group-hover:flex gap-1 ml-auto shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDiffFrame(0, frame); }}
                        className="p-1 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
                        title={t('rxMonitor.slotA')}
                      >
                        <GitCompare size={10} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDiffFrame(1, frame); }}
                        className="p-1 hover:bg-purple-500/30 text-purple-400 rounded transition-colors"
                        title={t('rxMonitor.slotB')}
                      >
                        <GitCompare size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Hex */}
                  <div
                    className={`font-mono text-[10px] truncate ${
                      isSelected ? 'text-blue-300' : 'text-blue-400/80'
                    }`}
                  >
                    {frame.rawHex}
                  </div>

                  {/* Fields (sadece ilk satır için) */}
                  {isLatest && frame.fields.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {frame.fields.map((f) => (
                        <div
                          key={f.name}
                          className="group/field bg-blue-900/15 hover:bg-blue-900/30 rounded px-1.5 py-0.5 border border-blue-900/20 transition-colors flex items-center gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            addWidget(f.name.toLowerCase().includes('wave') || f.name.toLowerCase().includes('plet') ? 'chart' : 'gauge', f.name);
                          }}
                          title={`Pano'ya ekle (${f.name})`}
                        >
                          <span className="text-blue-500/60 text-[8px] font-mono">{f.name}:</span>
                          <span className="text-blue-100 text-[8px] font-mono font-bold whitespace-nowrap">{f.decimal}</span>
                          <LayoutDashboard size={7} className="text-blue-400 opacity-0 group-hover/field:opacity-100 transition-opacity" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

RxMonitor.displayName = 'RxMonitor';

export default RxMonitor;
