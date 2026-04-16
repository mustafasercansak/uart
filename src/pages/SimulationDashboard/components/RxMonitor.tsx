import { memo } from 'react';
import { GitCompare } from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import type { GeneratedFrame } from '../../../types';

interface RxMonitorProps {
  lastRxFrame: GeneratedFrame | null;
  selectedFrameId?: number;
  onSelectFrame?: (frame: GeneratedFrame) => void;
}

const RxMonitor = memo(({ lastRxFrame, selectedFrameId, onSelectFrame }: RxMonitorProps) => {
  const { setDiffFrame } = useSimulation();

  return (
    <div className="p-4 border-b border-gray-800 bg-blue-900/5 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="text-blue-400 text-xs font-mono uppercase tracking-wider">Canlı RX Frame (Gelen)</div>
        <div className="flex gap-1 items-center">
          {lastRxFrame && (
            <>
              <button 
                  onClick={() => setDiffFrame(0, lastRxFrame)}
                  className="p-1 hover:bg-blue-500/20 text-blue-500 rounded transition-colors" title="A Slotuna Gönder"
              >
                  <GitCompare size={12} />
              </button>
              <button 
                  onClick={() => setDiffFrame(1, lastRxFrame)}
                  className="p-1 hover:bg-purple-500/20 text-purple-500 rounded transition-colors" title="B Slotuna Gönder"
              >
                  <GitCompare size={12} />
              </button>
              <div className="text-[10px] font-mono text-blue-500 animate-pulse ml-2">● CANLI</div>
            </>
          )}
        </div>
      </div>
      
      {lastRxFrame ? (
        <div 
          className={`space-y-2 p-2 rounded-xl transition-all cursor-pointer border ${selectedFrameId === 0 ? 'bg-blue-500/10 border-blue-500/40' : 'border-transparent hover:bg-blue-900/10'}`}
          onClick={() => onSelectFrame?.(lastRxFrame)}
        >
          {/* Raw hex */}
          <div className="bg-gray-950 rounded p-3 font-mono text-xs border border-blue-900/30">
            <span className="text-gray-600">HEX: </span>
            <span className="text-blue-400">{lastRxFrame.rawHex}</span>
          </div>
          
          {/* Field breakdown (Compact) */}
          <div className="flex flex-wrap gap-1">
            {lastRxFrame.fields.slice(0, 4).map((f) => (
              <div key={f.name} className="bg-blue-900/10 rounded px-1.5 py-0.5 border border-blue-900/20">
                <span className="text-blue-500/70 text-[9px] font-mono mr-1">{f.name}:</span>
                <span className="text-blue-100 text-[9px] font-mono font-bold">{f.decimal}</span>
              </div>
            ))}
            {lastRxFrame.fields.length > 4 && <span className="text-gray-700 text-[9px] font-mono">...</span>}
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
