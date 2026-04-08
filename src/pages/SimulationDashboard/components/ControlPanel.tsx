import React, { memo, useRef, useEffect } from 'react';
import type { FrameProfile, ErrorType, FlagsConfig, RangeConfig } from '../../../types';

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
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStartPlayback: (data: any) => void;
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
  isRecording,
  onStartRecording,
  onStopRecording,
  onStartPlayback
}: ControlPanelProps) => {
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
          <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-3">Bayrak Kontrolleri</div>
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
            <div className="text-gray-500 text-xs font-mono uppercase tracking-wider">Alan Geçersiz Kılma</div>
            <button onClick={onResetOverrides} className="text-gray-600 hover:text-gray-400 text-xs font-mono transition-colors">Sıfırla</button>
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
        <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-3">Hata Enjeksiyonu</div>
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
            {pendingErrors.length} hata sırada bekleniyor
          </div>
        )}
      </div>

      {/* Log */}
      <div className="flex-1 flex flex-col min-h-[300px] p-3">
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between">
            <div className="text-gray-500 text-xs font-mono uppercase tracking-wider">Konsol & Kayıt</div>
            <div className="flex gap-2">
              {!isRecording ? (
                <button 
                  onClick={onStartRecording}
                  disabled={status !== 'running'}
                  className="text-[10px] font-mono text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors disabled:opacity-30"
                >
                  🔴 Kaydı Başlat
                </button>
              ) : (
                <button 
                  onClick={onStopRecording}
                  className="text-[10px] font-mono text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors animate-pulse"
                >
                  ⏹ Kaydı Durdur
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-800 pt-2">
            <label className="text-[10px] font-mono text-gray-500 hover:text-blue-400 flex items-center gap-1 transition-colors cursor-pointer">
              📂 Oturum Oynat
              <input 
                type="file" 
                className="hidden" 
                accept=".json" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const data = JSON.parse(ev.target?.result as string);
                        onStartPlayback(data);
                      } catch (err) {
                        alert('Hatalı dosya formatı!');
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
              />
            </label>
            <button 
              onClick={onExportLogs}
              className="text-[10px] font-mono text-gray-500 hover:text-green-400 flex items-center gap-1 transition-colors"
              title="Tüm TX/RX kaydını CSV olarak indir"
            >
              📥 CSV Aktar
            </button>
          </div>
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto bg-gray-950 rounded border border-gray-800 p-2 font-mono text-[10px] space-y-0.5">
          {logEntries.length === 0 && (
            <div className="text-gray-700">Simülasyon başlatıldığında log burada görünecek...</div>
          )}
          {logEntries.map((entry, i) => {
            let colorClass = 'text-gray-500';
            if (entry.type === 'tx') colorClass = 'text-green-500';
            else if (entry.type === 'rx') colorClass = 'text-blue-400';
            else if (entry.type === 'error') colorClass = 'text-red-400';
            else if (entry.type === 'info') colorClass = 'text-gray-400 italic';

            return (
              <div key={i} className={colorClass}>
                <span className="text-gray-700">[{entry.time}] </span>
                {entry.text}
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
