import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Radio,
  Network,
  Shuffle,
  ScrollText,
  HeartPulse,
  Zap,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { useCANContext } from '../../../can/store/CANContext';
import { NodeCard } from './components/NodeCard';
import { BusMonitor } from './components/BusMonitor';
import { FrameInspector } from './components/FrameInspector';
import { AddNodeModal } from './components/AddNodeModal';
import { EditNodeModal } from './components/EditNodeModal';
import { VitalsPanel } from './components/VitalsPanel';
import { FaultInjectionPanel } from './components/FaultInjectionPanel';
import { CompliancePanel } from './components/CompliancePanel';
import { CANStatBar } from './components/CANStatBar';
import { NodesTab } from './components/NodesTab';
import { ArbitrationTab } from './components/ArbitrationTab';
import { LogTab } from './components/LogTab';
import { CANAutomationTab } from './components/CANAutomationTab';
import { DiagnosticTerminal } from './components/DiagnosticTerminal';
import { CANKeyboardShortcutsModal } from './components/CANKeyboardShortcutsModal';
import { useTranslation } from '../../../i18n/context';
import { detectCANTraffic } from '../../../engines/SmartListen';
import { SmartListenOverlay } from '../../shared/SmartListenOverlay';
import type { CANBaudRate } from '../../../can/types/CANBusState';
import type { CANArbitrationEvent } from '../../../can/types/CANFrame';
import { MEDICAL_PROFILE_COLORS, type CANNode } from '../../../can/types/CANNode';
import { loadCANProfiles, type CANProfile } from '../../../can/store/canProfileStorage';

type CenterTab = 'bus' | 'nodes' | 'arbitration' | 'log' | 'fault' | 'diagnostics' | 'automation' | 'compliance';
type RightPanel = 'inspector' | 'vitals';

const BAUD_RATES: CANBaudRate[] = [125, 250, 500, 1000];
const TAB_ORDER: CenterTab[] = ['bus', 'nodes', 'arbitration', 'log', 'fault', 'diagnostics', 'automation', 'compliance'];



