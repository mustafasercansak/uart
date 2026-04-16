import React, { memo } from 'react';
import { Terminal } from 'lucide-react';
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
  onGetPorts: () => void;
  availablePorts: Array<{ path: string }>;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  formatMs: (ms: number) => string;
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
  onGetPorts,
  availablePorts,
  onStart,
  onStop,
  onPause,
  onResume,
  formatMs
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
    <div className="px-5 py-3 bg-gray-950 border-b border-gray-800 flex items-center gap-4 shrink-0">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${status === 'running' ? 'bg-green-400 animate-pulse' : status === 'paused' ? 'bg-yellow-400' : 'bg-gray-600'}`} />
        <span className="text-gray-400 text-xs font-mono uppercase">
          {status === 'running' ? 'Çalışıyor' : status === 'paused' ? 'Duraklatıldı' : 'Durdu'}
        </span>
      </div>

      {/* Backend Status */}
      <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
        <div className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'}`} />
        <span className={`text-[10px] font-mono font-bold uppercase tracking-tight ${backendConnected ? 'text-emerald-500' : 'text-red-500'}`}>
          {backendConnected ? 'Backend Bağlı' : 'Backend Kesildi'}
        </span>
      </div>

      <select 
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
        value={selectedProfileId ?? ''} 
        onChange={(e) => onSetProfile(e.target.value)} 
        disabled={status !== 'stopped'}
      >
        <option value="">— Profil Seçin —</option>
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <select 
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
        value={selectedScenarioId ?? ''} 
        onChange={(e) => onSetScenario(e.target.value)} 
        disabled={status !== 'stopped'}
      >
        <option value="">— Senaryo Yok —</option>
        {scenarios.filter((s) => !selectedProfileId || s.profileId === selectedProfileId).map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <select 
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
          value={outputMode} 
          onChange={(e) => onSetOutputMode(e.target.value as OutputMode)} 
          disabled={status !== 'stopped'}
        >
          <option value="log">Yalnızca Log</option>
          <option value="serial">Seri Port</option>
          <option value="tcp">TCP (Ağ)</option>
        </select>
        
        {selectedProfile && (
          <div className="text-[10px] font-mono text-gray-500 border border-gray-800 px-2 py-1 rounded bg-gray-900/50">
            {selectedProfile.baudRate} bps
          </div>
        )}
      </div>

      {outputMode === 'serial' && (
        <div className="flex items-center ml-2 border-l border-gray-700 pl-3 gap-2">
          {!serialConnected ? (
            <>
              <select 
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[10px] font-mono text-gray-200 outline-none focus:border-blue-700 w-24"
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                onFocus={onGetPorts}
                disabled={status !== 'stopped'}
              >
                {availablePorts.length === 0 && <option value="">Port Seçin</option>}
                {availablePorts.map(p => <option key={p.path} value={p.path}>{p.path}</option>)}
              </select>
              <button 
                onClick={() => onConnectSerial(selectedPort)} 
                disabled={!selectedProfileId || status !== 'stopped' || !selectedPort}
                className="px-3 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono rounded font-bold transition-colors"
              >
                Bağlan
              </button>
            </>
          ) : (
            <button 
              onClick={onDisconnectSerial} 
              disabled={status !== 'stopped'}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono rounded font-bold transition-colors"
            >
              Kopar
            </button>
          )}
          {serialConnected && <span className="ml-2 text-green-400 text-xs font-mono font-bold">BAĞLI</span>}
        </div>
      )}

      {outputMode === 'tcp' && (
        <div className="flex items-center ml-2 border-l border-gray-700 pl-3 gap-2">
          <input 
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] font-mono text-gray-400 outline-none focus:border-blue-700 w-32"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="ws://..."
            disabled={networkConnected || status !== 'stopped'}
          />
          {!networkConnected ? (
            <button 
              onClick={() => onConnectNetwork(wsUrl)} 
              disabled={!selectedProfileId || status !== 'stopped'}
              className="px-3 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono rounded font-bold transition-colors"
            >
              Bağlan
            </button>
          ) : (
            <button 
              onClick={onDisconnectNetwork} 
              disabled={status !== 'stopped'}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono rounded font-bold transition-colors"
            >
              Kes
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 ml-auto">
        <button 
          onClick={onToggleAnalyzerMode}
          className={`px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 border ${
            analyzerMode 
              ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
              : 'bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600'
          }`}
        >
          <Terminal size={14} />
          {analyzerMode ? 'Analyzer Active' : 'Enter Pro Mode'}
        </button>

        {status === 'stopped' && (
          <button 
            onClick={onStart} 
            disabled={!selectedProfileId || (outputMode === 'serial' && !serialConnected) || (outputMode === 'tcp' && !networkConnected)}
            className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono rounded font-bold transition-colors"
          >
            ▶ Başlat
          </button>
        )}
        {status === 'running' && (
          <>
            <button onClick={onPause} className="px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-mono rounded font-bold transition-colors">⏸ Duraklat</button>
            <button onClick={onStop} className="px-4 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs font-mono rounded font-bold transition-colors">■ Durdur</button>
          </>
        )}
        {status === 'paused' && (
          <>
            <button 
              onClick={onResume}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-mono rounded font-bold transition-colors"
            >
              ▶ Devam Et
            </button>
            <button onClick={onStop} className="px-4 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs font-mono rounded font-bold transition-colors">■ Durdur</button>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs font-mono">
        <div><span className="text-gray-600">Frame:</span> <span className="text-gray-300">{frameCount.toLocaleString()}</span></div>
        <div><span className="text-gray-600">FPS:</span> <span className="text-gray-300">{framesPerSecond}</span></div>
        <div><span className="text-gray-600">Hata:</span> <span className={errorCount > 0 ? 'text-red-400' : 'text-gray-300'}>{errorCount}</span></div>
        <div><span className="text-gray-600">Süre:</span> <span className="text-gray-300">{formatMs(elapsedMs)}</span></div>
      </div>
    </div>
  );
});

StatBar.displayName = 'StatBar';

export default StatBar;
