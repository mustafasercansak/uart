import React, { memo } from 'react';
import type { GeneratedFrame } from '../../../types';

interface FrameMonitorProps {
  lastFrame: GeneratedFrame | null;
  recentFrames: GeneratedFrame[];
  selectedFrameId?: number;
  onSelectFrame?: (frame: GeneratedFrame) => void;
}

const FrameMonitor = memo(({ lastFrame, recentFrames, selectedFrameId, onSelectFrame }: FrameMonitorProps) => {
  return (
    <div className="flex flex-col border-r border-gray-800 flex-1">
      {/* Live Frame Monitor */}
      <div className="p-4 border-b border-gray-800">
        <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-3">Canlı Frame</div>
        {lastFrame ? (
          <div 
            className={`space-y-2 p-2 rounded-xl transition-all cursor-pointer border ${selectedFrameId === lastFrame.frameNumber ? 'bg-green-500/10 border-green-500/40' : 'border-transparent hover:bg-gray-800/20'}`}
            onClick={() => onSelectFrame?.(lastFrame)}
          >
            {/* Raw hex */}
            <div className="bg-gray-950 rounded p-3 font-mono text-xs">
              <span className="text-gray-600">HEX: </span>
              <span className="text-green-400">{lastFrame.rawHex}</span>
              {lastFrame.errors.length > 0 && (
                <span className="ml-3 text-red-400 text-[10px]">{lastFrame.errors[0]}</span>
              )}
            </div>
            {/* Field breakdown (Compact) */}
            <div className="flex flex-wrap gap-1">
              {lastFrame.fields.slice(0, 4).map((f) => (
                <div key={f.name} className="bg-gray-800/50 rounded px-1.5 py-0.5 border border-gray-700/50">
                  <span className="text-gray-500 text-[9px] font-mono mr-1">{f.name}:</span>
                  <span className="text-gray-200 text-[9px] font-mono font-bold">{f.decimal}</span>
                </div>
              ))}
              {lastFrame.fields.length > 4 && <span className="text-gray-700 text-[9px] font-mono">...</span>}
            </div>
          </div>
        ) : (
          <div className="text-gray-700 font-mono text-xs">Simülasyon başlatılmadı...</div>
        )}
      </div>

      {/* Recent Frames Scroll */}
      <div className="p-3 border-b border-gray-800 max-h-60 overflow-y-auto">
        <div className="text-gray-600 text-[10px] font-mono uppercase tracking-wider mb-2">Son Frameler (İncelemek için tıkla)</div>
        <div className="space-y-0.5">
          {recentFrames.slice(0, 30).map((frame) => (
            <div 
              key={frame.frameNumber} 
              onClick={() => onSelectFrame?.(frame)}
              className={`text-[10px] font-mono flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${selectedFrameId === frame.frameNumber ? 'bg-green-500/20 text-green-300' : 'text-gray-500 hover:bg-gray-800/40 hover:text-gray-300'} ${frame.errors.length > 0 ? 'border-l-2 border-red-500' : ''}`}
            >
              <span className="text-gray-700 w-6 text-right shrink-0">{frame.frameNumber}</span>
              <span className="truncate">{frame.rawHex}</span>
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
