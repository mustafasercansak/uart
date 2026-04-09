import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Menu, Activity, Settings2 } from 'lucide-react';
import type { FrameProfile, Scenario, ErrorType, OutputMode } from '../../types';
import { loadProfiles, loadScenarios } from '../../store/storage';
import { useSimulation } from '../../hooks/useSimulation';

// Sub-components
import StatBar from './components/StatBar';
import FrameMonitor from './components/FrameMonitor';
import RxMonitor from './components/RxMonitor';
import WaveformCharts from './components/WaveformCharts';
import ControlPanel from './components/ControlPanel';
import LogicAnalyzer from './components/LogicAnalyzer';
import PacketInspector from './components/PacketInspector';
import VisualProtocolAnalyzer from './components/VisualProtocolAnalyzer';

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

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316'];

export default function SimulationDashboard() {
  const [profiles] = useState<FrameProfile[]>(() => loadProfiles());
  const [scenarios] = useState<Scenario[]>(() => loadScenarios());
  const [selectedFrame, setSelectedFrame] = useState<any | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  
  const { 
    state, 
    start, stop, pause, resume, 
    overrideField, overrideBit, injectError, resetOverrides, 
    connectSerial, disconnectSerial, 
    connectNetwork, disconnectNetwork,
    setProfile, setScenario, setOutputMode, setUiVisible,
    exportLogs, setProfiles,
    startRecording, stopRecording, startPlayback
  } = useSimulation();

  const { 
    waveformHistory, logEntries, 
    profileId: selectedProfileId, 
    scenarioId: selectedScenarioId, 
    outputMode,
    status,
    frameCount,
    framesPerSecond,
    errorCount,
    elapsedMs,
    lastFrame,
    lastRxFrame,
    recentFrames,
    bitOverrides,
    fieldOverrides,
    pendingErrors,
    serialConnected,
    networkConnected,
    isRecording
  } = state;

  // Sync profiles with context for RX parsing
  useEffect(() => {
    setProfiles(profiles);
  }, [profiles, setProfiles]);

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

  const selectedProfile = useMemo(() => profiles.find((p) => p.id === selectedProfileId) ?? null, [profiles, selectedProfileId]);
  const selectedScenario = useMemo(() => scenarios.find((s) => s.id === selectedScenarioId) ?? null, [scenarios, selectedScenarioId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (status === 'running') pause();
        else if (status === 'paused' && selectedProfile) resume(selectedProfile, selectedScenario);
      }
      if (e.code === 'Escape') {
        stop();
        setSelectedFrame(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, selectedProfile, selectedScenario, pause, resume, stop]);

  const handleStart = useCallback(() => {
    if (!selectedProfile) return;
    start(selectedProfile, selectedScenario, outputMode);
  }, [selectedProfile, selectedScenario, outputMode, start]);

  const handleResume = useCallback(() => {
    if (!selectedProfile) return;
    resume(selectedProfile, selectedScenario);
  }, [selectedProfile, selectedScenario, resume]);

  const flagsFields = useMemo(() => selectedProfile?.fields.filter((f) => f.type === 'flags') ?? [], [selectedProfile]);
  const allRangeFields = useMemo(() => selectedProfile?.fields.filter((f) => f.type === 'range') ?? [], [selectedProfile]);

  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden text-gray-200 font-sans">
      <StatBar 
        status={status}
        frameCount={frameCount}
        framesPerSecond={framesPerSecond}
        errorCount={errorCount}
        elapsedMs={elapsedMs}
        profiles={profiles}
        scenarios={scenarios}
        selectedProfileId={selectedProfileId}
        selectedScenarioId={selectedScenarioId}
        outputMode={outputMode}
        serialConnected={serialConnected}
        networkConnected={networkConnected}
        onSetProfile={setProfile}
        onSetScenario={setScenario}
        onSetOutputMode={setOutputMode}
        onConnectSerial={() => selectedProfile && connectSerial(selectedProfile.baudRate)}
        onDisconnectSerial={disconnectSerial}
        onConnectNetwork={connectNetwork}
        onDisconnectNetwork={disconnectNetwork}
        onStart={handleStart}
        onStop={stop}
        onPause={pause}
        onResume={handleResume}
        formatMs={formatMs}
      />

      {/* Main layout container */}
      <div className="flex-1 min-h-0 flex relative bg-[#0a0a0d] overflow-hidden">
        
        {/* LEFT PANEL */}
        <div 
          className={`shrink-0 flex flex-col bg-gray-900 border-r border-gray-800/50 transition-all duration-300 ease-in-out relative ${
            isLeftPanelOpen ? 'w-72 xl:w-80 translate-x-0' : 'w-0 -translate-x-full opacity-0'
          }`}
        >
          <div className="w-72 xl:w-80 h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <FrameMonitor 
                lastFrame={lastFrame}
                recentFrames={recentFrames}
                selectedFrameId={selectedFrame?.frameNumber}
                onSelectFrame={setSelectedFrame}
              />
              <RxMonitor 
                lastRxFrame={lastRxFrame}
                selectedFrameId={selectedFrame === lastRxFrame ? 0 : -1}
                onSelectFrame={setSelectedFrame}
              />
            </div>
            <div className="shrink-0 border-t border-gray-800/50">
              <LogicAnalyzer 
                lastTxFrame={lastFrame}
                lastRxFrame={lastRxFrame}
              />
            </div>
          </div>
        </div>

        {/* LEFT PANEL TOGGLE BUTTON */}
        <button
          onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
          className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 hover:text-white rounded-r-md shadow-lg transition-transform duration-300 ease-in-out ${
            isLeftPanelOpen ? 'translate-x-72 xl:translate-x-80' : 'translate-x-0'
          }`}
          title={isLeftPanelOpen ? "Monitörleri Gizle" : "Monitörleri Göster"}
        >
          {isLeftPanelOpen ? <ChevronLeft size={16} /> : <Activity size={16} />}
        </button>

        {/* CENTER PANEL (WAVEFORMS) */}
        <div className="flex-1 min-w-0 flex flex-col relative bg-gradient-to-br from-[#0a0a0d] to-[#12121a]">
          <div className="flex-1 min-h-0 overflow-hidden relative p-4 flex flex-col">
            <div className="flex-1 min-h-0 bg-gray-900/40 rounded-xl border border-gray-800/30 overflow-hidden flex flex-col shadow-2xl backdrop-blur-sm">
              <WaveformCharts 
                waveformHistory={waveformHistory}
                selectedProfile={selectedProfile}
                CustomTooltip={CustomTooltip}
                chartColors={CHART_COLORS}
              />
            </div>

            <div className="shrink-0 mt-4 rounded-xl overflow-hidden shadow-xl border border-gray-800/30">
              <VisualProtocolAnalyzer 
                frame={lastFrame}
                profile={selectedProfile}
              />
            </div>
          </div>

          {/* Packet Inspector Overlay */}
          {selectedFrame && (
            <div className="absolute inset-y-0 right-0 w-[400px] z-20 backdrop-blur-md bg-gray-950/90 border-l border-gray-800 shadow-2xl animate-in slide-in-from-right-10">
              <PacketInspector 
                frame={selectedFrame}
                profile={selectedProfile}
                onClose={() => setSelectedFrame(null)}
              />
            </div>
          )}
        </div>

        {/* RIGHT PANEL TOGGLE BUTTON */}
        <button
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          className={`absolute right-0 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 hover:text-white rounded-l-md shadow-lg transition-transform duration-300 ease-in-out ${
            isRightPanelOpen ? '-translate-x-80' : 'translate-x-0'
          }`}
          title={isRightPanelOpen ? "Kontrolleri Gizle" : "Kontrolleri Göster"}
        >
          {isRightPanelOpen ? <ChevronRight size={16} /> : <Settings2 size={16} />}
        </button>

        {/* RIGHT PANEL */}
        <div 
          className={`shrink-0 flex flex-col bg-gray-900 border-l border-gray-800/50 transition-all duration-300 ease-in-out relative ${
            isRightPanelOpen ? 'w-80 translate-x-0' : 'w-0 translate-x-full opacity-0'
          }`}
        >
          <div className="w-80 h-full overflow-y-auto custom-scrollbar">
            <ControlPanel 
              status={status}
              flagsFields={flagsFields}
              allRangeFields={allRangeFields}
              bitOverrides={bitOverrides}
              fieldOverrides={fieldOverrides}
              pendingErrors={pendingErrors}
              logEntries={logEntries}
              errorTypes={ERROR_TYPES}
              onOverrideField={overrideField}
              onOverrideBit={overrideBit}
              onInjectError={injectError}
              onResetOverrides={resetOverrides}
              onExportLogs={exportLogs}
              isRecording={isRecording}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onStartPlayback={startPlayback}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
