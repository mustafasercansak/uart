import React, { memo } from 'react';
import { Terminal, Activity, FileDown, Circle, Square, HelpCircle, Plus, Edit3, ShieldCheck, FileText, ClipboardCheck, Globe } from 'lucide-react';
import type { SimulationState, FrameProfile, Scenario, OutputMode } from '../../../types';
import { useTranslation } from '../../../i18n/context';

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
  const [selectedPort, setSelectedPort] = React.useState('');

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
    <div className="px-4 py-1.5 glass-panel border-b-0 m-2 rounded-xl flex flex-wrap items-center gap-x-3 gap-y-1.5 shrink-0 relative z-50 overflow-visible transition-all duration-300">
      <div className="flex items-center gap-2 pr-3 border-r border-white/5 h-6">
        <div className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.4)]' : status === 'paused' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'bg-gray-600'}`} />
        <span className={`text-[10px] font-mono uppercase font-black tracking-widest ${status === 'running' ? 'text-emerald-400' : status === 'paused' ? 'text-amber-400' : 'text-gray-500'}`}>
          {status === 'running' ? t('common.live') : status === 'paused' ? t('common.paused') : t('common.idle')}
        </span>
      </div>

      {/* Backend Status */}
      <div className="flex items-center gap-2 pr-3 border-r border-white/5 h-6">
        <div className={`w-2 h-2 rounded-full ${networkConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'}`} />
        <button 
          onClick={networkConnected ? onDisconnectNetwork : () => onConnectNetwork('ws://localhost:5000')}
          className={`text-[9px] font-mono font-black uppercase tracking-tight hover:underline ${networkConnected ? 'text-emerald-400' : 'text-red-500'}`}>
          {t('common.engine')}: {networkConnected ? t('common.online') : t('common.offline')}
        </button>
      </div>

      <div className="flex items-center gap-1.5 p-1 bg-gray-900/50 rounded-lg border border-gray-800">
        <select 
          className="bg-gray-950 border border-transparent hover:border-gray-700 rounded px-1.5 py-0.5 text-[9px] font-mono text-gray-200 outline-none focus:border-green-700 w-28 transition-all"
          value={selectedProfileId ?? ''} 
          onChange={(e) => onSetProfile(e.target.value)} 
          disabled={status !== 'stopped'}
        >
          <option value="">— {t('dashboard.profile')} —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <button 
            onClick={onAddProfile}
            className="p-1 hover:bg-gray-800 text-emerald-500 rounded transition-colors"
            title={t('dashboard.profile')}
          >
            <Plus size={12} />
          </button>
          {selectedProfile && (
            <button 
              onClick={() => onEditProfile(selectedProfile)}
              className="p-1 hover:bg-gray-800 text-blue-400 rounded transition-colors"
            >
              <Edit3 size={12} />
            </button>
          )}
        </div>
        <div className="w-px h-3 bg-gray-800 mx-0.5" />
        <select 
          className="bg-gray-950 border border-transparent hover:border-gray-700 rounded px-1.5 py-0.5 text-[9px] font-mono text-gray-200 outline-none focus:border-green-700 w-28 transition-all"
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

      <div className="flex items-center gap-1.5 border-l border-gray-800/50 pl-3">
        <select 
          className="bg-gray-800/50 border border-gray-700 rounded px-1.5 py-0.5 text-[9px] font-mono text-gray-200 outline-none focus:border-green-700"
          value={outputMode} 
          onChange={(e) => onSetOutputMode(e.target.value as OutputMode)} 
          disabled={status !== 'stopped'}
        >
          <option value="log">Log</option>
          <option value="serial">{t('statBar.serialPort')}</option>
          <option value="tcp">TCP</option>
        </select>
        
        {selectedProfile && (
          <div className="text-[8px] font-mono text-gray-500 border border-gray-800 px-1 py-0.5 rounded bg-gray-950">
            {selectedProfile.baudRate}
          </div>
        )}
      </div>

      {outputMode === 'serial' && (
        <div className="flex items-center gap-1.5 border-l border-gray-800/50 pl-3">
          {!serialConnected ? (
            <>
              <select 
                className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[9px] font-mono text-gray-200 outline-none w-24 focus:border-blue-500"
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
                className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-30 text-white text-[9px] font-mono rounded font-bold transition-all"
              >
                {t('dashboard.connect')}
              </button>
            </>
          ) : (
            <button 
              onClick={onDisconnectSerial} 
              disabled={status !== 'stopped'}
              className="px-2 py-0.5 bg-rose-700 hover:bg-rose-600 text-white text-[9px] font-mono rounded font-bold"
            >
              {t('dashboard.disconnect')}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 ml-auto">
        <button 
          onClick={onToggleAnalyzerMode}
          className={`px-2 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
            analyzerMode ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-400' : 'bg-blue-900/20 border-blue-800/40 text-blue-400'
          }`}
        >
          <Activity size={12} className={analyzerMode ? 'animate-pulse' : ''} />
          {analyzerMode ? t('dashboard.standardMode') : t('dashboard.analyzerMode')}
        </button>
        <button 
          onClick={handleExport}
          className="px-2 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border bg-gray-900/40 border-gray-800 text-gray-500 hover:text-white hover:border-gray-600"
        >
          <FileDown size={12} />
          {t('dashboard.report')}
        </button>

        {/* MEDICAL VALIDATION BUTTONS */}
        {!validationSession ? (
          <button 
            onClick={onStartValidation}
            className="px-2 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-emerald-500/30 bg-emerald-500/5 text-emerald-500 hover:bg-emerald-400/10"
          >
            <ShieldCheck size={12} />
            {t('dashboard.compliance')}
          </button>
        ) : validationSession.status === 'running' ? (
          <button 
            onClick={onStopValidation}
            className="px-2 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-rose-500/50 bg-rose-500/10 text-rose-500 animate-pulse"
          >
            <ClipboardCheck size={12} />
            STOP
          </button>
        ) : (
          <button 
            onClick={onViewReport}
            className="px-2 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:text-white"
          >
            <FileText size={12} />
            {t('dashboard.viewReport')}
          </button>
        )}

        <button 
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={status !== 'running'}
          className={`px-2 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
            isRecording 
              ? 'bg-rose-900/20 border-rose-500/40 text-rose-500' 
              : 'bg-gray-900/40 border-gray-800 text-gray-500 hover:text-white hover:border-gray-600'
          } disabled:opacity-30`}
        >
          {isRecording ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              {t('dashboard.recording')}
              <Square size={8} className="fill-current" />
            </>
          ) : (
            <>
              <Circle size={8} className="text-gray-600 fill-current" />
              {t('dashboard.rec')}
            </>
          )}
        </button>

        <div className="flex gap-1 border-l border-gray-800/50 pl-2">
          {/* Language Switcher */}
          <button 
            onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-all border border-transparent hover:border-gray-700"
            title={locale.toUpperCase()}
          >
            <Globe size={14} className={locale === 'en' ? 'text-blue-400' : 'text-emerald-400'} />
          </button>

          <button 
            onClick={() => window.open('/help', '_blank')}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-all border border-transparent hover:border-gray-700"
          >
            <HelpCircle size={14} />
          </button>
          
          <div className="w-px h-4 bg-gray-800 mx-1 self-center" />

          {status === 'stopped' ? (
            <button 
              onClick={onStart} 
              disabled={!selectedProfileId || (outputMode === 'serial' && !serialConnected) || (outputMode === 'tcp' && !networkConnected)}
              className="px-3 py-0.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 text-white text-[10px] font-mono rounded font-bold transition-all shadow-sm"
            >
              {t('common.start').toUpperCase()}
            </button>
          ) : status === 'running' ? (
            <div className="flex gap-1">
              <button onClick={onPause} className="px-2 py-0.5 bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-mono rounded font-bold shadow-sm">PAUSE</button>
              <button onClick={onStop} className="px-2 py-0.5 bg-rose-800 hover:bg-rose-700 text-white text-[10px] font-mono rounded font-bold shadow-sm">STOP</button>
            </div>
          ) : (
            <div className="flex gap-1">
              <button onClick={onResume} className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-mono rounded font-bold shadow-sm">RESUME</button>
              <button onClick={onStop} className="px-2 py-0.5 bg-rose-800 hover:bg-rose-700 text-white text-[10px] font-mono rounded font-bold shadow-sm">STOP</button>
            </div>
          )}
        </div>
      </div>

      {/* Stats - Telemetry Strip */}
      <div className="flex items-center gap-3 text-[8px] font-mono border-l border-white/5 pl-3 h-6">
        <div className="hidden min-[1300px]:flex items-center gap-2 border-r border-white/5 pr-3 h-4">
             <div className="flex items-baseline gap-1">
                 <span className="text-gray-600 uppercase font-black text-[7px]">{t('stats.noise')}:</span>
                 <span className={`font-bold ${signalIntegrity.noiseLevel > 0.5 ? 'text-amber-500' : 'text-emerald-500'}`}>
                     {(signalIntegrity.noiseLevel * 100).toFixed(0)}%
                 </span>
             </div>
             <div className="w-px h-2 bg-white/5" />
             <div className="flex items-baseline gap-1">
                 <span className="text-gray-600 uppercase font-black text-[7px]">{t('stats.jitter')}:</span>
                 <span className="text-blue-400 font-bold">{signalIntegrity.jitterMs}ms</span>
             </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-gray-600 font-black">{t('stats.frames')}:</span> 
            <span className="text-gray-300 font-bold">{frameCount}</span>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-gray-600 font-black">{t('stats.latency')}:</span> 
            <span className={`font-bold ${timingStats.averageLatencyMs > 100 ? 'text-red-400' : 'text-emerald-400'}`}>
              {timingStats.averageLatencyMs.toFixed(1)}ms
            </span>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-gray-600 font-black">{t('stats.error')}:</span> 
            <span className={`font-bold ${errorCount > 0 ? 'text-rose-500' : 'text-emerald-500/50'}`}>{errorCount}</span>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-gray-600 font-black">{t('stats.time')}:</span> 
            <span className="text-gray-300 font-bold">{formatMs(elapsedMs)}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

StatBar.displayName = 'StatBar';

export default StatBar;
