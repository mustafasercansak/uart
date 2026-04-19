import React, { memo } from 'react';
import { Columns, ArrowRight, Zap, Target } from 'lucide-react';
import type { GeneratedFrame } from '../../../../types';
import { useTranslation } from '../../../../i18n/LanguageContext';

interface DiffLabProps {
  frameA: GeneratedFrame | null;
  frameB: GeneratedFrame | null;
  onClear: () => void;
}

const DiffLab = memo(({ frameA, frameB, onClear }: DiffLabProps) => {
  const { t } = useTranslation();
  if (!frameA || !frameB) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-500 font-mono">
        <Columns size={48} className="mb-4 text-gray-800" />
        <h3 className="text-gray-300 font-black uppercase tracking-widest mb-2">{t('diffLab.title')}</h3>
        <p className="max-w-md text-xs leading-relaxed">{t('diffLab.description')}</p>
      </div>
    );
  }

  const renderHexGrid = (frame: GeneratedFrame, otherFrame: GeneratedFrame) => {
    return (
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 font-mono">
        {frame.rawBytes.map((byte, i) => {
          const otherByte = otherFrame.rawBytes[i];
          const hasDiff = byte !== otherByte;
          
          return (
            <div 
              key={i} 
              className={`flex flex-col items-center p-2 rounded border transition-all ${
                hasDiff 
                  ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.1)]' 
                  : 'bg-gray-900/50 border-gray-800 text-gray-400'
              }`}
            >
              <span className={`text-[11px] font-black ${hasDiff ? 'text-red-400' : 'text-gray-500'}`}>
                {byte.toString(16).padStart(2, '0').toUpperCase()}
              </span>
              <span className="text-[8px] text-gray-700 mt-1">[{i}]</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBitDiff = (bytesA: number[], bytesB: number[]) => {
    const totalBytes = Math.max(bytesA.length, bytesB.length);
    const result = [];
    
    for (let i = 0; i < totalBytes; i++) {
        const bA = bytesA[i] ?? 0;
        const bB = bytesB[i] ?? 0;
        
        for (let bit = 7; bit >= 0; bit--) {
            const valA = (bA >> bit) & 1;
            const valB = (bB >> bit) & 1;
            const diff = valA !== valB;
            result.push({ byteIdx: i, bitIdx: bit, valA, valB, diff });
        }
    }

    return (
      <div className="flex flex-wrap gap-px bg-gray-900 border border-gray-800 p-3 rounded-lg overflow-hidden">
        {result.map((r, i) => (
          <div 
            key={i} 
            className={`w-3 h-5 flex items-center justify-center text-[8px] font-mono select-none transition-colors border-r border-gray-800/20 ${
                r.diff ? 'bg-red-500/40 text-white font-bold' : 'text-gray-600'
            }`}
            title={`Byte ${r.byteIdx}, Bit ${r.bitIdx}`}
          >
            {r.valB}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col p-6 space-y-8 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <Target className="text-blue-500" size={20} />
          <div>
            <h2 className="text-gray-200 text-xs font-black uppercase tracking-widest">{t('diffLab.analysisTitle')}</h2>
            <p className="text-[10px] text-gray-500 font-mono">F# {frameA.frameNumber} vs F# {frameB.frameNumber}</p>
          </div>
        </div>
        <button 
          onClick={onClear}
          className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-mono rounded-lg transition-colors border border-gray-700"
        >
          {t('diffLab.reset')}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Frame A Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-mono text-gray-400 uppercase font-black">{t('diffLab.referencePacket')}</span>
          </div>
          {renderHexGrid(frameA, frameB)}
        </div>

        {/* Frame B Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-[10px] font-mono text-gray-400 uppercase font-black">{t('diffLab.testPacket')}</span>
          </div>
          {renderHexGrid(frameB, frameA)}
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
           <Zap size={14} className="text-yellow-500" />
           <span className="text-[10px] font-mono text-gray-400 uppercase font-black">{t('diffLab.bitChangeMap')}</span>
        </div>
        {renderBitDiff(frameA.rawBytes, frameB.rawBytes)}
      </div>

      <div className="mt-auto p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
         <p className="text-[10px] text-blue-400/80 font-mono italic">
           {t('diffLab.tip')}
         </p>
      </div>
    </div>
  );
});

DiffLab.displayName = 'DiffLab';
export default DiffLab;
