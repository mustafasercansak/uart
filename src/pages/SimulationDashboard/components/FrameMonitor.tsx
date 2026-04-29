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
    <div className="flex flex-col border-r border-gray-800 flex-1">
      {/* Live Frame Monitor */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex justify-between items-center mb-3">
            <div className="text-gray-500 text-xs font-mono uppercase tracking-wider">{t('frameMonitor.liveFrame')}</div>
            {lastFrame && (
                <div className="flex gap-1">
                    <button 
                        onClick={() => setDiffFrame(0, lastFrame)}
                        className="p-1 hover:bg-blue-500/20 text-blue-500 rounded transition-colors" title={t('frameMonitor.slotARef')}
                    >
                        <GitCompare size={12} />
                    </button>
                    <button 
                        onClick={() => setDiffFrame(1, lastFrame)}
                        className="p-1 hover:bg-purple-500/20 text-purple-500 rounded transition-colors" title={t('frameMonitor.slotBTest')}
                    >
                        <GitCompare size={12} />
                    </button>
                </div>
            )}
        </div>
        {/* ...rest... */}
        {lastFrame ? (
          <div 
            className={`space-y-2 p-2 rounded-xl transition-all cursor-pointer border ${selectedFrameId === lastFrame.frameNumber ? 'bg-green-500/10 border-green-500/40' : 'border-transparent hover:bg-gray-800/20'}`}
            onClick={() => onSelectFrame?.(lastFrame)}
          >
            {/* Raw hex */}
            <div className="bg-gray-950 rounded p-3 font-mono text-xs">
              <span className="text-gray-600">{t('frameMonitor.hex')} </span>
              <span className="text-green-400">{lastFrame.rawHex}</span>
              {lastFrame.errors.length > 0 && (
                <span className="ml-3 text-red-400 text-[10px]">{lastFrame.errors[0]}</span>
              )}
            </div>
            {/* Field breakdown (Compact) */}
            <div className="flex flex-wrap gap-1">
              {lastFrame.fields.map((f) => (
                <div 
                  key={f.name} 
                  className="group/field bg-gray-800/50 hover:bg-gray-700/80 rounded px-1.5 py-0.5 border border-gray-700/50 transition-colors flex items-center gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    addWidget(f.name.toLowerCase().includes('wave') || f.name.toLowerCase().includes('plet') ? 'chart' : 'gauge', f.name);
                  }}
                  title={t('frameMonitor.addToDashboard', { name: f.name })}
                >
                  <span className="text-gray-500 text-[9px] font-mono">{f.name}:</span>
                  <span className="text-gray-200 text-[9px] font-mono font-bold whitespace-nowrap">{f.decimal}</span>
                  <LayoutDashboard size={8} className="text-blue-500 opacity-0 group-hover/field:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-gray-500 font-mono text-[10px] animate-pulse py-4 text-center border border-dashed border-gray-800 rounded-lg">
            {t('frameMonitor.waitingData')}
          </div>
        )}
      </div>

      {/* Recent Frames Scroll */}
      <div className="p-3 border-b border-gray-800 max-h-60 overflow-y-auto">
        <div className="text-gray-600 text-[10px] font-mono uppercase tracking-wider mb-2">{t('frameMonitor.recentFrames')}</div>
        <div className="space-y-0.5">
          {recentFrames.slice(0, 30).map((frame) => (
            <div 
              key={frame.uId} 
              className={`group text-[10px] font-mono flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${selectedFrameId === frame.frameNumber ? 'bg-green-500/20 text-green-300' : 'text-gray-500 hover:bg-gray-800/40 hover:text-gray-300'} ${frame.errors.length > 0 ? 'border-l-2 border-red-500' : ''}`}
            >
              <span className="text-gray-700 w-6 text-right shrink-0" onClick={() => onSelectFrame?.(frame)}>{frame.frameNumber}</span>
              <span className="truncate flex-1" onClick={() => onSelectFrame?.(frame)}>{frame.rawHex}</span>
              <div className="hidden group-hover:flex gap-2 ml-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); setDiffFrame(0, frame); }} 
                  className="p-1.5 hover:bg-blue-500/30 text-blue-400 rounded-md transition-all border border-transparent hover:border-blue-500/40 bg-gray-900/40"
                  title={t('frameMonitor.slotARef')}
                >
                  <GitCompare size={14} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setDiffFrame(1, frame); }} 
                  className="p-1.5 hover:bg-purple-500/30 text-purple-400 rounded-md transition-all border border-transparent hover:border-purple-500/40 bg-gray-900/40"
                  title={t('frameMonitor.slotBTest')}
                >
                  <GitCompare size={14} />
                </button>
              </div>
              {frame.errors.length > 0 && <span className="text-red-400 ml-auto text-xs">⚠</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

FrameMonitor.displayName = 'FrameMonitor';

export default FrameMonitor;
