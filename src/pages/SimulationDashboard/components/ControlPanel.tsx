import React, { memo, useRef, useEffect } from 'react';
import { FileDown } from 'lucide-react';
import type { FrameProfile, ErrorType, FlagsConfig, RangeConfig } from '../../../types';
import { useTranslation } from '../../../i18n/LanguageContext';

interface ControlPanelProps {
  status: string;
  flagsFields: any[];
  allRangeFields: any[];
  bitOverrides: Record<string, number>;
  fieldOverrides: Record<string, number>;
  pendingErrors: ErrorType[];
  logEntries: any[];
  errorTypes: Array<{ type: ErrorType; label: string; color: string }>;
  onOverrideField: (id: string, value: number) => void;
  onOverrideBit: (key: string, value: number) => void;
  onInjectError: (type: ErrorType) => void;
  onResetOverrides: () => void;
  onExportLogs: () => void;
  signalIntegrity: { noiseLevel: number; jitterMs: number; bitFlipsEnabled: boolean };
  onSetSignalIntegrity: (integrity: any) => void;
}

const ControlPanel = memo(({
  status,
  flagsFields,
  allRangeFields,
  bitOverrides,
  fieldOverrides,
  pendingErrors,
  logEntries,
  errorTypes,
  onOverrideField,
  onOverrideBit,
  onInjectError,
  onResetOverrides,
  onExportLogs,
  signalIntegrity,
  onSetSignalIntegrity
}: ControlPanelProps) => {
  const { t } = useTranslation();
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logEntries]);

  return (
    <div className="w-80 flex flex-col border-l border-gray-800 bg-gray-900/30 shrink-0">
      {/* Flag Toggles */}
      {flagsFields.length > 0 && (
        <div className="p-4 border-b border-gray-800">
          <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-3">{t('controls.flags')}</div>
          <div className="space-y-2">
            {flagsFields.map((field) => {
              const cfg = field.typeConfig as FlagsConfig;
              return (
                <div key={field.id}>
                  <div className="text-gray-600 text-[10px] font-mono mb-1">{field.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {cfg.bits.map((bit) => {
                      const bitKey = `${field.id}.${bit.name}`;
                      const currentVal = bitOverrides[bitKey] ?? bit.defaultValue;
                      return (
                        <button
                          key={bit.index}
                          onClick={() => onOverrideBit(bitKey, currentVal ? 0 : 1)}
                          className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
                            currentVal
                              ? 'bg-green-900/50 border-green-700 text-green-300'
                              : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'
                          }`}
                        >
                          {bit.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Field Overrides */}
      {allRangeFields.length > 0 && (
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="text-gray-500 text-xs font-mono uppercase tracking-wider">{t('controls.overrides')}</div>
            <button onClick={onResetOverrides} className="text-gray-600 hover:text-gray-400 text-xs font-mono transition-colors">{t('controls.reset')}</button>
          </div>
          <div className="space-y-3">
            {allRangeFields.map((field) => {
              const cfg = field.typeConfig as RangeConfig;
              const currentVal = fieldOverrides[field.id] ?? Math.round((cfg.min + cfg.max) / 2);
              const hasOverride = fieldOverrides[field.id] !== undefined;
              return (
                <div key={field.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-mono ${hasOverride ? 'text-yellow-400' : 'text-gray-400'}`}>{field.name}</span>
                    <span className="text-gray-300 text-xs font-mono font-bold w-8 text-right">{currentVal}</span>
                  </div>
                  <input
                    type="range"
                    min={cfg.min}
                    max={cfg.max}
                    value={currentVal}
                    onChange={(e) => onOverrideField(field.id, Number(e.target.value))}
                    className="w-full accent-green-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-gray-700 text-[9px] font-mono">
                    <span>{cfg.min}</span>
                    <span>{cfg.max}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Injection */}
      <div className="p-4 border-b border-gray-800">
        <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-3">{t('controls.injection')}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {errorTypes.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => onInjectError(type)}
              disabled={status !== 'running'}
              className={`text-[10px] font-mono px-2 py-1.5 rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${color}`}
            >
              {label}
            </button>
          ))}
        </div>
        {pendingErrors.length > 0 && (
          <div className="mt-2 text-orange-400 text-[10px] font-mono">
            {t('controls.pendingErrors').replace('{count}', pendingErrors.length.toString())}
          </div>
        )}
      </div>

      {/* Signal Integrity Controls */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/40">
        <div className="flex items-center justify-between mb-3 text-gray-500 text-xs font-mono uppercase tracking-wider">
          <span>{t('controls.signalQuality')}</span>
          <div className="flex items-center gap-2">
             <span className="text-[9px] text-gray-600 uppercase">Bit Flip</span>
             <button 
               onClick={() => onSetSignalIntegrity({ bitFlipsEnabled: !signalIntegrity.bitFlipsEnabled })}
               className={`w-7 h-3.5 rounded-full relative transition-colors ${signalIntegrity.bitFlipsEnabled ? 'bg-amber-600' : 'bg-gray-700'}`}
             >
               <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${signalIntegrity.bitFlipsEnabled ? 'left-4' : 'left-0.5'}`} />
             </button>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-[10px] font-mono mb-1">
              <span className="text-gray-400">{t('controls.noise')}</span>
              <span className="text-amber-400">{(signalIntegrity.noiseLevel * 100).toFixed(1)}%</span>
            </div>
            <input
              type="range" min="0" max="0.05" step="0.001"
              value={signalIntegrity.noiseLevel}
              onChange={(e) => onSetSignalIntegrity({ noiseLevel: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          <div>
             <div className="flex justify-between text-[10px] font-mono mb-1">
              <span className="text-gray-400">{t('controls.jitter')}</span>
              <span className="text-blue-400">{signalIntegrity.jitterMs.toFixed(1)}ms</span>
            </div>
            <input
              type="range" min="0" max="50" step="0.5"
              value={signalIntegrity.jitterMs}
              onChange={(e) => onSetSignalIntegrity({ jitterMs: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Log */}
      <div className="flex-1 flex flex-col min-h-[300px] p-3">
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between">
            <div className="text-gray-500 text-xs font-mono uppercase tracking-wider">{t('controls.console')}</div>
            <button 
              onClick={onExportLogs}
              className="text-[10px] font-mono text-gray-500 hover:text-green-400 flex items-center gap-1 transition-colors"
              title="Tüm TX/RX kaydını CSV olarak indir"
            >
              <FileDown size={14} />
              {t('controls.csvExport')}
            </button>
          </div>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto bg-gray-950 rounded border border-gray-800 p-2 font-mono text-[10px] space-y-0.5">
          {logEntries.length === 0 && (
            <div className="text-gray-700">{t('controls.logEmpty')}</div>
          )}
          {logEntries.map((entry, i) => {
            const isTx = entry.type === 'tx';
            const isRx = entry.type === 'rx';
            const isError = entry.type === 'error';
            
            return (
              <div key={i} className="flex flex-col border-b border-gray-900/50 pb-1 mb-1 last:border-0 hover:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                   <span className="text-gray-700 text-[9px] shrink-0">[{entry.time}]</span>
                   <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-tighter ${
                     isTx ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
                     isRx ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
                     isError ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-gray-800 text-gray-400'
                   }`}>
                     {entry.type}
                   </span>
                </div>
                <div className={`mt-0.5 pl-2 border-l-2 ${
                  isTx ? 'border-green-500/30 text-green-200/90' : 
                  isRx ? 'border-blue-500/30 text-blue-100' : 
                  isError ? 'border-red-500/30 text-red-300' : 'border-gray-800 text-gray-400'
                } font-mono break-all leading-relaxed`}>
                  {entry.text.replace(/^\[RAW RX\]: |^TX: /, '')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

ControlPanel.displayName = 'ControlPanel';

export default ControlPanel;
