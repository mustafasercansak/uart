import React, { memo } from 'react';
import { Terminal, Activity, FileDown, Circle, Square, HelpCircle, Plus, Edit3, ShieldCheck, FileText, ClipboardCheck, Globe } from 'lucide-react';
import type { SimulationState, FrameProfile, Scenario, OutputMode } from '../../../types';
import { useTranslation } from '../../../i18n/context';
import { loadLastSettings, saveLastSettings } from '../../../lib/lastSettings';
import { useNavigate } from 'react-router-dom';
import sharedConfig from '../../../../shared-config.json';

const UART_BAUD_RATES = [
  110, 300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400,
  56000, 57600, 76800, 115200, 128000, 230400, 250000, 256000, 460800,
  500000, 576000, 921600, 1000000, 1152000, 1500000, 2000000,
  2500000, 3000000, 3500000, 4000000,
];

function formatBaudRate(baudRate: number): string {
  if (baudRate >= 1000000) {
    return `${(baudRate / 1000000).toLocaleString('en-US', { maximumFractionDigits: 2 })} Mbps`;
  }
  if (baudRate >= 1000) {
    return `${(baudRate / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} kbps`;
  }
  return `${baudRate} bps`;
}

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
  onUpdateBaudRate: (baudRate: number) => void;
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
  onViewReport,
  onUpdateBaudRate
}: StatBarProps) => {
  const { t, locale, setLocale } = useTranslation();
  const navigate = useNavigate();
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  const [selectedPort, setSelectedPort] = React.useState(() => loadLastSettings().selectedPort);
  const [tcpHost, setTcpHost] = React.useState('127.0.0.1');
  const [tcpPort, setTcpPort] = React.useState(String(sharedConfig.port || 5000));

  const handlePortChange = (port: string) => {
    setSelectedPort(port);
    saveLastSettings({ selectedPort: port });
  };

  React.useEffect(() => {
    if (availablePorts.length === 0) return;
    const saved = loadLastSettings().selectedPort;
    const match = availablePorts.find(p => p.path === saved);
    // Kaydedilmiş port varsa onu seç, yoksa ilkini seç
    const best = match?.path ?? availablePorts[0].path;
    if (!selectedPort || !availablePorts.find(p => p.path === selectedPort)) {
      handlePortChange(best);
    }
  }, [availablePorts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      profile: selectedProfile?.name || t('statBar.unknown'),
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
    <div className="px-3 py-1 glass-panel border-b-0 m-1 rounded-lg flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0 relative z-50 overflow-visible transition-all duration-300">
      <div className="flex items-center gap-1 p-0.5 bg-gray-900/50 rounded border border-gray-800">
        <select 
          className="bg-gray-950 border border-transparent hover:border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none focus:border-green-700 w-24 transition-all"
          value={selectedProfileId ?? ''} 
          onChange={(e) => onSetProfile(e.target.value)} 
          disabled={status !== 'stopped'}
        >
          <option value="">— {t('dashboard.profile')} —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex items-center gap-0.5">
          <button 
            onClick={onAddProfile}
            className="p-0.5 hover:bg-gray-800 text-emerald-500 rounded transition-colors"
            title={t('dashboard.profile')}
          >
            <Plus size={10} />
          </button>
          {selectedProfile && (
            <button 
              onClick={() => onEditProfile(selectedProfile)}
              className="p-0.5 hover:bg-gray-800 text-blue-400 rounded transition-colors"
            >
              <Edit3 size={10} />
            </button>
          )}
        </div>
        <div className="w-px h-2.5 bg-gray-800 mx-0.5" />
        <select 
          className="bg-gray-950 border border-transparent hover:border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none focus:border-green-700 w-24 transition-all"
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

      <div className="flex items-center gap-1 border-l border-gray-800/50 pl-2">
        <select 
          className="bg-gray-800/50 border border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none focus:border-green-700"
          value={outputMode} 
          onChange={(e) => onSetOutputMode(e.target.value as OutputMode)} 
          disabled={status !== 'stopped'}
        >
          <option value="serial">{t('statBar.serialPort')}</option>
          <option value="tcp">{t('statBar.tcpClient')}</option>
        </select>
        
        {outputMode === 'serial' && selectedProfile && (
          <select
            aria-label={t('statBar.baudRate')}
            className="bg-gray-950 border border-gray-800 rounded px-1 py-0.5 text-[7.5px] font-mono text-gray-300 outline-none focus:border-green-700 w-24"
            value={selectedProfile.baudRate}
            onChange={(e) => onUpdateBaudRate(Number(e.target.value))}
            disabled={status !== 'stopped'}
            title={`${t('statBar.baudRate')}: ${selectedProfile.baudRate.toLocaleString()} baud`}
          >
            {!UART_BAUD_RATES.includes(selectedProfile.baudRate) && (
              <option value={selectedProfile.baudRate}>
                {formatBaudRate(selectedProfile.baudRate)}
              </option>
            )}
            {UART_BAUD_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {formatBaudRate(rate)}
              </option>
            ))}
          </select>
        )}
      </div>

      {outputMode === 'serial' && (
        <div className="flex items-center gap-1 border-l border-gray-800/50 pl-2">
          {!serialConnected ? (
            <>
              <input 
                type="text"
                list="serial-ports-list"
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none w-24 focus:border-blue-500"
                value={selectedPort}
                onChange={(e) => handlePortChange(e.target.value)}
                onFocus={onGetPorts}
                disabled={status !== 'stopped'}
                placeholder={t('statBar.examplePort')}
                title={t('statBar.typeOrSelect')}
              />
              <datalist id="serial-ports-list">
                {availablePorts.map(p => <option key={p.path} value={p.path} />)}
              </datalist>
              <button 
                onClick={() => onConnectSerial(selectedPort)} 
                disabled={!selectedProfileId || status !== 'stopped' || !selectedPort}
                className="px-1.5 py-0.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-30 text-white text-[8.5px] font-mono rounded font-bold transition-all"
              >
                {t('dashboard.connect')}
              </button>
            </>
          ) : (
            <button 
              onClick={onDisconnectSerial} 
              disabled={status !== 'stopped'}
              className="px-1.5 py-0.5 bg-rose-700 hover:bg-rose-600 text-white text-[8.5px] font-mono rounded font-bold"
            >
              {t('dashboard.disconnect')}
            </button>
          )}
        </div>
      )}

      {(outputMode === 'tcp' || outputMode === 'tcp-server') && (
        <div className="flex items-center gap-1 border-l border-gray-800/50 pl-2">
          {!networkConnected ? (
            <>
              {outputMode === 'tcp' && (
                <input 
                  type="text" 
                  value={tcpHost}
                  onChange={(e) => setTcpHost(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none w-20 focus:border-blue-500"
                  placeholder="127.0.0.1"
                  disabled={status !== 'stopped'}
                />
              )}
              {outputMode === 'tcp' && <span className="text-[8.5px] text-gray-500 font-mono">:</span>}
              <input 
                type="text" 
                value={tcpPort}
                onChange={(e) => setTcpPort(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none w-12 focus:border-blue-500"
                placeholder={String(sharedConfig.port || 5000)}
                disabled={status !== 'stopped'}
              />
              <button 
                onClick={() => onConnectNetwork(outputMode === 'tcp-server' ? `tcp-server://${tcpPort}` : `tcp://${tcpHost}:${tcpPort}`)}
                disabled={status !== 'stopped' || !tcpPort || (outputMode === 'tcp' && !tcpHost)}
                className="px-1.5 py-0.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-30 text-white text-[8.5px] font-mono rounded font-bold transition-all"
              >
                {outputMode === 'tcp-server' ? t('statBar.tcpListen') : t('dashboard.connect')}
              </button>
            </>
          ) : (
            <button 
              onClick={onDisconnectNetwork} 
              disabled={status !== 'stopped'}
              className="px-1.5 py-0.5 bg-rose-700 hover:bg-rose-600 text-white text-[8.5px] font-mono rounded font-bold"
            >
              {t('dashboard.disconnect')}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={onToggleAnalyzerMode}
          className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1 border ${
            analyzerMode ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-400' : 'bg-blue-900/20 border-blue-800/40 text-blue-400'
          }`}
        >
          <Activity size={10} className={analyzerMode ? 'animate-pulse' : ''} />
          {analyzerMode ? t('dashboard.standardMode') : t('dashboard.analyzerMode')}
        </button>
        <button
          onClick={handleExport}
          className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1 border bg-gray-900/40 border-gray-800 text-gray-500 hover:text-white hover:border-gray-600"
        >
          <FileDown size={10} />
          {t('dashboard.report')}
        </button>

        {/* MEDICAL VALIDATION BUTTONS */}
        {!validationSession ? (
          <button
            onClick={onStartValidation}
            className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1 border border-emerald-500/30 bg-emerald-500/5 text-emerald-500 hover:bg-emerald-400/10"
          >
            <ShieldCheck size={10} />
            {t('dashboard.compliance')}
          </button>
        ) : validationSession.status === 'running' ? (
          <button
            onClick={onStopValidation}
            className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1 border border-rose-500/50 bg-rose-500/10 text-rose-500 animate-pulse"
          >
            <ClipboardCheck size={10} />
            {t('common.stop').toUpperCase()}
          </button>
        ) : (
          <button
            onClick={onViewReport}
            className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1 border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:text-white"
          >
            <FileText size={10} />
            {t('dashboard.viewReport')}
          </button>
        )}

        <button
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={status !== 'running'}
          className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1 border ${
            isRecording 
              ? 'bg-rose-900/20 border-rose-500/40 text-rose-500' 
              : 'bg-gray-900/40 border-gray-800 text-gray-500 hover:text-white hover:border-gray-600'
          } disabled:opacity-30`}
        >
          {isRecording ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <Square size={6} className="fill-current" />
            </>
          ) : (
            <>
              <Circle size={6} className="text-gray-600 fill-current" />
              {t('dashboard.rec')}
            </>
          )}
        </button>

        <div className="flex gap-1 border-l border-gray-800/50 pl-1.5">
          {/* Language Switcher */}
          <button 
            onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-all border border-transparent hover:border-gray-700"
            title={locale.toUpperCase()}
          >
            <Globe size={11} className={locale === 'en' ? 'text-blue-400' : 'text-emerald-400'} />
          </button>

          <button 
            onClick={() => navigate('/help')}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-all border border-transparent hover:border-gray-700"
          >
            <HelpCircle size={11} />
          </button>
          
          <div className="w-px h-3 bg-gray-800 mx-0.5 self-center" />

          {status === 'stopped' ? (
            <button 
              onClick={onStart} 
              disabled={!selectedProfileId}
              className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 text-white text-[9px] font-mono rounded font-bold transition-all shadow-sm"
            >
              {t('common.start').toUpperCase()}
            </button>
          ) : status === 'running' ? (
            <div className="flex gap-0.5">
              <button onClick={onPause} className="px-1.5 py-0.5 bg-amber-700 hover:bg-amber-600 text-white text-[9px] font-mono rounded font-bold shadow-sm">{t('common.pause').toUpperCase()}</button>
              <button onClick={onStop} className="px-1.5 py-0.5 bg-rose-800 hover:bg-rose-700 text-white text-[9px] font-mono rounded font-bold shadow-sm">{t('common.stop').toUpperCase()}</button>
            </div>
          ) : (
            <div className="flex gap-0.5">
              <button onClick={onResume} className="px-1.5 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white text-[9px] font-mono rounded font-bold shadow-sm">{t('common.resume').toUpperCase()}</button>
              <button onClick={onStop} className="px-1.5 py-0.5 bg-rose-800 hover:bg-rose-700 text-white text-[9px] font-mono rounded font-bold shadow-sm">{t('common.stop').toUpperCase()}</button>
            </div>
          )}
        </div>
      </div>

      {/* Stats - Telemetry Strip */}
      <div className="flex items-center gap-2 text-[7.5px] font-mono border-l border-white/5 pl-2 h-5">
        <div className="hidden min-[1300px]:flex items-center gap-1.5 border-r border-white/5 pr-2 h-3.5">
             <div className="flex items-baseline gap-0.5">
                 <span className="text-gray-600 uppercase font-black text-[6.5px]">{t('stats.noise')}:</span>
                 <span className={`font-bold ${signalIntegrity.noiseLevel > 0.5 ? 'text-amber-500' : 'text-emerald-500'}`}>
                     {(signalIntegrity.noiseLevel * 100).toFixed(0)}%
                 </span>
             </div>
             <div className="w-px h-2 bg-white/5" />
             <div className="flex items-baseline gap-0.5">
                 <span className="text-gray-600 uppercase font-black text-[6.5px]">{t('stats.jitter')}:</span>
                 <span className="text-blue-400 font-bold">{signalIntegrity.jitterMs}ms</span>
             </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-baseline gap-0.5">
            <span className="text-gray-600 font-black uppercase text-[6.5px]">{t('stats.frames')}:</span> 
            <span className="text-gray-300 font-bold">{frameCount}</span>
          </div>

          <div className="flex items-baseline gap-0.5">
            <span className="text-gray-600 font-black uppercase text-[6.5px]">{t('stats.latency')}:</span> 
            <span className={`font-bold ${timingStats.averageLatencyMs > 100 ? 'text-red-400' : 'text-emerald-400'}`}>
              {timingStats.averageLatencyMs.toFixed(1)}ms
            </span>
          </div>

          <div className="flex items-baseline gap-0.5">
            <span className="text-gray-600 font-black uppercase text-[6.5px]">{t('stats.error')}:</span> 
            <span className={`font-bold ${errorCount > 0 ? 'text-rose-500' : 'text-emerald-500/50'}`}>{errorCount}</span>
          </div>

          <div className="flex items-baseline gap-0.5">
            <span className="text-gray-600 font-black uppercase text-[6.5px]">{t('stats.time')}:</span> 
            <span className="text-gray-300 font-bold">{formatMs(elapsedMs)}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

StatBar.displayName = 'StatBar';

export default StatBar;
