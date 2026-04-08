import { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { FrameProfile, Scenario, ErrorType, OutputMode, FlagsConfig, WaveformConfig } from '../../types';
import { loadProfiles, loadScenarios } from '../../store/storage';
import { useSimulation } from '../../hooks/useSimulation';

const ERROR_TYPES: Array<{ type: ErrorType; label: string; color: string }> = [
  { type: 'corrupt_checksum', label: 'Checksum Boz', color: 'text-red-400 border-red-800/50 bg-red-900/20 hover:bg-red-900/40' },
  { type: 'wrong_sync', label: 'Yanlış Sync', color: 'text-orange-400 border-orange-800/50 bg-orange-900/20 hover:bg-orange-900/40' },
  { type: 'skip_bytes', label: 'Byte Atla', color: 'text-yellow-400 border-yellow-800/50 bg-yellow-900/20 hover:bg-yellow-900/40' },
  { type: 'extra_bytes', label: 'Ekstra Byte', color: 'text-purple-400 border-purple-800/50 bg-purple-900/20 hover:bg-purple-900/40' },
  { type: 'delay_frame', label: 'Frame Gecikmesi', color: 'text-blue-400 border-blue-800/50 bg-blue-900/20 hover:bg-blue-900/40' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-gray-950 border border-gray-800 p-2 font-mono text-[10px] shadow-xl">
      <div className="text-gray-500 mb-1">{label}ms</div>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-300">{entry.name}:</span>
            <span className="text-white font-bold">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}s ${m % 60}d ${s % 60}s`;
  if (m > 0) return `${m}d ${s % 60}s`;
  return `${s}s ${ms % 1000}ms`;
}

export default function SimulationDashboard() {
  const [profiles] = useState<FrameProfile[]>(() => loadProfiles());
  const [scenarios] = useState<Scenario[]>(() => loadScenarios());
  const { state, start, stop, pause, resume, overrideField, overrideBit, injectError, resetOverrides, connectSerial, disconnectSerial, setProfile, setScenario, setOutputMode, setUiVisible } = useSimulation();
  const { waveformHistory, logEntries, profileId: selectedProfileId, scenarioId: selectedScenarioId, outputMode } = state;
  const logRef = useRef<HTMLDivElement>(null);

  // Sync visibility for performance
  useEffect(() => {
    setUiVisible(true);
    return () => setUiVisible(false);
  }, [setUiVisible]);

  // Initialize global state with first profile if empty
  useEffect(() => {
    if (!selectedProfileId && profiles.length > 0) {
      setProfile(profiles[0].id);
    }
  }, [selectedProfileId, profiles, setProfile]);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;
  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (state.status === 'running') pause();
        else if (state.status === 'paused' && selectedProfile) resume(selectedProfile, selectedScenario);
      }
      if (e.code === 'Escape') stop();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.status, selectedProfile, selectedScenario, pause, resume, stop]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logEntries]);

  const handleStart = () => {
    if (!selectedProfile) return;
    start(selectedProfile, selectedScenario, outputMode);
  };

  const waveformFields = selectedProfile?.fields.filter((f) => f.type === 'waveform') ?? [];
  const allRangeFields = selectedProfile?.fields.filter((f) => f.type === 'range') ?? [];
  const intensityBarFields = allRangeFields.filter((f) => f.name.toLowerCase().includes('bar') || f.name.toLowerCase().includes('signal'));
  const numericVitalsFields = allRangeFields.filter((f) => !intensityBarFields.find((ib) => ib.id === f.id));
  const flagsFields = selectedProfile?.fields.filter((f) => f.type === 'flags') ?? [];

  const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316'];

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Control Bar */}
      <div className="px-5 py-3 bg-gray-950 border-b border-gray-800 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${state.status === 'running' ? 'bg-green-400 animate-pulse' : state.status === 'paused' ? 'bg-yellow-400' : 'bg-gray-600'}`} />
          <span className="text-gray-400 text-xs font-mono uppercase">{state.status === 'running' ? 'Çalışıyor' : state.status === 'paused' ? 'Duraklatıldı' : 'Durdu'}</span>
        </div>

        <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
          value={selectedProfileId ?? ''} onChange={(e) => setProfile(e.target.value)} disabled={state.status !== 'stopped'}>
          <option value="">— Profil Seçin —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
          value={selectedScenarioId ?? ''} onChange={(e) => setScenario(e.target.value)} disabled={state.status !== 'stopped'}>
          <option value="">— Senaryo Yok —</option>
          {scenarios.filter((s) => !selectedProfileId || s.profileId === selectedProfileId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
          value={outputMode} onChange={(e) => setOutputMode(e.target.value as OutputMode)} disabled={state.status !== 'stopped'}>
          <option value="log">Yalnızca Log</option>
          <option value="serial">Seri Port</option>
        </select>

        {outputMode === 'serial' && (
          <div className="flex items-center ml-2 border-l border-gray-700 pl-3">
            {!state.serialConnected ? (
              <button onClick={() => selectedProfile && connectSerial(selectedProfile.baudRate)} disabled={!selectedProfile || state.status !== 'stopped'}
                className="px-3 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono rounded font-bold transition-colors">
                Bağlan
              </button>
            ) : (
              <button onClick={disconnectSerial} disabled={state.status !== 'stopped'}
                className="px-3 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono rounded font-bold transition-colors">
                Kopar
              </button>
            )}
            {state.serialConnected && <span className="ml-2 text-green-400 text-xs font-mono">Bağlı</span>}
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          {state.status === 'stopped' && (
            <button onClick={handleStart} disabled={!selectedProfileId || (outputMode === 'serial' && !state.serialConnected)}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono rounded font-bold transition-colors">
              ▶ Başlat
            </button>
          )}
          {state.status === 'running' && (
            <>
              <button onClick={pause} className="px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-mono rounded font-bold transition-colors">⏸ Duraklat</button>
              <button onClick={stop} className="px-4 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs font-mono rounded font-bold transition-colors">■ Durdur</button>
            </>
          )}
          {state.status === 'paused' && (
            <>
              <button onClick={() => selectedProfile && resume(selectedProfile, selectedScenario)}
                className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-mono rounded font-bold transition-colors">
                ▶ Devam Et
              </button>
              <button onClick={stop} className="px-4 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs font-mono rounded font-bold transition-colors">■ Durdur</button>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-xs font-mono">
          <div><span className="text-gray-600">Frame:</span> <span className="text-gray-300">{state.frameCount.toLocaleString()}</span></div>
          <div><span className="text-gray-600">FPS:</span> <span className="text-gray-300">{state.framesPerSecond}</span></div>
          <div><span className="text-gray-600">Hata:</span> <span className={state.errorCount > 0 ? 'text-red-400' : 'text-gray-300'}>{state.errorCount}</span></div>
          <div><span className="text-gray-600">Süre:</span> <span className="text-gray-300">{formatMs(state.elapsedMs)}</span></div>
        </div>
      </div>

      {/* Main content scroll area */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-gray-900/50">
        <div className="flex flex-col lg:flex-row min-h-full">
          {/* Left: Frame Monitor + Waveform */}
          <div className="flex-1 flex flex-col border-r border-gray-800">
            {/* Live Frame Monitor */}
            <div className="p-4 border-b border-gray-800">
              <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-3">Canlı Frame</div>
              {state.lastFrame ? (
                <div className="space-y-2">
                  {/* Raw hex */}
                  <div className="bg-gray-950 rounded p-3 font-mono text-xs">
                    <span className="text-gray-600">HEX: </span>
                    <span className="text-green-400">{state.lastFrame.rawHex}</span>
                    {state.lastFrame.errors.length > 0 && (
                      <span className="ml-3 text-red-400 text-[10px]">{state.lastFrame.errors[0]}</span>
                    )}
                  </div>
                  {/* Field breakdown */}
                  <div className="flex flex-wrap gap-2">
                    {state.lastFrame.fields.map((f) => (
                      <div key={f.name} className={`bg-gray-800 rounded px-2 py-1.5 border ${state.lastFrame?.errors.length ? 'border-red-800/30' : 'border-gray-700'}`}>
                        <div className="text-gray-500 text-[10px] font-mono">{f.name}</div>
                        <div className="text-gray-200 text-xs font-mono font-bold">0x{f.hex.replace(' ', '')}</div>
                        <div className="text-gray-500 text-[10px] font-mono">{f.decimal}</div>
                        {f.flags && (
                          <div className="mt-1 space-y-0.5">
                            {Object.entries(f.flags).map(([name, val]) => (
                              <div key={name} className={`text-[9px] font-mono ${val ? 'text-green-400' : 'text-gray-600'}`}>
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
                <div className="text-gray-700 font-mono text-xs">Simülasyon başlatılmadı...</div>
              )}
            </div>

            {/* Recent Frames Scroll */}
            <div className="p-3 border-b border-gray-800 max-h-40 overflow-y-auto">
              <div className="text-gray-600 text-[10px] font-mono uppercase tracking-wider mb-2">Son Frameler</div>
              <div className="space-y-0.5">
                {state.recentFrames.slice(0, 20).map((frame, i) => (
                  <div key={frame.frameNumber} className={`text-[10px] font-mono flex items-center gap-2 ${frame.errors.length > 0 ? 'text-red-400' : 'text-gray-500'} ${i === 0 ? 'text-green-400' : ''}`}>
                    <span className="text-gray-700 w-6 text-right">{frame.frameNumber}</span>
                    <span>{frame.rawHex}</span>
                    {frame.errors.length > 0 && <span className="text-red-400">⚠</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Waveform Chart */}
            {waveformFields.length > 0 && waveformHistory.length > 1 && (
              <div className="p-4 border-b border-gray-800 h-48 flex flex-col">
                <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-2">Dalga Formu</div>
                <div className="flex-1 flex gap-4 min-h-0">
                  {/* Vertical Intensity Bars */}
                  {intensityBarFields.length > 0 && (
                    <div className="flex gap-1 h-full py-2">
                      {intensityBarFields.map((f, i) => {
                        const val = waveformHistory[waveformHistory.length - 1]?.[f.name] ?? 0;
                        const cfg = f.typeConfig as import('../../types').RangeConfig;
                        const percent = Math.min(100, Math.max(0, ((val - cfg.min) / (cfg.max - cfg.min)) * 100));
                        return (
                          <div key={f.id} className="w-4 h-full bg-gray-950 rounded border border-gray-800 flex flex-col justify-end p-0.5 relative group">
                            <div 
                              className="w-full bg-gradient-to-t from-orange-500 via-yellow-500 to-green-500 rounded-sm transition-all duration-100" 
                              style={{ height: `${percent}%` }}
                            />
                            {/* Segment markers */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                              {[...Array(6)].map((_, j) => <div key={j} className="h-px bg-white w-full" />)}
                            </div>
                            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-gray-500 hidden group-hover:block whitespace-nowrap">
                              {f.name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={waveformHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="t" hide />
                        <YAxis domain={[0, 255]} tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'monospace' }} />
                        <Tooltip content={CustomTooltip} />
                        <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'monospace', fontSize: '10px', textTransform: 'uppercase' }} />
                        {waveformFields.map((f, i) => (
                          <Line key={f.name} type="monotone" dataKey={f.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} isAnimationActive={false} strokeWidth={2} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Numeric chart for range fields */}
            {numericVitalsFields.length > 0 && waveformHistory.length > 1 && (
              <div className="p-4 flex-1 min-h-[300px]">
                <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-2">Anlık Değerler</div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={waveformHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="t" hide />
                    <YAxis tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'monospace' }} />
                    <Tooltip content={CustomTooltip} />
                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontFamily: 'monospace', fontSize: '10px', textTransform: 'uppercase' }} />
                    {numericVitalsFields.map((f, i) => (
                      <Line key={f.name} type="monotone" dataKey={f.name} stroke={CHART_COLORS[(i + 2) % CHART_COLORS.length]} dot={false} isAnimationActive={false} strokeWidth={1.5} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Right: Controls */}
          <div className="w-80 flex flex-col border-l border-gray-800 bg-gray-900/30">
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
                            const currentVal = state.bitOverrides[bitKey] ?? bit.defaultValue;
                            return (
                              <button
                                key={bit.index}
                                onClick={() => overrideBit(bitKey, currentVal ? 0 : 1)}
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
                  <button onClick={resetOverrides} className="text-gray-600 hover:text-gray-400 text-xs font-mono transition-colors">Sıfırla</button>
                </div>
                <div className="space-y-3">
                  {allRangeFields.map((field) => {
                    const cfg = field.typeConfig as import('../../types').RangeConfig;
                    const currentVal = state.fieldOverrides[field.id] ?? Math.round((cfg.min + cfg.max) / 2);
                    const hasOverride = state.fieldOverrides[field.id] !== undefined;
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
                          onChange={(e) => overrideField(field.id, Number(e.target.value))}
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
                {ERROR_TYPES.map(({ type, label, color }) => (
                  <button
                    key={type}
                    onClick={() => injectError(type)}
                    disabled={state.status !== 'running'}
                    className={`text-[10px] font-mono px-2 py-1.5 rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${color}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {state.pendingErrors.length > 0 && (
                <div className="mt-2 text-orange-400 text-[10px] font-mono">
                  {state.pendingErrors.length} hata sırada bekleniyor
                </div>
              )}
            </div>

            {/* Log */}
            <div className="flex-1 flex flex-col min-h-[300px] p-3">
              <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-2">Konsol</div>
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
        </div>
      </div>
    </div>
  );
}
