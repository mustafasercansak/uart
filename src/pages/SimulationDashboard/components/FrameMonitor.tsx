import { memo } from 'react';
import { GitCompare, LayoutDashboard } from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import type { GeneratedFrame } from '../../../types';
import { useTranslation } from '../../../i18n/context';

interface FrameMonitorProps {
  lastFrame: GeneratedFrame | null;
  recentFrames: GeneratedFrame[];
  selectedFrameId?: number;
  onSelectFrame?: (frame: GeneratedFrame) => void;
}

const FrameMonitor = memo(({ lastFrame, recentFrames, selectedFrameId, onSelectFrame }: FrameMonitorProps) => {
  const { setDiffFrame, addWidget } = useSimulation();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col border-r border-gray-800 flex-1 min-h-0">
      {/* Live Frame Monitor */}
      <div className="p-3 border-b border-gray-800/50">
        <div className="flex justify-between items-center mb-2">
            <div className="text-gray-600 text-[9px] font-mono uppercase tracking-widest">{t('frameMonitor.liveFrame')}</div>
            {lastFrame && (
                <div className="flex gap-1">
                    <button 
                        onClick={() => setDiffFrame(0, lastFrame)}
                        className="p-0.5 hover:bg-blue-500/20 text-blue-500 rounded transition-colors" title={t('frameMonitor.slotARef')}
                    >
                        <GitCompare size={10} />
                    </button>
                    <button 
                        onClick={() => setDiffFrame(1, lastFrame)}
                        className="p-0.5 hover:bg-purple-500/20 text-purple-500 rounded transition-colors" title={t('frameMonitor.slotBTest')}
                    >
                        <GitCompare size={10} />
                    </button>
                </div>
            )}
        </div>
        {lastFrame ? (
          <div 
            className={`space-y-1.5 p-1.5 rounded-lg transition-all cursor-pointer border ${selectedFrameId === lastFrame.frameNumber ? 'bg-green-500/5 border-green-500/30' : 'border-transparent hover:bg-gray-800/20'}`}
            onClick={() => onSelectFrame?.(lastFrame)}
          >
            {/* Raw hex */}
            <div className="bg-gray-950/80 rounded border border-gray-800/50 p-2 font-mono text-[10px] leading-relaxed">
              <span className="text-gray-600">{t('frameMonitor.hex')} </span>
              <span className="text-green-500 font-bold">{lastFrame.rawHex}</span>
              {lastFrame.errors.length > 0 && (
                <div className="mt-1 text-red-500 text-[9px] font-bold flex items-center gap-1">
                  <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
                  {lastFrame.errors[0]}
                </div>
              )}
            </div>
            {/* Field breakdown (Compact) */}
            <div className="flex flex-wrap gap-1">
              {lastFrame.fields.map((f) => (
                <div 
                  key={f.name} 
                  className="group/field bg-gray-900/40 hover:bg-gray-800 rounded-[3px] px-1.5 py-0.5 border border-gray-800 transition-colors flex items-center gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    addWidget(f.name.toLowerCase().includes('wave') || f.name.toLowerCase().includes('plet') ? 'chart' : 'gauge', f.name);
                  }}
                  title={t('frameMonitor.addToDashboard', { name: f.name })}
                >
                  <span className="text-gray-500 text-[8.5px] font-mono">{f.name}:</span>
                  <span className="text-gray-300 text-[8.5px] font-mono font-black">{f.decimal}</span>
                  <LayoutDashboard size={7} className="text-blue-500 opacity-0 group-hover/field:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-gray-700 font-mono text-[9px] animate-pulse py-3 text-center border border-dashed border-gray-800 rounded-lg">
            {t('frameMonitor.waitingData')}
          </div>
        )}
      </div>

      {/* Recent Frames Scroll */}
      <div className="p-2 border-b border-gray-800/50 flex-1 overflow-hidden flex flex-col">
        <div className="text-gray-600 text-[9px] font-mono uppercase tracking-widest mb-1.5 px-1">{t('frameMonitor.recentFrames')}</div>
        <div className="space-y-0.5 overflow-y-auto custom-scrollbar flex-1">
          {recentFrames.slice(0, 50).map((frame) => (
            <div 
              key={frame.uId} 
              className={`group text-[9px] font-mono flex items-center gap-1.5 px-1.5 py-1 rounded-[3px] cursor-pointer transition-all ${selectedFrameId === frame.frameNumber ? 'bg-green-500/15 text-green-400 border-l-2 border-green-500' : 'text-gray-600 hover:bg-gray-800/40 hover:text-gray-400'} ${frame.errors.length > 0 && selectedFrameId !== frame.frameNumber ? 'border-l-2 border-red-500/50 bg-red-500/5' : ''}`}
            >
              <span className="text-gray-800 w-5 text-right shrink-0 font-bold" onClick={() => onSelectFrame?.(frame)}>{frame.frameNumber}</span>
              <span className="truncate flex-1 font-medium" onClick={() => onSelectFrame?.(frame)}>{frame.rawHex}</span>
              <div className="hidden group-hover:flex gap-1 ml-auto">
                <button 
                  onClick={(e) => { e.stopPropagation(); setDiffFrame(0, frame); }} 
                  className="p-1 hover:bg-blue-500/20 text-blue-400 rounded transition-all"
                  title={t('frameMonitor.slotARef')}
                >
                  <GitCompare size={10} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setDiffFrame(1, frame); }} 
                  className="p-1 hover:bg-purple-500/20 text-purple-400 rounded transition-all"
                  title={t('frameMonitor.slotBTest')}
                >
                  <GitCompare size={10} />
                </button>
              </div>
              {frame.errors.length > 0 && <span className="text-red-500 font-bold text-[10px]">⚠</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

FrameMonitor.displayName = 'FrameMonitor';

export default FrameMonitor;
