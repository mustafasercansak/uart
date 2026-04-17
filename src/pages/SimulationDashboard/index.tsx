import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  Activity,
  Settings2,
  LayoutDashboard,
  LineChart,
  Gauge as GaugeIcon,
  FlaskConical,
  GitCompare,
  Code,
  History,
  BarChart3,
  PlayCircle,
  Cpu as CpuIcon,
  CheckSquare,
  Zap,
  Box,
  Waves,
  Binary,
  ClipboardList,
  FileDown,
  Hammer,
} from 'lucide-react';
import type { FrameProfile, Scenario, ErrorType, OutputMode, GeneratedFrame } from '../../types';
import { loadProfiles, loadScenarios, saveProfile as persistProfile } from '../../store/storage';
import { useSimulation } from '../../hooks/useSimulation';
import { parseFrame } from '../../engines/FrameParser';
import ProfileEditorModal from './components/ProfileEditorModal';
import TriggerManager from './components/TriggerManager';
import ValidationControls from './components/ValidationControls';
import ValidationReport from './components/ValidationReport';

// Sub-components
import StatBar from './components/StatBar';
import FrameMonitor from './components/FrameMonitor';
import RxMonitor from './components/RxMonitor';
import ControlPanel from './components/ControlPanel';
import LogicAnalyzer from './components/LogicAnalyzer';
import PacketInspector from './components/PacketInspector';
import TraceTable from './components/TraceTable';
import LiveDashboard from './components/LiveDashboard';
import TabContent from './components/TabContent';

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
  if (h > 0) return `${h} sa ${m % 60} dk ${s % 60} sn`;
  if (m > 0) return `${m} dk ${s % 60} sn`;
  return `${s} sn ${ms % 1000} ms`;
}

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316'];

