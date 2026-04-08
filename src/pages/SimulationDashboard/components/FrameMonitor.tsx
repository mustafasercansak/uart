import React, { memo } from 'react';
import type { GeneratedFrame } from '../../../types';

interface FrameMonitorProps {
  lastFrame: GeneratedFrame | null;
  recentFrames: GeneratedFrame[];
}

const FrameMonitor = memo(({ lastFrame, recentFrames }: FrameMonitorProps) => {
  return (
    <div className="flex flex-col border-r border-gray-800 flex-1">
      {/* Live Frame Monitor */}
      <div className="p-4 border-b border-gray-800">
        <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-3">Canlı Frame</div>
        {lastFrame ? (
          <div className="space-y-2">
            {/* Raw hex */}
            <div className="bg-gray-950 rounded p-3 font-mono text-xs">
              <span className="text-gray-600">HEX: </span>
              <span className="text-green-400">{lastFrame.rawHex}</span>
              {lastFrame.errors.length > 0 && (
                <span className="ml-3 text-red-400 text-[10px]">{lastFrame.errors[0]}</span>
              )}
            </div>
            {/* Field breakdown */}
            <div className="flex flex-wrap gap-2">
              {lastFrame.fields.map((f) => (
                <div key={f.name} className={`bg-gray-800 rounded px-2 py-1.5 border ${lastFrame?.errors.length ? 'border-red-800/30' : 'border-gray-700'}`}>
                  <div className="text-gray-500 text-[10px] font-mono">{f.name}</div>
                  <div className="text-gray-200 text-xs font-mono font-bold">0x{f.hex.replace(' ', '')}</div>
                  <div className="text-gray-500 text-[10px] font-mono">{f.decimal}</div>
                  {f.flags && (
                    <div className="mt-1 space-y-0.5">
                      {Object.entries(f.flags).map(([name, val]) => (
                        <div key={name} className={`text-[9px] font-mono ${val ? 'text-green-400' : 'text-gray-600'}`}>
                          {val ? '■' : '□'} {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-gray-700 font-mono text-xs">Simülasyon başlatılmadı...</div>
        )}
      </div>

      {/* Recent Frames Scroll */}
      <div className="p-3 border-b border-gray-800 max-h-40 overflow-y-auto">
        <div className="text-gray-600 text-[10px] font-mono uppercase tracking-wider mb-2">Son Frameler</div>
        <div className="space-y-0.5">
          {recentFrames.slice(0, 20).map((frame, i) => (
            <div key={frame.frameNumber} className={`text-[10px] font-mono flex items-center gap-2 ${frame.errors.length > 0 ? 'text-red-400' : 'text-gray-500'} ${i === 0 ? 'text-green-400' : ''}`}>
              <span className="text-gray-700 w-6 text-right">{frame.frameNumber}</span>
              <span>{frame.rawHex}</span>
              {frame.errors.length > 0 && <span className="text-red-400">⚠</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

FrameMonitor.displayName = 'FrameMonitor';

export default FrameMonitor;
