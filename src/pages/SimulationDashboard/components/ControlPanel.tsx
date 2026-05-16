import React, { memo, useRef, useEffect } from 'react';
import { FileDown } from 'lucide-react';
import type { FrameProfile, ErrorType, FlagsConfig, RangeConfig, Field, Exchange } from '../../../types';
import { useTranslation } from '../../../i18n/context';

interface ControlPanelProps {
  status: string;
  flagsFields: Field[];
  allRangeFields: Field[];
  bitOverrides: Record<string, number>;
  fieldOverrides: Record<string, number>;
  pendingErrors: ErrorType[];
  logEntries: Array<{ type: string; time: string; text: string }>;
  errorTypes: Array<{ type: ErrorType; label: string; color: string }>;
  onOverrideField: (id: string, value: number) => void;
  onOverrideBit: (key: string, value: number) => void;
  onInjectError: (type: ErrorType) => void;
  onResetOverrides: () => void;
  onExportLogs: () => void;
  signalIntegrity: { noiseLevel: number; jitterMs: number; bitFlipsEnabled: boolean };
  onSetSignalIntegrity: (integrity: Partial<{ noiseLevel: number; jitterMs: number; bitFlipsEnabled: boolean }>) => void;
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
        <div className="p-3 border-b border-gray-800/50">
          <div className="text-gray-600 text-[9px] font-mono uppercase tracking-widest mb-2">{t('controls.flags')}</div>
          <div className="space-y-1.5">
            {flagsFields.map((field) => {
              const cfg = field.typeConfig as FlagsConfig;
              return (
                <div key={field.id}>
                  <div className="text-gray-500 text-[8.5px] font-mono mb-1">{field.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {cfg.bits.map((bit) => {
                      const bitKey = `${field.id}.${bit.name}`;
                      const currentVal = bitOverrides[bitKey] ?? bit.defaultValue;
                      return (
                        <button
                          key={bit.index}
                          onClick={() => onOverrideBit(bitKey, currentVal ? 0 : 1)}
                          className={`px-1.5 py-0.5 rounded-[3px] text-[8.5px] font-mono border transition-all ${
                            currentVal
                              ? 'bg-green-900/50 border-green-700/50 text-green-400'
                              : 'bg-gray-800/50 border-gray-700/50 text-gray-500 hover:border-gray-600'
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
        <div className="p-3 border-b border-gray-800/50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-gray-600 text-[9px] font-mono uppercase tracking-widest">{t('controls.overrides')}</div>
            <button onClick={onResetOverrides} className="text-gray-700 hover:text-gray-500 text-[9px] font-mono transition-colors uppercase">{t('controls.reset')}</button>
          </div>
          <div className="space-y-3">
            {(() => {
              // Compute whether any field is currently in alarm — used to propagate alarm color to all labels
              const anyFieldInAlarm = allRangeFields.some((f) => {
                const c = f.typeConfig as RangeConfig;
                const v = fieldOverrides[f.id] ?? Math.round((c.min + c.max) / 2);
                return (f.alarmLow !== undefined && v < f.alarmLow) ||
                       (f.alarmHigh !== undefined && v > f.alarmHigh);
              });

              return allRangeFields.map((field) => {
              const cfg = field.typeConfig as RangeConfig;
              const currentVal = fieldOverrides[field.id] ?? Math.round((cfg.min + cfg.max) / 2);
              const hasOverride = fieldOverrides[field.id] !== undefined;
              const alarmLo = field.alarmLow;
              const alarmHi = field.alarmHigh;
              const hasAlarm = alarmLo !== undefined || alarmHi !== undefined;
              // Alarm eşiklerinin ötesinde kırmızı zon görünsün diye padding ekle
              const alarmSpan = hasAlarm ? ((alarmHi ?? cfg.max) - (alarmLo ?? cfg.min)) : (cfg.max - cfg.min);
              const zonePad = Math.max(Math.round(alarmSpan * 0.25), 3);
              const effectiveMin = hasAlarm ? Math.min(cfg.min, (alarmLo ?? cfg.min) - zonePad) : cfg.min;
              const effectiveMax = hasAlarm ? Math.max(cfg.max, (alarmHi ?? cfg.max) + zonePad) : cfg.max;
              const range = effectiveMax - effectiveMin || 1;
              const inAlarm = hasAlarm && (
                (alarmLo !== undefined && currentVal < alarmLo) ||
                (alarmHi !== undefined && currentVal > alarmHi)
              );
              // Secondary alarm: this field itself is ok but another field is alarming
              const inSecondaryAlarm = !inAlarm && anyFieldInAlarm;

              const pctLo = hasAlarm && alarmLo !== undefined ? (alarmLo - effectiveMin) / range * 100 : null;
              const pctHi = hasAlarm && alarmHi !== undefined ? (alarmHi - effectiveMin) / range * 100 : null;

              return (
                <div key={field.id}>
                  {/* Label row */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[9px] font-mono ${inAlarm ? 'text-rose-400 font-bold' : inSecondaryAlarm ? 'text-rose-700 font-bold' : hasOverride ? 'text-yellow-500 font-bold' : 'text-gray-500'}`}>
                      {field.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {inAlarm && (
                        <span className="text-[8px] text-rose-500 font-black tracking-widest uppercase animate-pulse">!</span>
                      )}
                      <span className={`text-[9px] font-mono font-bold ${inAlarm ? 'text-rose-400' : inSecondaryAlarm ? 'text-rose-700' : 'text-gray-400'}`}>
                        {currentVal}
                      </span>
                    </div>
                  </div>

                  {/* Custom track + native input overlay */}
                  <div className="relative h-4 flex items-center">
                    {/* Colored track */}
                    <div className="absolute inset-x-0 h-2 rounded-full overflow-hidden" style={{ top: '50%', transform: 'translateY(-50%)' }}>
                      {hasAlarm ? (
                        <>
                          {/* red zone left — parlak sadece alarm aktifken */}
                          {pctLo !== null && pctLo > 0 && (
                            <div
                              className="absolute top-0 h-full transition-colors duration-300"
                              style={{
                                left: 0,
                                width: `${pctLo}%`,
                                background: inAlarm && alarmLo !== undefined && currentVal < alarmLo
                                  ? 'rgba(239,68,68,0.85)'
                                  : 'rgba(239,68,68,0.22)',
                              }}
                            />
                          )}
                          {/* green zone middle */}
                          <div
                            className="absolute top-0 h-full bg-emerald-500/50"
                            style={{
                              left: `${pctLo ?? 0}%`,
                              width: `${(pctHi ?? 100) - (pctLo ?? 0)}%`,
                            }}
                          />
                          {/* red zone right — parlak sadece alarm aktifken */}
                          {pctHi !== null && pctHi < 100 && (
                            <div
                              className="absolute top-0 h-full transition-colors duration-300"
                              style={{
                                left: `${pctHi}%`,
                                width: `${100 - pctHi}%`,
                                background: inAlarm && alarmHi !== undefined && currentVal > alarmHi
                                  ? 'rgba(239,68,68,0.85)'
                                  : 'rgba(239,68,68,0.22)',
                              }}
                            />
                          )}
                          {/* alarm threshold ticks */}
                          {pctLo !== null && (
                            <div className="absolute top-0 h-full w-0.5 bg-white/40" style={{ left: `${pctLo}%` }} />
                          )}
                          {pctHi !== null && (
                            <div className="absolute top-0 h-full w-0.5 bg-white/40" style={{ left: `${pctHi}%` }} />
                          )}
                        </>
                      ) : (
                        <div className="absolute inset-0 bg-gray-700 rounded-full" />
                      )}
                    </div>

                    {/* Transparent native input for interaction */}
                    <input
                      type="range"
                      min={effectiveMin}
                      max={effectiveMax}
                      value={currentVal}
                      onChange={(e) => onOverrideField(field.id, Number(e.target.value))}
                      className={`alarm-slider absolute inset-x-0 w-full h-full cursor-pointer appearance-none bg-transparent`}
                      style={{ margin: 0 }}
                    />
                  </div>

                  {/* Alarm threshold labels */}
                  {hasAlarm && (
                    <div className="relative h-3 mt-0.5">
                      {pctLo !== null && (
                        <span
                          className="absolute text-[8px] text-rose-400 font-mono font-bold -translate-x-1/2"
                          style={{ left: `${pctLo}%` }}
                        >
                          {alarmLo}
                        </span>
                      )}
                      {pctHi !== null && (
                        <span
                          className="absolute text-[8px] text-rose-400 font-mono font-bold -translate-x-1/2"
                          style={{ left: `${pctHi}%` }}
                        >
                          {alarmHi}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            });
            })()}
          </div>
        </div>
      )}

      {/* Error Injection */}
      <div className="p-3 border-b border-gray-800/50">
        <div className="text-gray-600 text-[9px] font-mono uppercase tracking-widest mb-2">{t('controls.injection')}</div>
        <div className="grid grid-cols-2 gap-1">
          {errorTypes.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => onInjectError(type)}
              disabled={status !== 'running'}
              className={`text-[9px] font-mono px-1.5 py-1 rounded-[3px] border transition-all disabled:opacity-20 disabled:cursor-not-allowed ${color}`}
            >
              {label}
            </button>
          ))}
        </div>
        {pendingErrors.length > 0 && (
          <div className="mt-1.5 text-orange-500 text-[8.5px] font-mono flex items-center gap-1">
            <span className="w-1 h-1 bg-orange-500 rounded-full animate-pulse" />
            {t('controls.pendingErrors', { count: pendingErrors.length })}
          </div>
        )}
      </div>

      {/* Signal Integrity Controls */}
      <div className="p-3 border-b border-gray-800/50 bg-gray-900/40">
        <div className="flex items-center justify-between mb-2 text-gray-600 text-[9px] font-mono uppercase tracking-widest">
          <span>{t('controls.signalQuality')}</span>
          <div className="flex items-center gap-1.5">
             <span className="text-[8px] text-gray-600 uppercase font-black">{t('controls.bitFlip')}</span>
             <button 
               onClick={() => onSetSignalIntegrity({ bitFlipsEnabled: !signalIntegrity.bitFlipsEnabled })}
               className={`w-6 h-3 rounded-full relative transition-colors ${signalIntegrity.bitFlipsEnabled ? 'bg-amber-600' : 'bg-gray-700'}`}
             >
               <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${signalIntegrity.bitFlipsEnabled ? 'left-3.5' : 'left-0.5'}`} />
             </button>
          </div>
        </div>
        
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[9px] font-mono mb-0.5">
              <span className="text-gray-500">{t('controls.noise')}</span>
              <span className="text-amber-500 font-bold">{(signalIntegrity.noiseLevel * 100).toFixed(1)}%</span>
            </div>
            <input
              type="range" min="0" max="0.05" step="0.001"
              value={signalIntegrity.noiseLevel}
              onChange={(e) => onSetSignalIntegrity({ noiseLevel: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          <div>
             <div className="flex justify-between text-[9px] font-mono mb-0.5">
              <span className="text-gray-500">{t('controls.jitter')}</span>
              <span className="text-blue-500 font-bold">{signalIntegrity.jitterMs.toFixed(1)}{t('time.ms')}</span>
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
      <div className="flex-1 flex flex-col min-h-[200px] p-2">
        <div className="flex flex-col gap-1.5 mb-2">
          <div className="flex items-center justify-between">
            <div className="text-gray-600 text-[9px] font-mono uppercase tracking-widest">{t('controls.console')}</div>
            <button 
              onClick={onExportLogs}
              className="text-[8px] font-mono text-gray-700 hover:text-green-500 flex items-center gap-1 transition-colors uppercase"
            >
              <FileDown size={10} />
              {t('controls.csvExport')}
            </button>
          </div>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto bg-gray-950/50 rounded border border-gray-800/50 p-1.5 font-mono text-[9px] space-y-0.5 custom-scrollbar">
          {logEntries.length === 0 && (
            <div className="text-gray-800 italic">{t('controls.logEmpty')}</div>
          )}
          {logEntries.map((entry, i) => {
            const isTx = entry.type === 'tx';
            const isRx = entry.type === 'rx';
            const isError = entry.type === 'error';
            
            return (
              <div key={i} className="flex flex-col border-b border-gray-900/30 pb-0.5 mb-0.5 last:border-0 hover:bg-white/[0.01]">
                <div className="flex items-center gap-1.5">
                   <span className="text-gray-800 text-[8px] shrink-0">[{entry.time}]</span>
                   <span className={`px-1 py-0 rounded-[2px] text-[7px] font-black uppercase tracking-tighter ${
                     isTx ? 'bg-green-500/10 text-green-600 border border-green-500/10' : 
                     isRx ? 'bg-blue-500/10 text-blue-500 border border-blue-500/10' : 
                     isError ? 'bg-red-500/10 text-red-600 border border-red-500/10' : 'bg-gray-800 text-gray-400'
                   }`}>
                     {entry.type}
                   </span>
                </div>
                <div className={`mt-0.5 pl-1.5 border-l ${
                  isTx ? 'border-green-900 text-green-700' : 
                  isRx ? 'border-blue-900 text-blue-700' : 
                  isError ? 'border-red-900 text-red-700' : 'border-gray-800 text-gray-600'
                } font-mono break-all leading-tight text-[8.5px]`}>
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
