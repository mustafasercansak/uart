import React, { memo } from 'react';
import { Terminal, Activity, FileDown, Circle, Square, HelpCircle, Plus, Edit3, ShieldCheck, FileText, ClipboardCheck, Globe } from 'lucide-react';
import type { SimulationState, FrameProfile, Scenario, OutputMode } from '../../../types';
import { useTranslation } from '../../../i18n/LanguageContext';

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
  onAddProfile: () => void;
  onEditProfile: (profile: FrameProfile) => void;
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
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  signalIntegrity: {
    noiseLevel: number;
    jitterMs: number;
    bitFlipsEnabled: boolean;
  };
  validationSession: SimulationState['validationSession'];
  onStartValidation: () => void;
  onStopValidation: () => void;
  onViewReport: () => void;
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
  timingStats = { averageLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0, jitterMs: 0 },
  isRecording,
  onStartRecording,
  onStopRecording,
  onAddProfile,
  onEditProfile,
  signalIntegrity,
  validationSession,
  onStartValidation,
  onStopValidation,
  onViewReport
}: StatBarProps) => {
  const { t, locale, setLocale } = useTranslation();
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

  const handleExport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      profile: selectedProfile?.name || 'Unknown',
      stats: {
        frameCount,
        errorCount,
        elapsedTime: formatMs(elapsedMs),
        avgLatency: timingStats.averageLatencyMs,
        jitter: timingStats.jitterMs
      },
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `uart_report_${new Date().getTime()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="px-5 py-3 glass-panel border-b-0 m-2 rounded-2xl flex flex-wrap items-center gap-x-6 gap-y-3 shrink-0 relative z-50 overflow-visible">
      <div className="flex items-center gap-3 pr-4 border-r border-white/5">
        <div className={`w-3 h-3 rounded-full ${status === 'running' ? 'bg-emerald-400 animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.4)]' : status === 'paused' ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]' : 'bg-gray-600'}`} />
        <span className={`text-[11px] font-mono uppercase font-black tracking-widest ${status === 'running' ? 'text-emerald-400' : status === 'paused' ? 'text-amber-400' : 'text-gray-500'}`}>
          {status === 'running' ? t('common.live') : status === 'paused' ? t('common.paused') : t('common.idle')}
        </span>
      </div>

      {/* Backend Status */}
      <div className="flex items-center gap-2 pr-4 border-r border-white/5">
        <div className={`w-2.5 h-2.5 rounded-full ${networkConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'}`} />
        <span className={`text-[10px] font-mono font-black uppercase tracking-tight ${networkConnected ? 'text-emerald-400' : 'text-red-500'}`}>
          {t('common.engine')}: {networkConnected ? t('common.online') : t('common.offline')}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <select 
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] font-mono text-gray-200 outline-none focus:border-green-700 w-32"
          value={selectedProfileId ?? ''} 
          onChange={(e) => onSetProfile(e.target.value)} 
          disabled={status !== 'stopped'}
        >
          <option value="">— {t('dashboard.profile')} —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button 
          onClick={onAddProfile}
          className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-emerald-500 rounded transition-colors"
          title={t('dashboard.profile')}
        >
          <Plus size={14} />
        </button>
        {selectedProfile && (
          <button 
            onClick={() => onEditProfile(selectedProfile)}
            className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-blue-400 rounded transition-colors"
          >
            <Edit3 size={14} />
          </button>
        )}

        <select 
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] font-mono text-gray-200 outline-none focus:border-green-700 w-32"
          value={selectedScenarioId ?? ''} 
          onChange={(e) => onSetScenario(e.target.value)} 
          disabled={status !== 'stopped'}
        >
          <option value="">— {t('dashboard.noScenario')} —</option>
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
          <option value="serial">{t('statBar.serialPort')}</option>
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
                    <option value="">{networkConnected ? t('common.offline') : '...'}</option>
                ) : (
                    availablePorts.map(p => <option key={p.path} value={p.path}>{p.path}</option>)
                )}
              </select>
              <button 
                onClick={() => onConnectSerial(selectedPort)} 
                disabled={!selectedProfileId || status !== 'stopped' || !selectedPort || !networkConnected}
                className="px-2 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-mono rounded font-bold transition-all"
              >
                {t('dashboard.connect')}
              </button>
            </div>
          ) : (
            <button 
              onClick={onDisconnectSerial} 
              disabled={status !== 'stopped'}
              className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-[10px] font-mono rounded font-bold"
            >
              {t('dashboard.disconnect')}
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
          {analyzerMode ? t('dashboard.standardMode') : t('dashboard.analyzerMode')}
        </button>
        <button 
          onClick={handleExport}
          className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 border bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
        >
          <FileDown size={14} />
          {t('dashboard.report')}
        </button>

        {/* MEDICAL VALIDATION BUTTONS */}
        {!validationSession ? (
          <button 
            onClick={onStartValidation}
            className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/5 text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/50"
          >
            <ShieldCheck size={14} />
            {t('dashboard.compliance')}
          </button>
        ) : validationSession.status === 'running' ? (
          <button 
            onClick={onStopValidation}
            className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 border border-rose-500 bg-rose-500/10 text-rose-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.3)]"
          >
            <ClipboardCheck size={14} />
            STOP TEST
          </button>
        ) : (
          <button 
            onClick={onViewReport}
            className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 border border-blue-500/50 bg-blue-500/10 text-blue-400 hover:text-white hover:bg-blue-600 hover:border-blue-500 shadow-lg shadow-blue-500/10"
          >
            <FileText size={14} />
            {t('dashboard.viewReport')}
          </button>
        )}

        <button 
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={status !== 'running'}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
            isRecording 
              ? 'bg-red-900/20 border-red-500/50 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
              : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-white hover:border-gray-500'
          } disabled:opacity-30`}
        >
          {isRecording ? (
            <>
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              {t('dashboard.recording')}
              <Square size={10} className="fill-current" />
            </>
          ) : (
            <>
              <Circle size={10} className="text-gray-600 fill-current group-hover:text-red-500" />
              {t('dashboard.rec')}
            </>
          )}
        </button>

        <div className="flex gap-1 border-l border-gray-800 pl-3">
          {/* Language Switcher */}
          <button 
            onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
            className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 border bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-emerald-500"
          >
            <Globe size={14} className={locale === 'en' ? 'text-blue-400' : 'text-emerald-400'} />
            {locale.toUpperCase()}
          </button>

          <button 
            onClick={() => window.open('/help', '_blank')}
            className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 border bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
          >
            <HelpCircle size={14} />
          </button>
          {status === 'stopped' ? (
            <button 
              onClick={onStart} 
              disabled={!selectedProfileId || (outputMode === 'serial' && !serialConnected) || (outputMode === 'tcp' && !networkConnected)}
              className="px-3 py-1 bg-green-700 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-mono rounded font-bold transition-all shadow-lg shadow-green-900/10"
            >
              ▶ {t('common.start')}
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

      {/* Stats */}
      <div className="flex gap-3 text-[9px] font-mono border-l border-gray-800 pl-3">
        <div className="hidden lg:flex items-center gap-1.5 border-r border-gray-900 pr-3">
             <span className="text-gray-600 uppercase">Signal:</span>
             <div className="flex items-center gap-2">
                 <div className="flex flex-col">
                     <span className="text-[7px] text-gray-500 leading-none">{t('stats.noise')}</span>
                     <span className={signalIntegrity.noiseLevel > 0.5 ? 'text-amber-500' : 'text-emerald-500'}>
                         {(signalIntegrity.noiseLevel * 100).toFixed(0)}%
                     </span>
                 </div>
                 <div className="flex flex-col">
                     <span className="text-[7px] text-gray-500 leading-none">{t('stats.jitter')}</span>
                     <span className="text-blue-400">{signalIntegrity.jitterMs}ms</span>
                 </div>
             </div>
        </div>
        <div className="hidden sm:block"><span className="text-gray-600 font-black">{t('stats.frames')}:</span> <span className="text-gray-300">{frameCount}</span></div>
        <div>
           <span className="text-gray-600 font-black">{t('stats.latency')}:</span> 
           <span className={`ml-1 font-bold ${timingStats.averageLatencyMs > 100 ? 'text-red-400' : 'text-emerald-400'}`}>
             {timingStats.averageLatencyMs.toFixed(1)}ms
           </span>
        </div>
        <div><span className="text-gray-600 font-black">{t('stats.error')}:</span> <span className={errorCount > 0 ? 'text-red-400' : 'text-gray-400'}>{errorCount}</span></div>
        <div><span className="text-gray-600 font-black">{t('stats.time')}:</span> <span className="text-gray-300">{formatMs(elapsedMs)}</span></div>
      </div>
    </div>
  );
});

StatBar.displayName = 'StatBar';

export default StatBar;
