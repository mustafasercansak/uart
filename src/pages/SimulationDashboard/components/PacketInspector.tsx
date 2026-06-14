import React, { memo, useState, useEffect } from 'react';
import { X, Activity, Camera, Code2, FileJson, Hash, ChartLine, Gauge as GaugeIcon, Lightbulb, ArrowUp, ArrowDown } from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import { parseFrame } from '../../../engines/FrameParser';
import { useTranslation } from '../../../i18n/context';
import type { FrameProfile, Exchange, GeneratedFrame, ParsedField } from '../../../types';

interface PacketInspectorProps {
  exchange: Exchange | null;
  profile: FrameProfile | null;
  onClose: () => void;
}

const PacketInspector = memo(({ exchange, profile, onClose }: PacketInspectorProps) => {
  const { t } = useTranslation();
  const { addWidget, saveSnapshot } = useSimulation();
  
  const txFrame: GeneratedFrame | null = exchange?.tx ? toFrame(exchange.tx) : null;
  const rxFrame: GeneratedFrame | null = exchange?.rx ? toFrame(exchange.rx) : null;

  const [activeTab, setActiveTab] = useState<'tx' | 'rx'>('rx');

  useEffect(() => {
    if (exchange) {
      if (exchange.rx) {
        setActiveTab('rx');
      } else if (exchange.tx) {
        setActiveTab('tx');
      }
    }
  }, [exchange]);

  if (!exchange) return null;

  function toFrame(entry: { id: string; timestamp: number; rawHex: string }): GeneratedFrame {
    const rawBytes = entry.rawHex.split(' ').map(h => parseInt(h, 16));
    const fields: ParsedField[] = profile ? parseFrame(profile, rawBytes) || [] : [];
    return {
      uId: entry.id,
      frameNumber: 0,
      timestampMs: entry.timestamp,
      rawHex: entry.rawHex,
      rawBytes,
      fields,
      errors: [],
    };
  }

  const activeFrame = activeTab === 'rx' ? rxFrame || txFrame : txFrame || rxFrame;

  const copyToClipboard = (type: 'json' | 'cstruct' | 'hex') => {
    if (!activeFrame) return;

    let text = '';
    if (type === 'json') {
      text = JSON.stringify(activeFrame, null, 2);
    } else if (type === 'hex') {
      text = activeFrame.rawHex;
    } else if (type === 'cstruct') {
      text = `struct UART_Packet {\n${activeFrame.fields.map((f) => `  uint${f.byteWidth * 8}_t ${f.name.replace(/\s+/g, '_')}; // ${f.hex}`).join('\n')}\n};`;
    }

    navigator.clipboard.writeText(text);
  };

  const renderFieldTable = (frame: GeneratedFrame) => (
    <div className="flex-1 flex flex-col min-h-0 border border-gray-800 rounded-lg overflow-hidden bg-gray-900/20 shadow-inner">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse font-mono text-[10px]">
           <thead className="sticky top-0 bg-gray-900 z-10">
             <tr className="text-gray-600 border-b border-gray-800">
               <th className="p-2 w-24">{t('inspector.field')}</th>
               <th className="p-2 w-16">{t('inspector.hex')}</th>
               <th className="p-2 w-16">{t('inspector.dec')}</th>
               <th className="p-2 w-12">{t('inspector.action')}</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-gray-800/50">
             {frame.fields.map((f) => {
               return (
                 <tr key={f.name} className="hover:bg-white/5 transition-colors group">
                   <td className="p-2 text-gray-400 font-bold">{f.name}</td>
                   <td className="p-2 text-blue-400">{f.hex}</td>
                   <td className="p-2 text-emerald-400">{f.decimal}</td>
                   <td className="p-2">
                     <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                           onClick={() => addWidget('chart', f.name)}
                           className="p-1 text-gray-500 hover:text-blue-400"
                           title={t('inspector.addChart')}
                        >
                           <ChartLine size={10} />
                        </button>
                        <button 
                           onClick={() => addWidget('gauge', f.name)}
                           className="p-1 text-gray-500 hover:text-amber-400"
                           title={t('inspector.addGauge')}
                        >
                           <GaugeIcon size={10} />
                        </button>
                        <button 
                           onClick={() => addWidget('led', f.name)}
                           className="p-1 text-gray-500 hover:text-emerald-400"
                           title={t('inspector.addLed')}
                        >
                           <Lightbulb size={10} />
                        </button>
                        <button 
                           onClick={() => addWidget('7segment', f.name)}
                           className="p-1 text-gray-500 hover:text-red-400"
                           title={t('inspector.add7Segment')}
                        >
                           <Hash size={10} />
                        </button>
                     </div>
                   </td>
                 </tr>
               );
             })}
           </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col glass-panel border-l-0 shadow-2xl relative z-50 animate-in slide-in-from-right duration-300 rounded-l-2xl overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Activity size={18} className="text-blue-400" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xs font-black text-white uppercase tracking-widest font-mono line-height-none">{t('inspector.title')}</h2>
            <div className="text-[9px] uppercase font-black font-mono text-blue-400">
                {activeTab === 'tx' ? t('inspector.txStream') : t('inspector.rxStream')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
           <div className="flex bg-white/5 rounded-lg border border-white/5 p-0.5 mr-1">
             <button 
                onClick={() => copyToClipboard('hex')}
                className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 transition-all rounded-md"
                title={t('inspector.copyHex')}
             >
                <Hash size={12} />
             </button>
             <button 
                onClick={() => copyToClipboard('cstruct')}
                className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 transition-all rounded-md"
                title={t('inspector.copyCStruct')}
             >
                <Code2 size={12} />
             </button>
             <button 
                onClick={() => copyToClipboard('json')}
                className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 transition-all rounded-md"
                title={t('inspector.copyJson')}
             >
                <FileJson size={12} />
             </button>
           </div>
           <button 
            onClick={() => {
                if (activeFrame) saveSnapshot(activeFrame);
            }}
            className="p-1.5 text-gray-400 hover:text-white transition-all bg-white/5 border border-white/10 rounded-lg shadow-xl"
            title={t('inspector.snapshot')}
           >
             <Camera size={14} />
           </button>
           <button 
                onClick={onClose} 
                className="p-1.5 text-gray-400 hover:text-white transition-all bg-white/5 border border-white/10 rounded-lg shadow-xl ml-2"
            >
             <X size={14} />
           </button>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-3 min-h-0 overflow-hidden bg-gray-950/50">
        {/* Tab Selection if both TX and RX exist */}
        {txFrame && rxFrame && (
          <div className="flex border border-gray-800 bg-gray-900/50 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('tx')}
              className={`flex-1 py-1.5 text-xs font-mono font-bold rounded-md transition-all ${
                activeTab === 'tx'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              TX (Master)
            </button>
            <button
              onClick={() => setActiveTab('rx')}
              className={`flex-1 py-1.5 text-xs font-mono font-bold rounded-md transition-all ${
                activeTab === 'rx'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              RX (Slave)
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0">
          {activeFrame && renderFieldTable(activeFrame)}
        </div>

        {activeFrame && (
          <div className="h-40 min-h-0 flex flex-col bg-black/60 border border-gray-800 rounded-lg p-3 shadow-2xl shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest font-mono">
                {t('inspector.rawBytes')} ({activeFrame.rawBytes.length}B)
              </span>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[9px] text-gray-500 custom-scrollbar">
              <div className="grid grid-cols-5 gap-1.5">
                {activeFrame.rawBytes.map((b: number, i: number) => (
                  <div key={i} className="flex flex-col items-center p-1.5 bg-blue-900/5 border border-blue-900/10 rounded">
                    <span className="text-blue-400 font-bold mb-1">{b.toString(16).toUpperCase().padStart(2, '0')}</span>
                    <span className="text-[7px] opacity-40 leading-none">{b.toString(2).padStart(8, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

PacketInspector.displayName = 'PacketInspector';

export default PacketInspector;
