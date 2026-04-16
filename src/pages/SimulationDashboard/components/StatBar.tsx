import React, { memo } from 'react';
import { Terminal, Activity } from 'lucide-react';
import type { SimulationState, FrameProfile, Scenario, OutputMode } from '../../../types';

interface StatBarProps {
  status: SimulationState['status'];
  frameCount: number;
  framesPerSecond: number;
  errorCount: number;
  elapsedMs: number;
  profiles: FrameProfile[];
  scenarios: Scenario[];
  selectedProfileId: string | null;
  selectedScenarioId: string | null;
  outputMode: OutputMode;
  serialConnected: boolean;
  networkConnected: boolean;
  analyzerMode: boolean;
  onSetProfile: (id: string) => void;
  onSetScenario: (id: string) => void;
  onSetOutputMode: (mode: OutputMode) => void;
  onConnectSerial: (portName: string) => void;
  onDisconnectSerial: () => void;
  onConnectNetwork: (url: string) => void;
  onDisconnectNetwork: () => void;
  onToggleAnalyzerMode: () => void;
  analyzerModeLabel?: string;
  onGetPorts: () => void;
  availablePorts: Array<{ path: string }>;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  formatMs: (ms: number) => string;
  timingStats: {
    averageLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    jitterMs: number;
  };
}

