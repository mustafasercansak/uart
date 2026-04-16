import React, { useMemo, memo, useState } from 'react';
import type { GeneratedFrame, ProtocolType } from '../../../types';
import { AlertCircle, Zap, Cpu, Settings2 } from 'lucide-react';
import { getDecodedLines, SignalLine, BitAnnotation } from '../../../engines/ProtocolDecoders';

interface LogicAnalyzerProps {
  lastTxFrame: GeneratedFrame | null;
  lastRxFrame: GeneratedFrame | null;
}



const LogicAnalyzer = memo(({ lastTxFrame, lastRxFrame }: LogicAnalyzerProps) => {
  const [protocol, setProtocol] = useState<ProtocolType>('UART');
  
  const txData = useMemo(() => {
    if (!lastTxFrame) return [];
    return getDecodedLines(protocol, lastTxFrame.rawBytes);
  }, [lastTxFrame, protocol]);

  const rxData = useMemo(() => {
    if (!lastRxFrame) return [];
    return getDecodedLines(protocol, lastRxFrame.rawBytes);
  }, [lastRxFrame, protocol]);

  const renderTimeline = (lines: SignalLine[], sourceLabel: string) => {
    if (lines.length === 0) {
      return (
        <div className="h-20 flex items-center justify-center border-t border-gray-800/50 italic text-[10px] text-gray-700">
          {sourceLabel} hattında sinyal bekleniyor...
        </div>
      );
    }

    const step = 20;
    const height = 40;

    return (
      <div className="flex flex-col border-t border-gray-800/40 hover:bg-white/[0.02] transition-colors group relative overflow-hidden pb-2">
        {lines.map((line, lineIdx) => {
           const { bits, annotations, label, color } = line;
           const path = bits.map((bit, i) => {
             const x = i * step;
             const y = bit === 1 ? 8 : height - 8;
             return `V ${y} H ${x + step}`;
           }).join(' ');

           const fullPath = `M 0 ${bits[0] === 1 ? 8 : height - 8} ${path}`;

           return (
             <div key={`${sourceLabel}-${label}`} className="flex items-center gap-4 px-4 py-1.5">
               <div className="w-12 flex flex-col items-center gap-0.5 shrink-0">
                  <span className={`text-[8px] font-mono font-black ${color} tracking-tighter`}>{lineIdx === 0 ? sourceLabel : ''}</span>
                  <span className={`text-[9px] font-mono font-bold text-gray-500`}>{label}</span>
               </div>
               
               <div className="flex-1 overflow-x-auto custom-scrollbar-hide h-14 relative">
                 <svg width={bits.length * step} height="55" className="overflow-visible">
                   {/* Grid Lines */}
                   {bits.map((_, i) => (
                     <line 
                       key={`grid-${i}`} 
                       x1={i * step} y1="0" x2={i * step} y2="40" 
                       stroke="#111827" strokeWidth="0.5" 
                       strokeDasharray={i % 10 === 0 ? "" : "2,2"} 
                     />
                   ))}

                   {/* Timing Path */}
                   <path
                     key={Date.now() + Math.random()} 
                     d={fullPath}
                     fill="none"
                     stroke={color.includes('green') ? '#10b981' : color.includes('blue') ? '#3b82f6' : color.includes('yellow') ? '#f59e0b' : color.includes('purple') ? '#8b5cf6' : '#f97316'}
                     strokeWidth="1.5"
                     strokeLinejoin="round"
                   />

                   {/* Annotations */}
                   {annotations.map((ann, i) => (
                     <g key={`ann-${i}`} transform={`translate(${ann.index * step + step/2}, 0)`}>
                        <text 
                          y="50" 
                          textAnchor="middle" 
                          className={`text-[8px] font-mono font-bold ${
                              ann.type === 'start' || ann.type === 'sof' ? 'fill-yellow-500' : 
                              ann.type === 'stop' || ann.type === 'eof' ? 'fill-purple-500' : 
                              ann.type === 'ack' ? 'fill-emerald-500' :
                              ann.type === 'id' ? 'fill-orange-500' :
                              ann.type === 'idle' ? 'fill-gray-700' : 'fill-gray-400'
                          }`}
                        >
                          {ann.label}
                        </text>
                        <circle 
                          cy={ann.value === 1 ? 8 : 32} 
                          r="1.5" 
                          className={
                              ann.type === 'start' || ann.type === 'sof' ? 'fill-yellow-500' : 
                              ann.type === 'stop' || ann.type === 'eof' ? 'fill-purple-500' : 'fill-blue-500/20'
                          } 
                        />
                     </g>
                   ))}
                 </svg>
               </div>
             </div>
           );
        })}
      </div>
    );
  };

  return (
    <div className="bg-gray-950 border-t border-gray-800 shadow-2xl">
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-800 bg-gray-900/40 backdrop-blur">
        <div className="flex items-center gap-3">
            <div className="p-1 bg-blue-500/10 rounded">
                <Cpu size={14} className="text-blue-500" />
            </div>
            <div className="flex flex-col">
                <span className="text-gray-300 text-[10px] font-mono font-bold uppercase tracking-widest">Genişletilmiş Mantık Analizörü</span>
                <span className="text-gray-600 text-[8px] font-mono uppercase">Multi-Protocol Timing & Decoding</span>
            </div>
        </div>

        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-4 bg-gray-950 p-0.5 rounded-lg border border-gray-800">
                {(['UART', 'SPI', 'I2C', 'CAN'] as ProtocolType[]).map((p) => (
                    <button
                        key={p}
                        onClick={() => setProtocol(p)}
                        className={`px-3 py-1 rounded-md text-[9px] font-mono font-bold transition-all ${
                            protocol === p 
                            ? 'bg-blue-600 text-white shadow-lg' 
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
                        }`}
                    >
                        {p}
                    </button>
                ))}
            </div>
            
            <div className="flex items-center gap-3 text-[8px] font-mono">
                <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-yellow-500" /> <span className="text-gray-500">START</span></div>
                <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-emerald-500" /> <span className="text-gray-500">ACK</span></div>
                <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-purple-500" /> <span className="text-gray-500">STOP</span></div>
            </div>
        </div>
      </div>
      
      <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
        {renderTimeline(txData, 'MASTER')}
        {renderTimeline(rxData, 'SLAVE')}
      </div>
    </div>
  );
});

LogicAnalyzer.displayName = 'LogicAnalyzer';

export default LogicAnalyzer;
