import React, { memo } from 'react';
import type { GeneratedFrame } from '../../../types';

interface RxMonitorProps {
  lastRxFrame: GeneratedFrame | null;
}

const RxMonitor = memo(({ lastRxFrame }: RxMonitorProps) => {
  return (
    <div className="p-4 border-b border-gray-800 bg-blue-900/5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-blue-400 text-xs font-mono uppercase tracking-wider">Canlı RX Frame (Gelen)</div>
        {lastRxFrame && (
          <div className="text-[10px] font-mono text-blue-500 animate-pulse">● CANLI</div>
        )}
      </div>
      
      {lastRxFrame ? (
        <div className="space-y-2">
          {/* Raw hex */}
          <div className="bg-gray-950 rounded p-3 font-mono text-xs border border-blue-900/30">
            <span className="text-gray-600">HEX: </span>
            <span className="text-blue-400">{lastRxFrame.rawHex}</span>
          </div>
          
          {/* Field breakdown */}
          <div className="flex flex-wrap gap-2">
            {lastRxFrame.fields.map((f) => (
              <div key={f.name} className="bg-gray-800 rounded px-2 py-1.5 border border-blue-900/20">
                <div className="text-blue-500/70 text-[10px] font-mono">{f.name}</div>
                <div className="text-blue-100 text-xs font-mono font-bold">0x{f.hex.replace(' ', '')}</div>
                <div className="text-gray-500 text-[10px] font-mono">{f.decimal}</div>
                {f.flags && (
                  <div className="mt-1 space-y-0.5">
                    {Object.entries(f.flags).map(([name, val]) => (
                      <div key={name} className={`text-[9px] font-mono ${val ? 'text-blue-400' : 'text-gray-600'}`}>
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
        <div className="text-gray-700 font-mono text-xs italic">Dış cihazdan veri bekleniyor...</div>
      )}
    </div>
  );
});

RxMonitor.displayName = 'RxMonitor';

export default RxMonitor;