export default function SimulationDashboard() {
  const [profiles, setProfilesStore] = useState<FrameProfile[]>(() => loadProfiles());
  const [scenarios] = useState<Scenario[]>(() => loadScenarios());
  const [selectedFrame, setSelectedFrame] = useState<GeneratedFrame | null>(null);
  const [selectedSnapshotFrame, setSelectedSnapshotFrame] = useState<GeneratedFrame | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  
  const { 
    state, 
    start, stop, pause, resume, 
    overrideField, overrideBit, injectError, resetOverrides, 
    connectSerial, disconnectSerial, 
    connectNetwork, disconnectNetwork,
    setProfile, setScenario, setOutputMode, setUiVisible,
    exportLogs, setProfiles,
    startRecording, stopRecording, startPlayback,
    pausePlayback, resumePlayback, seekPlayback, stepPlayback,
    getPorts,
    setAnalyzerMode, selectExchange, setDisplayFilter,
    setDiffFrame, setResponderRules,
    deleteRecording, refreshRecordings,
    setSignalIntegrity, setTriggers,
    startValidation, stopValidation, cancelValidation, deleteValidationSession
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
    exchanges,
    timingStats,
    watchlist,
    analyzerMode,
    serialConnected,
    networkConnected,
    isRecording,
    conversationLogs,
    availablePorts,
    selectedExchangeId,
    displayFilter,
    diffFrames,
    responderRules,
    recordings,
    playbackIndex,
    playbackTotal
  } = state;

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState<FrameProfile | null>(null);

  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isReportViewOpen, setIsReportViewOpen] = useState(false);

  const [activeCenterTab, setActiveCenterTab] = useState<'waveforms' | 'logic' | 'telemetry' | 'timeline' | 'lab' | 'scripting' | 'diagnostics' | 'playback' | 'hardware' | 'testing' | 'spectrum' | 'triggers' | 'visualizer' | 'decoder' | 'testsuite' | 'report' | 'builder'>('waveforms');

  const handleSaveProfile = (profile: FrameProfile) => {
    persistProfile(profile);
    setProfilesStore(loadProfiles());
    setIsEditingProfile(false);
    setEditingProfile(null);
  };

  const handleAddProfile = () => {
    setEditingProfile(null);
    setIsEditingProfile(true);
  };

  const handleEditProfile = (profile: FrameProfile) => {
    setEditingProfile(profile);
    setIsEditingProfile(true);
  };

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

  // Unified Exchange selection
  const selectedExchange = useMemo(() => 
    exchanges.find(ex => ex.id === selectedExchangeId) || null, 
    [exchanges, selectedExchangeId]
  );

  // Unified Frame selection logic for inspector
  const analyzerFrame = useMemo(() => {
    // 1. If explicit snapshot is selected
    if (selectedSnapshotFrame) return selectedSnapshotFrame;

    // 2. If explicit exchange is selected
    if (selectedExchange && selectedProfile) {
        const entry = selectedExchange.tx || selectedExchange.rx;
        if (entry) {
            const bytesFromHex = entry.rawHex.split(' ').map(h => parseInt(h, 16));
            const parsedFields = parseFrame(selectedProfile, bytesFromHex);
            
            return {
                uId: `snap-${entry.timestamp}-${Math.random()}`,
                frameNumber: 0,
                timestampMs: entry.timestamp,
                rawHex: entry.rawHex,
                rawBytes: bytesFromHex,
                fields: parsedFields || [],
                errors: []
            } as GeneratedFrame;
        }
    }
    // 3. Fallback to manually selected frame from monitors
    if (selectedFrame) return selectedFrame;
    // 4. Fallback to live data
    return lastFrame;
  }, [exchanges, selectedExchangeId, selectedFrame, selectedSnapshotFrame, lastFrame, selectedProfile]);

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
        analyzerMode={analyzerMode}
        isRecording={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onSetProfile={setProfile}
        onSetScenario={setScenario}
        onSetOutputMode={setOutputMode}
        onConnectSerial={(portName) => selectedProfile && connectSerial(portName, selectedProfile.baudRate)}
        onDisconnectSerial={disconnectSerial}
        onConnectNetwork={connectNetwork}
        onDisconnectNetwork={disconnectNetwork}
        onToggleAnalyzerMode={() => setAnalyzerMode(!analyzerMode)}
        onAddProfile={handleAddProfile}
        onEditProfile={handleEditProfile}
        analyzerModeLabel={analyzerMode ? 'Standart Mod' : 'Pro Mod\'a Geç'}
        onGetPorts={getPorts}
        availablePorts={availablePorts || []}
        onStart={handleStart}
        onStop={stop}
        onPause={pause}
        onResume={handleResume}
        formatMs={formatMs}
        timingStats={timingStats}
        signalIntegrity={state.signalIntegrity}
        validationSession={state.validationSession}
        onStartValidation={() => setIsValidationModalOpen(true)}
        onStopValidation={stopValidation}
        onViewReport={() => setIsReportViewOpen(true)}
      />

      {/* Main layout container */}
      <div className="flex-1 min-h-0 flex relative bg-[#0a0a0d] overflow-hidden">
        
        {/* LEFT PANEL (Monitors) */}
        {!analyzerMode && (
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
            </div>
          </div>
        )}

        {/* LEFT PANEL TOGGLE BUTTON (Dashboard mode only) */}
        {!analyzerMode && (
          <button
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 hover:text-white rounded-r-md shadow-lg transition-transform duration-300 ease-in-out ${
              isLeftPanelOpen ? 'translate-x-72 xl:translate-x-80' : 'translate-x-0'
            }`}
          >
            {isLeftPanelOpen ? <ChevronLeft size={16} /> : <Activity size={16} />}
          </button>
        )}        {/* CENTER PANEL (WAVEFORMS or TRACE TABLE) */}
        <div className="flex-1 min-w-0 flex flex-col relative bg-gradient-to-br from-[#030712] to-[#0a0a1a]">
          {analyzerMode ? (
            <div className="flex-1 min-h-0 p-6 flex gap-6 overflow-hidden relative">
                {/* Main Content Areas */}
                <div className="flex-[3] min-h-0 flex flex-col gap-6">
                    <TraceTable 
                        exchanges={exchanges}
                        selectedId={selectedExchangeId}
                        onSelect={selectExchange}
                        displayFilter={displayFilter}
                        onFilterChange={setDisplayFilter}
                        profile={selectedProfile}
                    />
                    <div className="h-72 shrink-0 glass-panel rounded-2xl overflow-hidden shadow-2xl">
                         <LogicAnalyzer />
                    </div>
                </div>

                {/* Right Panel: Inspector and Telemetry */}
                <div className="flex shrink-0">
                  {/* Pro Packet Inspector */}
                  {analyzerMode && selectedExchange && (
                    <div className="w-[500px] shrink-0 border-l border-white/5 relative z-30 glass-panel rounded-l-2xl">
                      <PacketInspector 
                        exchange={selectedExchange} 
                        profile={selectedProfile} 
                        onClose={() => selectExchange(null)} 
                      />
                    </div>
                  )}

                  {/* Live Telemetry Dashboard */}
                  {isDashboardOpen && (
                    <div className={`${(analyzerMode && selectedExchange) ? 'w-80' : 'w-96'} shrink-0 border-l border-white/5 bg-black/20 backdrop-blur-md transition-all duration-300 relative z-20`}>
                      <LiveDashboard 
                        onSelectSnapshot={setSelectedSnapshotFrame}
                        selectedSnapshotId={selectedSnapshotFrame?.frameNumber}
                      />
                    </div>
                  )}
                </div>

                {/* Dashboard Toggle Button */}
                <button
                    onClick={() => setIsDashboardOpen(!isDashboardOpen)}
                    className={`absolute right-0 top-1/2 -translate-y-1/2 z-30 p-2 bg-brand/10 hover:bg-brand/20 border border-brand/20 text-brand rounded-l-xl shadow-lg transition-all duration-300 ${
                      isDashboardOpen ? 'translate-x-0' : 'translate-x-[-12px] scale-110'
                    }`}
                    title={isDashboardOpen ? "Close Dashboard" : "Open Live Dashboard"}
                >
                    <LayoutDashboard size={18} />
                    {!isDashboardOpen && <div className="absolute -top-1 -right-1 w-3 h-3 bg-brand rounded-full animate-pulse border-2 border-[#030712]" />}
                </button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden relative p-6 flex flex-col">
              {/* Professional Tab Navigation */}
              <div className="flex items-center gap-1 mb-6 glass-panel p-1 rounded-2xl self-start">
                <button 
                  onClick={() => setActiveCenterTab('waveforms')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'waveforms' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <LineChart size={14} />
                  Waveforms
                </button>
                <button 
                  onClick={() => setActiveCenterTab('logic')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'logic' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Zap size={14} />
                  Logic
                </button>
                <button 
                  onClick={() => setActiveCenterTab('telemetry')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'telemetry' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <GaugeIcon size={14} />
                    Telemetry
                </button>
                <button 
                  onClick={() => setActiveCenterTab('lab')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'lab' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <FlaskConical size={14} />
                    Lab (Diff)
                </button>
                <button 
                  onClick={() => setActiveCenterTab('timeline')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'timeline' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <History size={14} />
                    Timeline
                </button>
                <button 
                  onClick={() => setActiveCenterTab('diagnostics')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'diagnostics' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <BarChart3 size={14} />
                    Diagnostics
                </button>
                <button 
                  onClick={() => setActiveCenterTab('playback')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'playback' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <PlayCircle size={14} />
                    Playback
                </button>
                <button 
                  onClick={() => setActiveCenterTab('scripting')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'scripting' ? 'bg-yellow-600 text-black shadow-lg shadow-yellow-900/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <Code size={14} />
                    Scripting
                </button>
                <button 
                  onClick={() => setActiveCenterTab('hardware')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'hardware' ? 'bg-gray-200 text-black shadow-lg shadow-gray-400/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <CpuIcon size={14} />
                    Hardware
                </button>
                <button 
                  onClick={() => setActiveCenterTab('testing')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'testing' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <CheckSquare size={14} />
                    Testing
                </button>
                <button 
                  onClick={() => setActiveCenterTab('spectrum')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'spectrum' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                    <Waves size={14} />
                    Spectrum
                </button>
                <button
                  onClick={() => setActiveCenterTab('visualizer')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'visualizer' ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Box size={14} />
                  3D Visualizer
                </button>
                <button
                  onClick={() => setActiveCenterTab('decoder')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'decoder' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Binary size={14} />
                  Decoder
                </button>
                <button
                  onClick={() => setActiveCenterTab('testsuite')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'testsuite' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <ClipboardList size={14} />
                  Test Suite
                </button>
                <button
                  onClick={() => setActiveCenterTab('report')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'report' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <FileDown size={14} />
                  Rapor
                </button>
                <button
                  onClick={() => setActiveCenterTab('builder')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeCenterTab === 'builder' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Hammer size={14} />
                  Builder
                </button>
              </div>

              {/* Tab Content Area */}
              <div className="flex-1 min-h-0 glass-panel rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                <TabContent
                  activeTab={activeCenterTab}
                  state={state}
                  lastFrame={lastFrame}
                  lastRxFrame={lastRxFrame}
                  selectedProfile={selectedProfile}
                  waveformHistory={waveformHistory}
                  exchanges={exchanges}
                  elapsedMs={elapsedMs}
                  frameCount={frameCount}
                  errorCount={errorCount}
                  hooks={{
                    startPlayback,
                    deleteRecording,
                    refreshRecordings,
                    pausePlayback,
                    resumePlayback,
                    seekPlayback,
                    stepPlayback,
                    setDiffFrame,
                    setResponderRules,
                    setTriggers,
                    onSendFrame: (bytes: number[]) => {
                      const hex = bytes.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
                      console.info(`[Frame Builder TX] ${bytes.length}B → ${hex}`);
                      // WebSocket modu aktifse engine.processIncomingData'ya iletilir.
                      // Client-side modda conversation log'a manuel TX olarak düşer.
                    }
                  }}
                />
              </div>

            </div>
          )}
        </div>

        {/* RIGHT PANEL TOGGLE (Dashboard mode only) */}
        {!analyzerMode && (
          <button
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className={`absolute right-0 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 hover:text-white rounded-l-md shadow-lg transition-transform duration-300 ease-in-out ${
              isRightPanelOpen ? '-translate-x-80' : 'translate-x-0'
            }`}
          >
            {isRightPanelOpen ? <ChevronRight size={16} /> : <Settings2 size={16} />}
          </button>
        )}

        {/* RIGHT PANEL (Controls) */}
        <div 
          className={`shrink-0 flex flex-col bg-gray-900 border-l border-gray-800/50 transition-all duration-300 ease-in-out relative ${
            (isRightPanelOpen || analyzerMode) ? 'w-80 translate-x-0' : 'w-0 translate-x-full opacity-0'
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
              signalIntegrity={state.signalIntegrity}
              onSetSignalIntegrity={setSignalIntegrity}
            />
          </div>
        </div>

        {isEditingProfile && (
          <ProfileEditorModal 
            profile={editingProfile}
            onSave={handleSaveProfile}
            onClose={() => setIsEditingProfile(false)}
          />
        )}

        {isValidationModalOpen && (
          <ValidationControls 
            profile={selectedProfile}
            onStart={(config) => {
              startValidation(config);
              setIsValidationModalOpen(false);
            }}
            onClose={() => setIsValidationModalOpen(false)}
          />
        )}

        {isReportViewOpen && state.validationSession && (
          <ValidationReport 
            session={state.validationSession}
            onClose={() => setIsReportViewOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
