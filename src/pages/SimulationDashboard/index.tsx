import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  Activity,
  Settings2,
  TerminalSquare,
  ScrollText,
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
  GraduationCap,
  ArrowLeftRight,
  MessageSquare,
  Send,
} from 'lucide-react';
import type { FrameProfile, Scenario, OutputMode, GeneratedFrame } from '../../types';
import { loadProfiles, loadScenarios, saveProfile } from '../../store/storage';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSimulation } from '../../hooks/useSimulation';
import TriggerManager from './components/TriggerManager';
import ValidationControls from './components/ValidationControls';
import ValidationReport from './components/ValidationReport';
import { useTranslation } from '../../i18n/context';

// Sub-components
import StatBar from './components/StatBar';
import FrameMonitor from './components/FrameMonitor';
import RxMonitor from './components/RxMonitor';
import ControlPanel from './components/ControlPanel';
import LogicAnalyzer from './components/LogicAnalyzer';
import ExchangeDetail from './components/ExchangeDetail';
import TraceTable from './components/TraceTable';
import AtAutomationPanel from './components/AtAutomationPanel';
import TabContent from './components/TabContent';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';



export default function SimulationDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const formatMs = useCallback((ms: number): string => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const units = {
      h: t('time.hour'),
      m: t('time.minute'),
      s: t('time.second'),
      ms: t('time.ms')
    };

    if (h > 0) return `${h} ${units.h} ${m % 60} ${units.m} ${s % 60} ${units.s}`;
    if (m > 0) return `${m} ${units.m} ${s % 60} ${units.s}`;
    return `${s} ${units.s} ${ms % 1000} ${units.ms}`;
  }, [t]);

  const [profiles, setProfilesList] = useState<FrameProfile[]>(() => loadProfiles());
  const refreshProfiles = useCallback(() => setProfilesList(loadProfiles()), []);
  const [scenarios] = useState<Scenario[]>(() => loadScenarios());
  const [selectedFrame, setSelectedFrame] = useState<GeneratedFrame | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isConsolePanelOpen, setIsConsolePanelOpen] = useState(false);

  const {
    state,
    start, stop, pause, resume,
    overrideField, overrideBit, resetOverrides,
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
    setTriggers,
    startValidation, stopValidation,
    clearExchanges, sendRawData, sendTextData,
  } = useSimulation();

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refreshProfiles(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshProfiles]);

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
    exchanges,
    timingStats,
    analyzerMode,
    serialConnected,
    networkConnected,
    isRecording,
    availablePorts,
    selectedExchangeId,
    displayFilter,
  } = state;


  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isReportViewOpen, setIsReportViewOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;
  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  type CenterTabType = 'waveforms' | 'logic' | 'telemetry' | 'timeline' | 'lab' | 'scripting' | 'diagnostics' | 'playback' | 'hardware' | 'testing' | 'spectrum' | 'triggers' | 'visualizer' | 'decoder' | 'testsuite' | 'report' | 'builder' | 'learn' | 'exchange' | 'conversation' | 'profile-compare' | 'messages' | 'console';
  const location = useLocation();
  const [activeCenterTab, setActiveCenterTab] = useState<CenterTabType>(
    (location.state as { tab?: CenterTabType } | null)?.tab ?? 'builder'
  );

  const tabContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkScroll = useCallback(() => {
    if (tabContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    const el = tabContainerRef.current;
    if (!el) return;
    
    // Initial check
    checkScroll();
    
    const observer = new ResizeObserver(() => {
      checkScroll();
    });
    
    observer.observe(el);
    Array.from(el.children).forEach(child => observer.observe(child));
    
    window.addEventListener('resize', checkScroll);
    
    // Add mouse wheel horizontal scrolling support
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabContainerRef.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      tabContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const tabs: Array<{ id: CenterTabType; icon: import('lucide-react').LucideIcon; label: string; color: string; shadow: string }> = [
    { id: 'builder', icon: Hammer, label: 'dashboard.builder', color: 'bg-amber-600', shadow: 'shadow-amber-900/40' },
    { id: 'console',  icon: TerminalSquare, label: 'dashboard.console', color: 'bg-emerald-700', shadow: 'shadow-emerald-900/40' },
    { id: 'messages', icon: Send, label: 'dashboard.messages', color: 'bg-green-600', shadow: 'shadow-green-900/40' },
    { id: 'waveforms', icon: LineChart, label: 'dashboard.waveforms', color: 'bg-blue-600', shadow: 'shadow-blue-900/20' },
    { id: 'logic', icon: Zap, label: 'dashboard.logic', color: 'bg-emerald-600', shadow: 'shadow-emerald-900/40' },
    { id: 'telemetry', icon: GaugeIcon, label: 'dashboard.telemetry', color: 'bg-emerald-600', shadow: 'shadow-emerald-900/20' },
    { id: 'lab', icon: FlaskConical, label: 'dashboard.lab', color: 'bg-purple-600', shadow: 'shadow-purple-900/20' },
    { id: 'timeline', icon: History, label: 'dashboard.timeline', color: 'bg-indigo-600', shadow: 'shadow-indigo-900/20' },
    { id: 'diagnostics', icon: BarChart3, label: 'dashboard.diagnostics', color: 'bg-rose-600', shadow: 'shadow-rose-900/20' },
    { id: 'playback', icon: PlayCircle, label: 'dashboard.playback', color: 'bg-orange-600', shadow: 'shadow-orange-900/20' },
    { id: 'scripting', icon: Code, label: 'dashboard.scripting', color: 'bg-yellow-600 text-black', shadow: 'shadow-yellow-900/20' },
    { id: 'hardware', icon: CpuIcon, label: 'dashboard.hardware', color: 'bg-gray-200 text-black', shadow: 'shadow-gray-400/20' },
    { id: 'testing', icon: CheckSquare, label: 'dashboard.testing', color: 'bg-emerald-600', shadow: 'shadow-emerald-900/40' },
    { id: 'spectrum', icon: Waves, label: 'dashboard.spectrum', color: 'bg-indigo-600', shadow: 'shadow-indigo-900/40' },
    { id: 'visualizer', icon: Box, label: 'dashboard.visualizer', color: 'bg-brand', shadow: 'shadow-brand/20' },
    { id: 'decoder', icon: Binary, label: 'dashboard.decoder', color: 'bg-indigo-600', shadow: 'shadow-indigo-900/40' },
    { id: 'testsuite', icon: ClipboardList, label: 'dashboard.testsuite', color: 'bg-purple-600', shadow: 'shadow-purple-900/40' },
    { id: 'report', icon: FileDown, label: 'dashboard.report', color: 'bg-rose-600', shadow: 'shadow-rose-900/40' },
    { id: 'learn', icon: GraduationCap, label: 'dashboard.learn', color: 'bg-pink-600', shadow: 'shadow-pink-900/40' },
    { id: 'exchange', icon: ArrowLeftRight, label: 'dashboard.exchange', color: 'bg-teal-600', shadow: 'shadow-teal-900/40' },
    { id: 'conversation', icon: MessageSquare, label: 'dashboard.conversation', color: 'bg-cyan-600', shadow: 'shadow-cyan-900/40' },
    { id: 'profile-compare', icon: GitCompare, label: 'dashboard.profileCompare', color: 'bg-violet-600', shadow: 'shadow-violet-900/40' },
  ];

  const handleAddProfile = () => {
    if (status === 'running') {
      sessionStorage.setItem('uart_resume_on_return', '1');
      setUiVisible(false);
      pause();
    }
    navigate('/profiles?new=1&from=dashboard');
  };
  const handleEditProfile = (profile: FrameProfile) => {
    if (status === 'running') {
      sessionStorage.setItem('uart_resume_on_return', '1');
      setUiVisible(false);
      pause();
    }
    navigate(`/profiles?edit=${profile.id}&from=dashboard`);
  };
  const handleUpdateBaudRate = useCallback((baudRate: number) => {
    if (!selectedProfile) return;
    const updated = { ...selectedProfile, baudRate, updatedAt: new Date().toISOString() };
    saveProfile(updated);
    setProfilesList(loadProfiles());
  }, [selectedProfile]);

  useEffect(() => {
    setProfiles(profiles);
  }, [profiles, setProfiles]);

  useEffect(() => {
    setUiVisible(true);
    return () => setUiVisible(false);
  }, [setUiVisible]);

  useEffect(() => {
    if (!selectedProfileId && profiles.length > 0) {
      setProfile(profiles[0].id);
    }
  }, [selectedProfileId, profiles, setProfile]);

  useEffect(() => {
    if (sessionStorage.getItem('uart_resume_on_return') !== '1') return;
    sessionStorage.removeItem('uart_resume_on_return');
    if (status === 'paused' && selectedProfile) resume(selectedProfile, selectedScenario);
  // The resume marker is intentionally consumed only when the dashboard mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setShowShortcuts(false);
      }
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(v => !v);
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

  const selectedExchange = useMemo(() => 
    exchanges.find(ex => ex.id === selectedExchangeId) || null, 
    [exchanges, selectedExchangeId]
  );

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
        onUpdateBaudRate={handleUpdateBaudRate}
      />

      <div className="flex-1 min-h-0 flex relative bg-[#0a0a0d] overflow-hidden">
        
        {!analyzerMode && (
          <div 
            className={`shrink-0 flex flex-col bg-gray-900 border-r border-gray-800/50 transition-all duration-300 ease-in-out relative ${
              isLeftPanelOpen ? 'w-72 xl:w-80 translate-x-0' : 'w-0 -translate-x-full opacity-0'
            }`}
          >
            <div className="w-72 xl:w-80 h-full flex flex-col">
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
        )}

        {!analyzerMode && (
          <button
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 hover:text-white rounded-r-md shadow-lg transition-transform duration-300 ease-in-out ${
              isLeftPanelOpen ? 'translate-x-72 xl:translate-x-80' : 'translate-x-0'
            }`}
          >
            {isLeftPanelOpen ? <ChevronLeft size={16} /> : <Activity size={16} />}
          </button>
        )}
        <div className="flex-1 min-w-0 flex flex-col relative bg-gradient-to-br from-gray-950 to-gray-900">
          {analyzerMode ? (
            <div className="flex-1 min-h-0 p-3 flex gap-3 overflow-hidden relative">
                <div className="flex-[3] min-h-0 flex flex-col gap-3">
                    <TraceTable
                        exchanges={exchanges}
                        selectedId={selectedExchangeId}
                        onSelect={selectExchange}
                        displayFilter={displayFilter}
                        onFilterChange={setDisplayFilter}
                        profile={selectedProfile}
                        onSendText={sendTextData}
                        onSendRaw={sendRawData}
                        isConnected={outputMode === 'serial' ? serialConnected : (outputMode === 'tcp' || outputMode === 'tcp-server') ? networkConnected : false}
                    />
                </div>

                <div className="flex shrink-0">
                  {analyzerMode && selectedExchange && (
                    <div className="w-80 shrink-0 border-l border-white/5 relative z-30">
                      <ExchangeDetail
                        exchange={selectedExchange}
                        onClose={() => selectExchange(null)}
                      />
                    </div>
                  )}

                  {isDashboardOpen && (
                    <div className={`${(analyzerMode && selectedExchange) ? 'w-72' : 'w-80'} shrink-0 border-l border-white/5 transition-all duration-300 relative z-20`}>
                      <AtAutomationPanel />
                    </div>
                  )}
                </div>

                {/* Right-side toggle buttons — stacked top to bottom */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1">
                  <button
                    onClick={() => setIsDashboardOpen(!isDashboardOpen)}
                    className={`p-1.5 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-700/20 text-emerald-400 rounded-l-lg shadow-lg transition-all duration-300 relative ${
                      isDashboardOpen ? '' : 'scale-105'
                    }`}
                    title={isDashboardOpen ? t('atAuto.closePanel') : t('atAuto.openPanel')}
                  >
                    <TerminalSquare size={14} />
                    {!isDashboardOpen && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse border-2 border-[#030712]" />}
                  </button>
                  <button
                    onClick={() => setIsConsolePanelOpen(v => !v)}
                    className="p-1.5 bg-gray-800/60 hover:bg-gray-700 border border-gray-700/40 text-gray-500 hover:text-gray-200 rounded-l-lg shadow-lg transition-all duration-300"
                    title={isConsolePanelOpen ? 'Konsol Kapat' : 'Konsol Logları'}
                  >
                    <ScrollText size={14} />
                  </button>
                </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden relative p-3 flex flex-col">
              <div className="relative mb-3 flex items-center group max-w-full overflow-hidden">
                {showLeftArrow && (
                  <button 
                    onClick={() => scrollTabs('left')}
                    className="absolute left-0 z-20 p-1.5 bg-gray-900/80 backdrop-blur-md border border-white/5 text-gray-400 hover:text-white rounded-full shadow-2xl transition-all"
                  >
                    <ChevronLeft size={14} />
                  </button>
                )}
                
                <div 
                  ref={tabContainerRef}
                  onScroll={checkScroll}
                  className="flex items-center gap-1 glass-panel p-0.5 rounded-xl overflow-x-auto no-scrollbar scroll-smooth"
                  style={{ maskImage: `linear-gradient(to right, ${showLeftArrow ? 'transparent' : 'black'} 0%, black 5%, black 95%, ${showRightArrow ? 'transparent' : 'black'} 100%)` }}
                >
                  {tabs.map((tab) => (
                    <button 
                      key={tab.id}
                      onClick={() => setActiveCenterTab(tab.id)}
                      className={`px-3 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 group/tab ${
                        activeCenterTab === tab.id ? `${tab.color} text-white shadow-lg ${tab.shadow}` : 'text-gray-500 hover:text-gray-400'
                      }`}
                    >
                      <tab.icon size={12} className={activeCenterTab === tab.id ? 'animate-pulse' : 'group-hover/tab:scale-110 transition-transform'} />
                      {t(tab.label)}
                    </button>
                  ))}
                </div>

                {showRightArrow && (
                  <button 
                    onClick={() => scrollTabs('right')}
                    className="absolute right-0 z-20 p-1.5 bg-gray-900/80 backdrop-blur-md border border-white/5 text-gray-400 hover:text-white rounded-full shadow-2xl transition-all"
                  >
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 glass-panel rounded-xl overflow-hidden flex flex-col shadow-2xl border-white/5">
                <TabContent
                  activeTab={activeCenterTab}
                  state={state}
                  profiles={profiles}
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
                    clearExchanges,
                    selectExchange,
                    onSetProfile: setProfile,
                    onSendFrame: (bytes: number[]) => {
                      const hex = bytes.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
                      console.info(`[Frame Builder TX] ${bytes.length}B → ${hex}`);
                      sendRawData(hex);
                    },
                  }}
                />
              </div>

            </div>
          )}
        </div>


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


        <div
          className={`shrink-0 flex flex-col bg-gray-900 border-l border-gray-800/50 transition-all duration-300 ease-in-out relative ${
            (isRightPanelOpen || (analyzerMode && isConsolePanelOpen)) ? 'w-80 translate-x-0' : 'w-0 translate-x-full opacity-0'
          }`}
        >
          <div className="w-80 h-full flex flex-col">
            <ControlPanel
              flagsFields={flagsFields}
              allRangeFields={allRangeFields}
              bitOverrides={bitOverrides}
              fieldOverrides={fieldOverrides}
              logEntries={logEntries}
              onOverrideField={overrideField}
              onOverrideBit={overrideBit}
              onResetOverrides={resetOverrides}
              onExportLogs={exportLogs}
            />
          </div>
        </div>

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

        <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      </div>
    </div>
  );
}
