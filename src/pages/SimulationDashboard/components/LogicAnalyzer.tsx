import React, { useMemo, memo } from 'react';
import type { GeneratedFrame } from '../../../types';
import { AlertCircle, Zap } from 'lucide-react';

interface LogicAnalyzerProps {
  lastTxFrame: GeneratedFrame | null;
  lastRxFrame: GeneratedFrame | null;
}

interface BitAnnotation {
  index: number;
  label: string;
  type: 'start' | 'data' | 'stop' | 'error' | 'idle';
  value: number;
}

const LogicAnalyzer = memo(({ lastTxFrame, lastRxFrame }: LogicAnalyzerProps) => {
  
  const processBits = (frame: GeneratedFrame | null) => {
    if (!frame) return { bits: [], annotations: [] };
    
    const bits: number[] = [1, 1, 1]; // Idle
    const annotations: BitAnnotation[] = [
      { index: 0, label: 'IDLE', type: 'idle', value: 1 },
      { index: 1, label: 'IDLE', type: 'idle', value: 1 },
      { index: 2, label: 'IDLE', type: 'idle', value: 1 },
    ];

    frame.rawBytes.forEach((byte) => {
      const byteStartIdx = bits.length;
      
      // Start bit (0)
      bits.push(0);
      annotations.push({ index: byteStartIdx, label: 'S', type: 'start', value: 0 });

      // 8 Data bits
      for (let i = 0; i < 8; i++) {
        const val = (byte >> i) & 1;
        bits.push(val);
        annotations.push({ index: bits.length - 1, label: `D${i}`, type: 'data', value: val });
      }

      // Stop bit (1 expected)
      const stopVal = 1;
      bits.push(stopVal);
      // Simplified simulation: always 1 unless we wanted to simulate physical errors
      annotations.push({ index: bits.length - 1, label: 'T', type: 'stop', value: stopVal });
    });

    bits.push(1, 1, 1); // Padding
    annotations.push({ index: bits.length - 3, label: 'IDLE', type: 'idle', value: 1 });

    return { bits, annotations };
  };

  const txData = useMemo(() => processBits(lastTxFrame), [lastTxFrame]);
  const rxData = useMemo(() => processBits(lastRxFrame), [lastRxFrame]);

  const renderTimeline = (data: { bits: number[], annotations: BitAnnotation[] }, color: string, label: string) => {
    const { bits, annotations } = data;
    if (bits.length === 0) {
      return (
        <div className="h-20 flex items-center justify-center border-t border-gray-800/50 italic text-[10px] text-gray-700">
          {label} hattında sinyal bekleniyor...
        </div>
      );
    }

    const step = 20;
    const height = 40;
    const path = bits.map((bit, i) => {
      const x = i * step;
      const y = bit === 1 ? 8 : height - 8;
      return `V ${y} H ${x + step}`;
    }).join(' ');

    const fullPath = `M 0 ${bits[0] === 1 ? 8 : height - 8} ${path}`;

    return (
      <div className="flex flex-col border-t border-gray-800/40 hover:bg-white/[0.02] transition-colors group relative overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="w-10 flex flex-col items-center gap-1 shrink-0">
             <span className={`text-[10px] font-mono font-black ${color}`}>{label}</span>
             <Zap size={10} className={bits.length > 0 ? 'text-yellow-500 animate-pulse' : 'text-gray-800'} />
          </div>
          
          <div className="flex-1 overflow-x-auto custom-scrollbar-hide h-20 relative">
            <svg width={bits.length * step} height="80" className="overflow-visible">
              {/* Grid Lines */}
              {bits.map((_, i) => (
                <line 
                  key={`grid-${i}`} 
                  x1={i * step} y1="0" x2={i * step} y2="60" 
                  stroke="#1f2937" strokeWidth="0.5" 
                  strokeDasharray={i % 10 === 0 ? "" : "2,2"} 
                />
              ))}

              {/* Timing Path */}
              <path
                key={Date.now() + Math.random()} // Absolute force re-render for maximum visual ripple
                d={fullPath}
                fill="none"
                stroke={color === 'text-green-400' ? '#10b981' : '#3b82f6'}
                strokeWidth="2"
                strokeLinejoin="round"
              />

              {/* Annotations */}
              {annotations.map((ann, i) => (
                <g key={`ann-${i}`} transform={`translate(${ann.index * step + step/2}, 0)`}>
                  <text 
                    y="65" 
                    textAnchor="middle" 
                    className={`text-[9px] font-mono font-bold ${
                        ann.type === 'start' ? 'fill-yellow-500' : 
                        ann.type === 'stop' ? 'fill-purple-500' : 
                        ann.type === 'idle' ? 'fill-gray-700' : 'fill-gray-400'
                    }`}
                  >
                    {ann.label}
                  </text>
                  <circle 
                    cy={ann.value === 1 ? 8 : 32} 
                    r="2" 
                    className={
                        ann.type === 'start' ? 'fill-yellow-500' : 
                        ann.type === 'stop' ? 'fill-purple-500' : 'fill-blue-500/20'
                    } 
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-950 border-t border-gray-800 shadow-2xl">
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-800 bg-gray-900/40 backdrop-blur">
        <div className="flex items-center gap-3">
            <div className="p-1 bg-red-500/10 rounded">
                <AlertCircle size={14} className="text-red-500" />
            </div>
            <div className="flex flex-col">
                <span className="text-gray-300 text-[10px] font-mono font-bold uppercase tracking-widest">Logic Analyzer</span>
                <span className="text-gray-600 text-[8px] font-mono uppercase">Bit-Level Timing & Decoding</span>
            </div>
        </div>
        <div className="flex items-center gap-4 text-[9px] font-mono">
           <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> <span className="text-gray-500">START</span></div>
           <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-400" /> <span className="text-gray-500">DATA</span></div>
           <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> <span className="text-gray-500">STOP</span></div>
        </div>
      </div>
      
      {renderTimeline(txData, 'text-green-400', 'MASTER (TX)')}
      {renderTimeline(rxData, 'text-blue-400', 'SLAVE (RX)')}
    </div>
  );
});

LogicAnalyzer.displayName = 'LogicAnalyzer';

export default LogicAnalyzer;