export default function CANDashboard() {
  const { t } = useTranslation();
  const {
    state, start, stop, pause, resume,
    addNode, removeNode, updateNode, setBaudRate,
    selectNode, selectFrame, setFilter, clearFrames,
    toggleArbitrationDisplay, toggleErrorDisplay,
    injectFault, recoverNode, setOutputMode,
    connectSerial, disconnectSerial, connectNetwork, disconnectNetwork,
    startRecording, stopRecording, sendFrame,
    sendUDSRequest, setUDSConfig,
    setErrorInjectionConfig, armErrorInjection
  } = useCANContext();

  const [showAddNode, setShowAddNode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [vitalsNodeId, setVitalsNodeId] = useState<number | null>(null);
  const [editingNode, setEditingNode] = useState<CANNode | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>('inspector');
  const [activeTab, setActiveTab] = useState<CenterTab>('bus');
  const [isSmartListenActive, setIsSmartListenActive] = useState(false);

  const [profiles] = useState<CANProfile[]>(() => loadCANProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSetProfile = useCallback((id: string) => {
    setSelectedProfileId(id);
    if (!id) return;
    const p = profiles.find(x => x.id === id);
    if (p) {
      state.nodes.forEach(n => removeNode(n.id));
      setBaudRate(p.baudRate);
      // Slight delay so worker processes removes before adds
      setTimeout(() => {
        p.nodes.forEach(n => addNode({
          id: n.id, name: n.name, profile: n.profile,
          color: MEDICAL_PROFILE_COLORS[n.profile],
          baseArbitrationId: n.baseArbitrationId,
          sendIntervalMs: n.sendIntervalMs, isActive: n.isActive,
        }));
      }, 50);
    }
  }, [profiles, state.nodes, removeNode, setBaudRate, addNode]);

  const handleTabChange = useCallback((tab: CenterTab) => {
    setActiveTab(tab);
  }, []);

  // Remove all nodes (allows switching scenarios)
  const clearAllNodes = useCallback(() => {
    state.nodes.forEach(n => removeNode(n.id));
  }, [state.nodes, removeNode]);

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
    const timer = setTimeout(checkScroll, 100);
    window.addEventListener('resize', checkScroll);
    return () => { clearTimeout(timer); window.removeEventListener('resize', checkScroll); };
  }, [checkScroll]);

  const scrollTabs = (dir: 'left' | 'right') => {
    tabContainerRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const selectedFrame = useMemo(
    () => state.recentFrames.find(f => f.uid === state.selectedFrameUid) ?? null,
    [state.recentFrames, state.selectedFrameUid]
  );
  const selectedFrameNode = useMemo(
    () => state.nodes.find(n => n.id === (selectedFrame?.nodeId ?? -1)) ?? undefined,
    [state.nodes, selectedFrame]
  );
  const smartListenResult = useMemo(
    () => detectCANTraffic(state.recentFrames, state.baudRate),
    [state.recentFrames, state.baudRate]
  );

  const isRunning = state.status === 'running';
  const isPaused  = state.status === 'paused';
  const isStopped = state.status === 'stopped';
  const canStart  = state.nodes.filter(n => n.isActive).length > 0;

  const handleSmartListenSync = useCallback(() => {
    if (smartListenResult.baudRate) {
      setBaudRate((smartListenResult.baudRate / 1000) as CANBaudRate);
    }
    setActiveTab('bus');
    setIsSmartListenActive(false);
  }, [setBaudRate, smartListenResult.baudRate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (isInput) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (isStopped && canStart) start();
          else if (isRunning) pause();
          else if (isPaused) resume();
          break;
        case 'Escape':
          if (showShortcuts) { setShowShortcuts(false); break; }
          if (!isStopped) stop();
          break;
        case '?':
          setShowShortcuts(s => !s);
          break;
        case 'n': case 'N':
          setShowAddNode(true);
          break;
        case 'c': case 'C':
          clearFrames();
          break;
        case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8':
          setActiveTab(TAB_ORDER[parseInt(e.key) - 1]);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isStopped, isRunning, isPaused, canStart, start, pause, resume, stop, clearFrames, showShortcuts]);

  const TABS: Array<{ id: CenterTab; icon: React.ElementType; label: string; color: string; shadow: string }> = [
    { id: 'bus',         icon: Radio,        label: t('can.busMonitor'),       color: 'bg-cyan-600',    shadow: 'shadow-cyan-900/40' },
    { id: 'nodes',       icon: Network,      label: t('can.nodes'),            color: 'bg-green-600',   shadow: 'shadow-green-900/40' },
    { id: 'arbitration', icon: Shuffle,      label: t('can.arbitration'),      color: 'bg-purple-600',  shadow: 'shadow-purple-900/40' },
    { id: 'log',         icon: ScrollText,   label: t('can.log'),              color: 'bg-gray-600',    shadow: 'shadow-gray-900/40' },
    { id: 'fault',       icon: Zap,          label: t('can.faultInjection'),   color: 'bg-red-700',     shadow: 'shadow-red-900/40' },
    { id: 'diagnostics', icon: Stethoscope,  label: 'Diagnostics',             color: 'bg-cyan-700',    shadow: 'shadow-cyan-900/40' },
    { id: 'automation',  icon: Zap,          label: t('can.automation') ?? 'Automation', color: 'bg-purple-700',  shadow: 'shadow-purple-900/40' },
    { id: 'compliance',  icon: ShieldCheck,  label: t('can.compliance'),       color: 'bg-emerald-700', shadow: 'shadow-emerald-900/40' },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden text-gray-200 font-sans">
      {/* Stat bar */}
      <CANStatBar 
        state={state} 
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onSetProfile={handleSetProfile}
        onAddProfile={() => navigate('/can-profiles')}
        onEditProfile={() => navigate('/can-profiles')}
        onSetOutputMode={setOutputMode}
        onConnectSerial={connectSerial}
        onDisconnectSerial={disconnectSerial}
        onConnectNetwork={connectNetwork}
        onDisconnectNetwork={disconnectNetwork}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
      />

      {/* Main area */}
      <div className="flex-1 min-h-0 flex relative bg-[#0a0a0d] overflow-hidden">
        <SmartListenOverlay
          active={isSmartListenActive}
          result={smartListenResult}
          onStart={() => setIsSmartListenActive(true)}
          onCancel={() => setIsSmartListenActive(false)}
          onSync={handleSmartListenSync}
        />

        {/* ── Left panel: Node list ── */}
        <div
          className={`shrink-0 flex flex-col bg-gray-900 border-r border-gray-800/50 transition-all duration-300 ease-in-out relative ${
            isLeftPanelOpen ? 'w-64 xl:w-72 translate-x-0' : 'w-0 -translate-x-full opacity-0'
          }`}
        >
          <div className="w-64 xl:w-72 h-full flex flex-col">
            {/* Node list header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800/60 shrink-0 gap-2">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest shrink-0">{t('can.nodes')}</span>
              <div className="flex items-center gap-1 ml-auto">
                {state.nodes.length > 0 && (
                  <button
                    onClick={clearAllNodes}
                    className="text-[10px] font-mono text-gray-600 hover:text-red-400 border border-gray-800/60 hover:border-red-800/60 rounded px-1.5 py-0.5 transition-colors"
                    title={t('can.clearAllNodes')}
                  >
                    {t('can.clearAll')}
                  </button>
                )}
                <button
                  onClick={() => setShowAddNode(true)}
                  className="text-[10px] font-mono text-cyan-500 hover:text-cyan-300 border border-cyan-800/60 rounded px-1.5 py-0.5 transition-colors"
                >
                  + {t('can.addNode')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {state.nodes.length === 0 ? (
                <div className="text-center text-gray-600 font-mono text-[10px] mt-8 px-2 leading-relaxed">
                  {t('can.noNodes')}
                </div>
              ) : (
                state.nodes.map(node => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    isSelected={state.selectedNodeId === node.id}
                    onSelect={() => selectNode(node.id === state.selectedNodeId ? null : node.id)}
                    onToggle={() => updateNode(node.id, { isActive: !node.isActive })}
                    onRemove={() => removeNode(node.id)}
                    onEdit={() => setEditingNode(node)}
                    onViewVitals={() => {
                      setVitalsNodeId(node.id);
                      setRightPanel('vitals');
                      setIsRightPanelOpen(true);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Left panel toggle button */}
        <button
          onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
          className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 hover:text-white rounded-r-md shadow-lg transition-transform duration-300 ease-in-out ${
            isLeftPanelOpen ? 'translate-x-64 xl:translate-x-72' : 'translate-x-0'
          }`}
        >
          {isLeftPanelOpen ? <ChevronLeft size={16} /> : <Activity size={16} />}
        </button>

        {/* ── Center: tabs + content ── */}
        <div className="flex-1 min-w-0 flex flex-col relative bg-gradient-to-br from-gray-950 to-gray-900 overflow-hidden">
          {/* Toolbar row */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-0 shrink-0">
            {/* Transport controls */}
            {isStopped && (
              <button
                onClick={start}
                disabled={!canStart}
                title={!canStart ? t('can.startNoNodes') : undefined}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-black font-mono font-bold text-xs rounded-lg transition-colors"
              >
                ▶ {t('can.start')}
              </button>
            )}
            {isRunning && (
              <>
                <button onClick={pause} className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-black font-mono font-bold text-xs rounded-lg transition-colors">
                  ⏸ {t('can.pause')}
                </button>
                <button onClick={stop} className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white font-mono font-bold text-xs rounded-lg transition-colors">
                  ■ {t('can.stop')}
                </button>
              </>
            )}
            {isPaused && (
              <>
                <button onClick={resume} className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-black font-mono font-bold text-xs rounded-lg transition-colors">
                  ▶ {t('can.resume')}
                </button>
                <button onClick={stop} className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white font-mono font-bold text-xs rounded-lg transition-colors">
                  ■ {t('can.stop')}
                </button>
              </>
            )}

            <div className="w-px h-5 bg-gray-800 mx-1" />

            {/* Baud rate */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono text-gray-600 mr-0.5">{t('can.baudRate')}:</span>
              {BAUD_RATES.map(rate => (
                <button
                  key={rate}
                  onClick={() => setBaudRate(rate)}
                  className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                    state.baudRate === rate
                      ? 'border-cyan-600 text-cyan-400 bg-cyan-950/30'
                      : 'border-gray-700/50 text-gray-500 hover:border-gray-500'
                  }`}
                >
                  {rate}k
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-gray-800 mx-1" />

            {/* Filter */}
            <input
              type="text"
              value={state.displayFilter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('can.filter')}
              className="bg-gray-800/60 border border-white/10 text-white font-mono text-xs px-2 py-1 rounded-lg w-44 focus:border-cyan-600 outline-none"
            />

            {/* Toggle buttons */}
            <button
              onClick={toggleArbitrationDisplay}
              className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${state.showArbitrationEvents ? 'border-purple-600/60 text-purple-400 bg-purple-950/30' : 'border-gray-700/50 text-gray-600'}`}
            >
              {t('can.arb')}
            </button>
            <button
              onClick={toggleErrorDisplay}
              className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${state.showErrorFrames ? 'border-red-600/60 text-red-400 bg-red-950/30' : 'border-gray-700/50 text-gray-600'}`}
            >
              {t('can.err')}
            </button>

            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={clearFrames}
                className="px-2 py-1 text-[10px] font-mono text-gray-500 hover:text-gray-300 border border-gray-700/50 rounded transition-colors"
              >
                {t('can.clear')}
              </button>
              <button
                onClick={() => setShowShortcuts(true)}
                className="px-2 py-1 text-[10px] font-mono text-gray-500 hover:text-orange-400 border border-gray-700/50 hover:border-orange-800/60 rounded transition-colors"
                title={t('can.canShortcutsShowShortcuts')}
              >
                ?
              </button>
            </div>
          </div>

          {/* Tab bar — same pattern as UART */}
          <div className="flex-1 min-h-0 overflow-hidden relative p-3 flex flex-col gap-3">
            <div className="relative flex items-center group max-w-full overflow-hidden shrink-0">
              {showLeftArrow && (
                <button onClick={() => scrollTabs('left')} className="absolute left-0 z-20 p-1.5 bg-gray-900/80 backdrop-blur-md border border-white/5 text-gray-400 hover:text-white rounded-full shadow-2xl transition-all">
                  <ChevronLeft size={14} />
                </button>
              )}
              <div
                ref={tabContainerRef}
                onScroll={checkScroll}
                className="flex items-center gap-1 glass-panel p-0.5 rounded-xl overflow-x-auto no-scrollbar scroll-smooth"
                style={{ maskImage: `linear-gradient(to right, ${showLeftArrow ? 'transparent' : 'black'} 0%, black 5%, black 95%, ${showRightArrow ? 'transparent' : 'black'} 100%)` }}
              >
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`relative px-3 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 group/tab ${
                      activeTab === tab.id ? `${tab.color} text-white shadow-lg ${tab.shadow}` : 'text-gray-500 hover:text-gray-400'
                    }`}
                  >
                    <tab.icon size={12} className={activeTab === tab.id ? 'animate-pulse' : 'group-hover/tab:scale-110 transition-transform'} />
                    {tab.label}
                  </button>
                ))}
              </div>
              {showRightArrow && (
                <button onClick={() => scrollTabs('right')} className="absolute right-0 z-20 p-1.5 bg-gray-900/80 backdrop-blur-md border border-white/5 text-gray-400 hover:text-white rounded-full shadow-2xl transition-all">
                  <ChevronRight size={14} />
                </button>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 glass-panel rounded-xl overflow-hidden flex flex-col shadow-2xl border-white/5">
              {activeTab === 'bus' && (
                <BusMonitor
                  frames={state.recentFrames}
                  nodes={state.nodes}
                  filter={state.displayFilter}
                  selectedFrameUid={state.selectedFrameUid}
                  showErrorFrames={state.showErrorFrames}
                  isRunning={isRunning}
                  onSelectFrame={selectFrame}
                  onSendFrame={sendFrame}
                />
              )}
              {activeTab === 'nodes' && <NodesTab state={state} updateNode={updateNode} removeNode={removeNode} selectNode={selectNode} onEdit={setEditingNode} />}
              {activeTab === 'arbitration' && <ArbitrationTab events={state.arbitrationEvents} nodes={state.nodes} />}
              {activeTab === 'log' && <LogTab entries={state.logEntries} />}
              {activeTab === 'fault' && (
                <FaultInjectionPanel
                  nodes={state.nodes}
                  selectedNodeId={state.selectedNodeId}
                  onInject={injectFault}
                  onRecover={recoverNode}
                  onSelectNode={selectNode}
                  errorInjection={state.errorInjection}
                  onSetErrorInjectionConfig={setErrorInjectionConfig}
                  onArmErrorInjection={armErrorInjection}
                  isRunning={isRunning}
                />
              )}
              {activeTab === 'diagnostics' && (
                <DiagnosticTerminal
                  frames={state.recentFrames}
                  nodes={state.nodes}
                  isRunning={isRunning}
                  config={state.udsConfig}
                  onSendRequest={sendUDSRequest}
                  onSetConfig={setUDSConfig}
                />
              )}
              {activeTab === 'automation' && (
                <CANAutomationTab
                  nodes={state.nodes}
                  elapsedMs={state.elapsedMs}
                  status={state.status}
                  onInjectFault={injectFault}
                  onRecoverNode={recoverNode}
                />
              )}
              {activeTab === 'compliance' && <CompliancePanel state={state} />}
            </div>
          </div>
        </div>

        {/* Right panel toggle button */}
        <button
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          className={`absolute right-0 top-1/2 -translate-y-1/2 z-30 p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 hover:text-white rounded-l-md shadow-lg transition-transform duration-300 ease-in-out ${
            isRightPanelOpen ? '-translate-x-80' : 'translate-x-0'
          }`}
        >
          {isRightPanelOpen ? <ChevronRight size={16} /> : <Settings2 size={16} />}
        </button>

        {/* ── Right panel: Frame Inspector / Vitals ── */}
        <div
          className={`shrink-0 flex flex-col bg-gray-900 border-l border-gray-800/50 transition-all duration-300 ease-in-out relative ${
            isRightPanelOpen ? 'w-80 translate-x-0' : 'w-0 translate-x-full opacity-0'
          }`}
        >
          <div className="w-80 h-full flex flex-col">
            {/* Panel tab switcher */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800/60 shrink-0">
              <button
                onClick={() => setRightPanel('inspector')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  rightPanel === 'inspector' ? 'bg-cyan-950/40 text-cyan-400 border border-cyan-800/60' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t('can.frameInspector')}
              </button>
              <button
                onClick={() => setRightPanel('vitals')}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  rightPanel === 'vitals' ? 'bg-red-950/40 text-red-400 border border-red-800/60' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <HeartPulse size={10} />
                {t('can.vitals')}
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {rightPanel === 'inspector' && (
                <FrameInspector frame={selectedFrame} node={selectedFrameNode} />
              )}
              {rightPanel === 'vitals' && <VitalsPanel nodes={state.nodes} focusNodeId={vitalsNodeId} onEdit={(node) => setEditingNode(node)} />}
            </div>
          </div>
        </div>
      </div>

      {showAddNode && (
        <AddNodeModal
          existingIds={state.nodes.map(n => n.id)}
          onAdd={(nodeData) => addNode(nodeData)}
          onClose={() => setShowAddNode(false)}
        />
      )}

      {editingNode && (
        <EditNodeModal
          node={editingNode}
          onSave={(nodeId, patch) => updateNode(nodeId, patch)}
          onClose={() => setEditingNode(null)}
        />
      )}

      <CANKeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}


