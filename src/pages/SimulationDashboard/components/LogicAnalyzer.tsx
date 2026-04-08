import React, { useMemo, memo } from 'react';
import type { GeneratedFrame } from '../../../types';

interface LogicAnalyzerProps {
  lastTxFrame: GeneratedFrame | null;
  lastRxFrame: GeneratedFrame | null;
}

const LogicAnalyzer = memo(({ lastTxFrame, lastRxFrame }: LogicAnalyzerProps) => {
  // We'll simulate the bit pattern for the last frame
  // UART: Start Bit (0) + 8 Data Bits + Stop Bit (1)
  const txBits = useMemo(() => {
    if (!lastTxFrame) return [];
    const bits: number[] = [1, 1, 1]; // Idle
    lastTxFrame.rawBytes.forEach(byte => {
      bits.push(0); // Start bit
      for (let i = 0; i < 8; i++) {
        bits.push((byte >> i) & 1);
      }
      bits.push(1); // Stop bit
    });
    bits.push(1, 1, 1); // Padding
    return bits;
  }, [lastTxFrame]);

  const rxBits = useMemo(() => {
    if (!lastRxFrame) return [];
    const bits: number[] = [1, 1, 1];
    lastRxFrame.rawBytes.forEach(byte => {
      bits.push(0); // Start bit
      for (let i = 0; i < 8; i++) {
        bits.push((byte >> i) & 1);
      }
      bits.push(1); // Stop bit
    });
    bits.push(1, 1, 1);
    return bits;
  }, [lastRxFrame]);

  const renderTimeline = (bits: number[], color: string, label: string) => {
    if (bits.length === 0) {
      return (
        <div className="h-16 flex items-center justify-center border-t border-gray-800/50 italic text-[10px] text-gray-700">
          {label} hattında veri bekleniyor...
        </div>
      );
    }

    const step = 8;
    const height = 30;
    const path = bits.map((bit, i) => {
      const x = i * step;
      const y = bit === 1 ? 5 : height - 5;
      const prevX = (i > 0) ? (i - 0) * step : 0;
      const prevY = i > 0 ? (bits[i-1] === 1 ? 5 : height - 5) : y;
      // Vertical line for transition then horizontal line
      return `V ${y} H ${x + step}`;
    }).join(' ');

    const fullPath = `M 0 ${bits[0] === 1 ? 5 : height - 5} ${path}`;

    return (
      <div className="flex items-center gap-4 px-4 py-1 group border-t border-gray-800/50">
        <div className={`w-8 text-[10px] font-mono font-bold ${color}`}>{label}</div>
        <div className="flex-1 overflow-hidden relative h-10 bg-gray-950/50 rounded flex items-center">
          <svg width="100%" height="40" className="overflow-visible">
            <path
              d={fullPath}
              fill="none"
              stroke={color === 'text-green-400' ? '#10b981' : '#3b82f6'}
              strokeWidth="1.5"
              className="transition-all duration-300"
            />
            {/* Grid lines */}
            {bits.map((_, i) => i % 10 === 0 && (
              <line key={i} x1={i * step} y1="0" x2={i * step} y2="40" stroke="#1f2937" strokeWidth="1" strokeDasharray="2,2" />
            ))}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-900 border-t border-gray-800">
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-800 bg-gray-950/30">
        <div className="text-gray-500 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Mantık Analizörü (Timing Diagram)
        </div>
        <div className="text-gray-700 text-[9px] font-mono">1 BIT ≈ 1 STEP</div>
      </div>
      
      {renderTimeline(txBits, 'text-green-400', 'TX')}
      {renderTimeline(rxBits, 'text-blue-400', 'RX')}
    </div>
  );
});

LogicAnalyzer.displayName = 'LogicAnalyzer';

export default LogicAnalyzer;