const StatBar = memo(({
  status,
  frameCount,
  framesPerSecond,
  errorCount,
  elapsedMs,
  profiles,
  scenarios,
  selectedProfileId,
  selectedScenarioId,
  outputMode,
  serialConnected,
  networkConnected,
  analyzerMode,
  onSetProfile,
  onSetScenario,
  onSetOutputMode,
  onConnectSerial,
  onDisconnectSerial,
  onConnectNetwork,
  onDisconnectNetwork,
  onToggleAnalyzerMode,
  analyzerModeLabel = 'Pro Mod',
  onGetPorts,
  availablePorts,
  onStart,
  onStop,
  onPause,
  onResume,
  formatMs,
  timingStats = { averageLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0, jitterMs: 0 }
}: StatBarProps) => {
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  const [wsUrl, setWsUrl] = React.useState('ws://localhost:8080');
  const [selectedPort, setSelectedPort] = React.useState('');
  
  // Backend connection status (networkConnected prop is used for this)
  const backendConnected = networkConnected;

  React.useEffect(() => {
    if (availablePorts.length > 0 && !selectedPort) {
      setSelectedPort(availablePorts[0].path);
    }
  }, [availablePorts, selectedPort]);

  return (
    <div className="px-3 py-2 bg-gray-950 border-b border-gray-800 flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
      <div className="flex items-center gap-2 pr-3 border-r border-gray-800">
        <div className={`w-2.5 h-2.5 rounded-full ${status === 'running' ? 'bg-green-400 animate-pulse' : status === 'paused' ? 'bg-yellow-400' : 'bg-gray-600'}`} />
        <span className="text-gray-400 text-[10px] font-mono uppercase font-bold">
          {status === 'running' ? 'Çalışıyor' : status === 'paused' ? 'Duraklatıldı' : 'Durdu'}
        </span>
      </div>

      {/* Backend Status */}
      <div className="flex items-center gap-2 pr-3 border-r border-gray-800">
        <div className={`w-2 h-2 rounded-full ${networkConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'}`} />
        <span className={`text-[9px] font-mono font-bold uppercase tracking-tight ${networkConnected ? 'text-emerald-500' : 'text-red-500'}`}>
          {networkConnected ? 'Backend' : 'Kesildi'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <select 
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] font-mono text-gray-200 outline-none focus:border-green-700 w-32"
          value={selectedProfileId ?? ''} 
          onChange={(e) => onSetProfile(e.target.value)} 
          disabled={status !== 'stopped'}
        >
          <option value="">— Profil —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select 
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] font-mono text-gray-200 outline-none focus:border-green-700 w-32"
          value={selectedScenarioId ?? ''} 
          onChange={(e) => onSetScenario(e.target.value)} 
          disabled={status !== 'stopped'}
        >
          <option value="">— Senaryo Yok —</option>
          {scenarios.filter((s) => !selectedProfileId || s.profileId === selectedProfileId).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 border-l border-gray-800 pl-3">
        <select 
          className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[10px] font-mono text-gray-200 outline-none focus:border-green-700"
          value={outputMode} 
          onChange={(e) => onSetOutputMode(e.target.value as OutputMode)} 
          disabled={status !== 'stopped'}
        >
          <option value="log">Log</option>
          <option value="serial">Seri Port</option>
          <option value="tcp">TCP</option>
        </select>
        
        {selectedProfile && (
          <div className="text-[9px] font-mono text-gray-500 border border-gray-800 px-1.5 py-0.5 rounded bg-gray-900/50">
            {selectedProfile.baudRate}
          </div>
        )}
      </div>

      {outputMode === 'serial' && (
        <div className="flex items-center border-l border-gray-700 pl-3 gap-2">
          {!serialConnected ? (
            <div className="flex items-center gap-1">
              <select 
                className="bg-gray-800 border border-gray-700 rounded px-1 py-1 text-[9px] font-mono text-gray-200 outline-none w-28 focus:border-blue-500"
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                onFocus={onGetPorts}
                disabled={status !== 'stopped' || !networkConnected}
              >
                {availablePorts.length === 0 ? (
                    <option value="">{networkConnected ? 'Port Yok' : 'Backend Bekleniyor'}</option>
                ) : (
                    availablePorts.map(p => <option key={p.path} value={p.path}>{p.path}</option>)
                )}
              </select>
              <button 
                onClick={() => onConnectSerial(selectedPort)} 
                disabled={!selectedProfileId || status !== 'stopped' || !selectedPort || !networkConnected}
                className="px-2 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-mono rounded font-bold transition-all"
                title={!networkConnected ? "Backend bağlantısı bekleniyor" : !selectedPort ? "Lütfen port seçin" : ""}
              >
                Bağlan
              </button>
            </div>
          ) : (
            <button 
              onClick={onDisconnectSerial} 
              disabled={status !== 'stopped'}
              className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-[10px] font-mono rounded font-bold"
            >
              Kopar
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1.5 ml-auto">
        <button 
          onClick={onToggleAnalyzerMode}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
            analyzerMode ? 'bg-emerald-900/20 border-emerald-800/50 text-emerald-400' : 'bg-blue-900/20 border-blue-800/50 text-blue-400'
          }`}
        >
          <Activity size={14} className={analyzerMode ? 'animate-pulse' : ''} />
          {analyzerModeLabel}
        </button>

        <div className="flex gap-1 border-l border-gray-800 pl-3">
          {status === 'stopped' ? (
            <button 
              onClick={onStart} 
              disabled={!selectedProfileId || (outputMode === 'serial' && !serialConnected) || (outputMode === 'tcp' && !networkConnected)}
              className="px-3 py-1 bg-green-700 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-mono rounded font-bold transition-all shadow-lg shadow-green-900/10"
              title={!selectedProfileId ? "Lütfen profil seçin" : (outputMode === 'serial' && !serialConnected) ? "Seri porta bağlanmalısınız" : ""}
            >
              ▶ Başlat
            </button>
          ) : status === 'running' ? (
            <>
              <button onClick={onPause} className="px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white text-[10px] font-mono rounded font-bold transition-all shadow-md">⏸</button>
              <button onClick={onStop} className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white text-[10px] font-mono rounded font-bold transition-all shadow-md">■</button>
            </>
          ) : (
            <>
              <button onClick={onResume} className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-[10px] font-mono rounded font-bold transition-all shadow-md">▶</button>
              <button onClick={onStop} className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white text-[10px] font-mono rounded font-bold transition-all shadow-md">■</button>
            </>
          )}
        </div>
      </div>

      {/* Stats - Move to very end or potentially separate row if tiny */}
      <div className="flex gap-3 text-[9px] font-mono border-l border-gray-800 pl-3">
        <div className="hidden sm:block"><span className="text-gray-600">F:</span> <span className="text-gray-300">{frameCount}</span></div>
        <div>
           <span className="text-gray-600">Latency:</span> 
           <span className={`ml-1 font-bold ${timingStats.averageLatencyMs > 100 ? 'text-red-400' : 'text-emerald-400'}`}>
             {timingStats.averageLatencyMs.toFixed(1)}ms
           </span>
        </div>
        <div>
           <span className="text-gray-600">Jitter:</span> 
           <span className="ml-1 text-gray-300">
             {timingStats.jitterMs.toFixed(2)}ms
           </span>
        </div>
        <div><span className="text-gray-600">Err:</span> <span className={errorCount > 0 ? 'text-red-400' : 'text-gray-400'}>{errorCount}</span></div>
        <div><span className="text-gray-600">T:</span> <span className="text-gray-300">{formatMs(elapsedMs)}</span></div>
      </div>
    </div>
  );
});

StatBar.displayName = 'StatBar';

export default StatBar;
