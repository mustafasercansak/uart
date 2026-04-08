import { useState, useEffect, useCallback, useMemo } from 'react';
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
      if (e.code === 'Escape') stop();
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
    <div className="h-full flex flex-col bg-gray-900">
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

      <div className="flex-1 overflow-y-auto min-h-0 bg-gray-900/50">
        <div className="flex flex-col lg:flex-row min-h-full">
          <div className="flex-1 flex flex-col border-r border-gray-800">
            <div className="flex flex-col xl:flex-row border-b border-gray-800">
              <div className="flex-1 min-w-0">
                <FrameMonitor 
                  lastFrame={lastFrame}
                  recentFrames={recentFrames}
                />
              </div>
              <div className="flex-1 min-w-0 border-t xl:border-t-0 xl:border-l border-gray-800">
                <RxMonitor 
                  lastRxFrame={lastRxFrame}
                />
              </div>
            </div>
            
            <WaveformCharts 
              waveformHistory={waveformHistory}
              selectedProfile={selectedProfile}
              CustomTooltip={CustomTooltip}
              chartColors={CHART_COLORS}
            />

            <LogicAnalyzer 
              lastTxFrame={lastFrame}
              lastRxFrame={lastRxFrame}
            />
          </div>

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
  );
}
