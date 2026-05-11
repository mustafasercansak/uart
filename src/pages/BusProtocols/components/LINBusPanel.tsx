import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '../../../i18n/context';
import type { LINFrame, LINNode, LINScheduleEntry, LINBusStats } from '../../../types/protocols/linbus';
import {
  buildLINFrame,
  generateLINData,
  pidHex,
  dataHex,
  calcPID,
  calcChecksum,
  SAMPLE_SCHEDULE,
  SAMPLE_NODES,
} from '../../../utils/linbus';

type ActiveTab = 'log' | 'schedule' | 'nodes' | 'stats';

const TAB_COLORS: Record<ActiveTab, string> = {
  log:      'bg-emerald-600 shadow-emerald-900/40',
  schedule: 'bg-amber-600 shadow-amber-900/40',
  nodes:    'bg-violet-600 shadow-violet-900/40',
  stats:    'bg-rose-600 shadow-rose-900/40',
};

const NODE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];

function emptyStats(): LINBusStats {
  return {
    totalFrames: 0,
    framesPerSecond: 0,
    byNodes: new Map(),
    byId: new Map(),
    startTime: Date.now(),
  };
}

export default function LINBusPanel() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ActiveTab>('log');
  const [frames, setFrames]       = useState<LINFrame[]>([]);
  const [nodes, setNodes]         = useState<LINNode[]>(SAMPLE_NODES);
  const [schedule, setSchedule]   = useState<LINScheduleEntry[]>(SAMPLE_SCHEDULE);
  const [simRunning, setSimRunning] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<LINFrame | null>(null);
  const [statsSnapshot, setStatsSnapshot] = useState<LINBusStats>(emptyStats());

  // Manual TX state
  const [txId, setTxId]           = useState('01');
  const [txData, setTxData]       = useState('');
  const [txChecksum, setTxChecksum] = useState<'classic' | 'enhanced'>('enhanced');
  const [txNode, setTxNode]       = useState('BCM');
  const [txError, setTxError]     = useState('');

  const intervalsRef  = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const statsRef      = useRef<LINBusStats>(emptyStats());
  const nodesRef      = useRef(nodes);
  const scheduleRef   = useRef(schedule);
  const tRef          = useRef(0);

  useEffect(() => { nodesRef.current   = nodes;    }, [nodes]);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);

  const pushFrame = useCallback((f: LINFrame) => {
    setFrames(prev => [f, ...prev].slice(0, 500));

    const s = statsRef.current;
    s.totalFrames++;
    const elapsed = (Date.now() - s.startTime) / 1000 || 1;
    s.framesPerSecond = Math.round(s.totalFrames / elapsed);

    if (f.nodeId) {
      const ns = s.byNodes.get(f.nodeId) ?? { nodeId: f.nodeId, frameCount: 0, frameRate: 0, lastSeen: 0 };
      ns.frameCount++;
      ns.lastSeen = f.timestamp;
      ns.frameRate = Math.round(ns.frameCount / elapsed);
      s.byNodes.set(f.nodeId, ns);
    }
    const is = s.byId.get(f.id) ?? { id: f.id, count: 0, name: f.frameName ?? `0x${f.id.toString(16).toUpperCase()}`, lastDlc: 0 };
    is.count++;
    is.lastDlc = f.data.length;
    s.byId.set(f.id, is);
  }, []);

  const stopSim = useCallback(() => {
    Object.values(intervalsRef.current).forEach(clearInterval);
    intervalsRef.current = {};
    setSimRunning(false);
  }, []);

  const startSim = useCallback(() => {
    statsRef.current = emptyStats();
    tRef.current = 0;
    stopSim();

    for (const entry of scheduleRef.current) {
      const node = nodesRef.current.find(n => n.id === entry.publisherNodeId);
      if (!node?.enabled) continue;

      const key = `${entry.publisherNodeId}_${entry.frameId}`;
      intervalsRef.current[key] = setInterval(() => {
        tRef.current += entry.periodMs / 1000;
        const data = generateLINData(entry, tRef.current);
        const frame = buildLINFrame(entry.frameId, data, entry.checksumType, entry.publisherNodeId, entry.name);
        pushFrame(frame);
      }, entry.periodMs);
    }

    setSimRunning(true);
  }, [stopSim, pushFrame]);

  // Stats snapshot every 500ms
  useEffect(() => {
    const id = setInterval(() => {
      const s = statsRef.current;
      setStatsSnapshot({
        totalFrames:   s.totalFrames,
        framesPerSecond: s.framesPerSecond,
        byNodes: new Map(s.byNodes),
        byId:    new Map(s.byId),
        startTime: s.startTime,
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => stopSim(), [stopSim]);

  const handleManualSend = () => {
    setTxError('');
    const idNum = parseInt(txId, 16);
    if (isNaN(idNum) || idNum < 0 || idNum > 0x3F) {
      setTxError(t('linbus.invalidId'));
      return;
    }
    const rawBytes = txData.trim()
      ? txData.trim().split(/\s+/).map(h => parseInt(h, 16))
      : [];
    if (rawBytes.some(isNaN)) { setTxError(t('linbus.invalidData')); return; }
    if (rawBytes.length > 8)  { setTxError(t('linbus.maxBytes'));    return; }

    const entry = schedule.find(e => e.frameId === idNum);
    const frame = buildLINFrame(idNum, rawBytes, txChecksum, txNode, entry?.name);
    pushFrame(frame);
  };

  const tabs: Array<{ id: ActiveTab; label: string }> = [
    { id: 'log',      label: t('linbus.tabLog')      },
    { id: 'schedule', label: t('linbus.tabSchedule') },
    { id: 'nodes',    label: t('linbus.tabNodes')    },
    { id: 'stats',    label: t('linbus.tabStats')    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-950 text-gray-200 font-mono">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-800/60 bg-gray-950/60">
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-200 shrink-0">{t('linbus.title')}</span>
        <div className="flex-1" />

        {/* Bus load */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[8px] text-gray-600 uppercase">{t('linbus.busLoad')}</span>
          <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
              style={{ width: `${Math.min(100, statsSnapshot.framesPerSecond * 2)}%` }}
            />
          </div>
          <span className="text-[8px] text-emerald-400 w-6">{Math.min(100, statsSnapshot.framesPerSecond * 2)}%</span>
        </div>

        <button
          onClick={simRunning ? stopSim : startSim}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${
            simRunning
              ? 'bg-red-900/30 border border-red-700/40 text-red-400 hover:bg-red-900/50'
              : 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/50'
          }`}
        >
          {simRunning ? <><Square size={10} /> {t('linbus.stop')}</> : <><Play size={10} /> {t('linbus.start')}</>}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left sidebar */}
        <div className="w-44 shrink-0 border-r border-gray-800/50 flex flex-col overflow-y-auto custom-scrollbar bg-gray-950/40">
          {/* Manual TX */}
          <div className="p-2 border-b border-gray-800/40">
            <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-1.5">{t('linbus.manualSend')}</div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-gray-600 w-6">{t('linbus.id')}</span>
                <input
                  value={txId}
                  onChange={e => setTxId(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700/50 rounded px-1.5 py-0.5 text-[9px] text-green-400 font-mono outline-none focus:border-green-600"
                  placeholder="0x00–0x3F"
                  maxLength={2}
                />
              </div>
              <div className="flex items-start gap-1">
                <span className="text-[8px] text-gray-600 w-6 mt-1">{t('linbus.data')}</span>
                <textarea
                  value={txData}
                  onChange={e => setTxData(e.target.value)}
                  rows={2}
                  className="flex-1 bg-gray-900 border border-gray-700/50 rounded px-1.5 py-0.5 text-[9px] text-green-400 font-mono outline-none focus:border-green-600 resize-none"
                  placeholder="AA BB CC..."
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-gray-600 w-6">CK</span>
                <select
                  value={txChecksum}
                  onChange={e => setTxChecksum(e.target.value as 'classic' | 'enhanced')}
                  className="flex-1 bg-gray-900 border border-gray-700/50 rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none"
                >
                  <option value="enhanced">Enhanced</option>
                  <option value="classic">Classic</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-gray-600 w-6">{t('linbus.node')}</span>
                <select
                  value={txNode}
                  onChange={e => setTxNode(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700/50 rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none"
                >
                  {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                </select>
              </div>
              {txError && <div className="text-[8px] text-red-400">{txError}</div>}
              <button
                onClick={handleManualSend}
                className="w-full py-1 bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 rounded text-[9px] font-black uppercase tracking-wider hover:bg-emerald-900/50 transition-all"
              >
                {t('linbus.send')}
              </button>
            </div>
          </div>

          {/* Schedule quick list */}
          <div className="p-2 flex-1">
            <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-1.5">{t('linbus.scheduleList')}</div>
            <div className="space-y-0.5">
              {schedule.map(entry => (
                <div key={entry.frameId} className="flex items-center gap-1 p-1 rounded bg-gray-900/40 hover:bg-gray-900/70 cursor-pointer transition-all"
                  onClick={() => { setActiveTab('log'); }}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: nodes.find(n => n.id === entry.publisherNodeId)?.color ?? '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[8px] text-gray-300 truncate">{entry.name}</div>
                    <div className="text-[7px] text-gray-600">ID: 0x{entry.frameId.toString(16).toUpperCase().padStart(2,'0')} · {entry.periodMs}ms</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="shrink-0 flex items-center gap-1 p-1 border-b border-gray-800/40 bg-gray-950/30">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${
                  activeTab === tab.id
                    ? `${TAB_COLORS[tab.id]} text-white shadow-lg`
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {activeTab === 'log' && frames.length > 0 && (
              <button
                onClick={() => { setFrames([]); setSelectedFrame(null); statsRef.current = emptyStats(); }}
                className="ml-auto p-1 text-gray-600 hover:text-red-400 transition-colors"
                title={t('linbus.clear')}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex">
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col">

              {/* LOG TAB */}
              {activeTab === 'log' && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                  {frames.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-700">
                      <p className="text-[9px] uppercase tracking-widest">{t('linbus.busEmpty')}</p>
                    </div>
                  ) : (
                    <table className="w-full text-[9px]">
                      <thead className="sticky top-0 bg-gray-950 z-10">
                        <tr className="text-gray-600 border-b border-gray-800/50">
                          <th className="text-left px-2 py-1 font-normal">{t('linbus.time')}</th>
                          <th className="text-left px-2 py-1 font-normal">{t('linbus.id')}</th>
                          <th className="text-left px-2 py-1 font-normal">PID</th>
                          <th className="text-left px-2 py-1 font-normal">DLC</th>
                          <th className="text-left px-2 py-1 font-normal">{t('linbus.data')}</th>
                          <th className="text-left px-2 py-1 font-normal">CK</th>
                          <th className="text-left px-2 py-1 font-normal">{t('linbus.node')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {frames.map((f, i) => {
                          const nodeColor = nodes.find(n => n.id === f.nodeId)?.color ?? '#6b7280';
                          const isSelected = selectedFrame === f;
                          return (
                            <tr
                              key={i}
                              onClick={() => setSelectedFrame(isSelected ? null : f)}
                              className={`border-b border-gray-900/60 cursor-pointer transition-colors ${
                                isSelected ? 'bg-emerald-900/20' : 'hover:bg-gray-900/40'
                              }`}
                            >
                              <td className="px-2 py-0.5 text-gray-600">{((f.timestamp / 1000) % 1000).toFixed(3)}</td>
                              <td className="px-2 py-0.5 font-bold text-emerald-400">
                                0x{f.id.toString(16).toUpperCase().padStart(2,'0')}
                              </td>
                              <td className="px-2 py-0.5 text-gray-500">{pidHex(f.pid)}</td>
                              <td className="px-2 py-0.5 text-gray-400">{f.data.length}</td>
                              <td className="px-2 py-0.5 text-blue-300 font-mono tracking-wider">{dataHex(f.data)}</td>
                              <td className="px-2 py-0.5 text-gray-500">{f.checksum.toString(16).toUpperCase().padStart(2,'0')}</td>
                              <td className="px-2 py-0.5">
                                <span className="font-bold text-[8px]" style={{ color: nodeColor }}>{f.nodeId ?? '—'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* SCHEDULE TAB */}
              {activeTab === 'schedule' && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-2">
                  <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-2">{t('linbus.scheduleConfig')}</div>
                  {schedule.map((entry, idx) => {
                    const nodeColor = nodes.find(n => n.id === entry.publisherNodeId)?.color ?? '#6b7280';
                    return (
                      <div key={idx} className="bg-gray-900/40 border border-gray-800/40 rounded-lg p-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: nodeColor }} />
                          <input
                            value={entry.name}
                            onChange={e => setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                            className="flex-1 bg-transparent text-[9px] font-bold text-gray-200 outline-none border-b border-transparent focus:border-gray-700"
                          />
                          <button
                            onClick={() => setSchedule(prev => prev.filter((_, i) => i !== idx))}
                            className="text-gray-700 hover:text-red-400 transition-colors ml-auto"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[8px]">
                          <label className="flex items-center gap-1 text-gray-600">
                            ID
                            <input
                              value={entry.frameId.toString(16).toUpperCase().padStart(2,'0')}
                              onChange={e => {
                                const v = parseInt(e.target.value, 16);
                                if (!isNaN(v) && v <= 0x3F)
                                  setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, frameId: v } : s));
                              }}
                              className="w-10 bg-gray-900 border border-gray-700/50 rounded px-1 py-0.5 text-green-400 font-mono outline-none text-[8px]"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-gray-600">
                            DLC
                            <select
                              value={entry.dlc}
                              onChange={e => setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, dlc: +e.target.value } : s))}
                              className="w-10 bg-gray-900 border border-gray-700/50 rounded px-1 py-0.5 text-gray-300 outline-none text-[8px]"
                            >
                              {[1,2,3,4,5,6,7,8].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </label>
                          <label className="flex items-center gap-1 text-gray-600">
                            {t('linbus.period')}
                            <select
                              value={entry.periodMs}
                              onChange={e => setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, periodMs: +e.target.value } : s))}
                              className="w-16 bg-gray-900 border border-gray-700/50 rounded px-1 py-0.5 text-gray-300 outline-none text-[8px]"
                            >
                              {[10,20,50,100,200,500,1000].map(p => <option key={p} value={p}>{p}ms</option>)}
                            </select>
                          </label>
                          <label className="flex items-center gap-1 text-gray-600">
                            CK
                            <select
                              value={entry.checksumType}
                              onChange={e => setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, checksumType: e.target.value as 'classic' | 'enhanced' } : s))}
                              className="w-20 bg-gray-900 border border-gray-700/50 rounded px-1 py-0.5 text-gray-300 outline-none text-[8px]"
                            >
                              <option value="enhanced">Enhanced</option>
                              <option value="classic">Classic</option>
                            </select>
                          </label>
                          <label className="col-span-2 flex items-center gap-1 text-gray-600">
                            {t('linbus.publisher')}
                            <select
                              value={entry.publisherNodeId}
                              onChange={e => setSchedule(prev => prev.map((s, i) => i === idx ? { ...s, publisherNodeId: e.target.value } : s))}
                              className="flex-1 bg-gray-900 border border-gray-700/50 rounded px-1 py-0.5 text-gray-300 outline-none text-[8px]"
                            >
                              {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setSchedule(prev => [...prev, {
                      frameId: 0x3A, name: 'NewFrame', dlc: 2, periodMs: 200,
                      publisherNodeId: nodes[0]?.id ?? 'Node', checksumType: 'enhanced'
                    }])}
                    className="w-full py-1.5 border border-dashed border-gray-700/50 rounded-lg text-[9px] text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-all"
                  >
                    + {t('linbus.addFrame')}
                  </button>
                </div>
              )}

              {/* NODES TAB */}
              {activeTab === 'nodes' && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-2">
                  <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-2">{t('linbus.nodeConfig')}</div>
                  {nodes.map((node, idx) => (
                    <div key={node.id} className="bg-gray-900/40 border border-gray-800/40 rounded-lg p-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
                        <span className="text-[9px] font-bold text-gray-200">{node.name}</span>
                        <span className="text-[8px] text-gray-600 ml-1">({node.id})</span>
                        <button
                          onClick={() => setNodes(prev => prev.map((n, i) => i === idx ? { ...n, enabled: !n.enabled } : n))}
                          className={`ml-auto px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-all border ${
                            node.enabled
                              ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400'
                              : 'bg-gray-800/30 border-gray-700/40 text-gray-500'
                          }`}
                        >
                          {node.enabled ? t('linbus.nodeOn') : t('linbus.nodeOff')}
                        </button>
                      </div>
                      <div className="text-[8px] text-gray-600">
                        {t('linbus.publishes')}: {node.publishedIds.map(id => (
                          <span key={id} className="inline-block mr-1 px-1 py-0.5 bg-gray-800 rounded text-emerald-500">
                            0x{id.toString(16).toUpperCase().padStart(2,'0')}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STATS TAB */}
              {activeTab === 'stats' && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: t('linbus.totalFrames'), value: statsSnapshot.totalFrames.toLocaleString() },
                      { label: t('linbus.frameRate'),   value: `${statsSnapshot.framesPerSecond} fr/s` },
                    ].map(card => (
                      <div key={card.label} className="bg-gray-900/50 border border-gray-800/40 rounded-lg p-2 text-center">
                        <div className="text-[8px] text-gray-600 uppercase tracking-widest">{card.label}</div>
                        <div className="text-[16px] font-black text-gray-100 mt-0.5">{card.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Node stats */}
                  <div>
                    <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-1.5">{t('linbus.nodeStats')}</div>
                    {statsSnapshot.byNodes.size === 0 ? (
                      <div className="text-[9px] text-gray-700 text-center py-4">{t('linbus.noData')}</div>
                    ) : (
                      <div className="space-y-1">
                        {Array.from(statsSnapshot.byNodes.values()).map(ns => {
                          const nodeColor = nodes.find(n => n.id === ns.nodeId)?.color ?? '#6b7280';
                          return (
                            <div key={ns.nodeId} className="flex items-center gap-2 bg-gray-900/30 rounded px-2 py-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: nodeColor }} />
                              <span className="text-[9px] font-bold" style={{ color: nodeColor }}>{ns.nodeId}</span>
                              <span className="text-[8px] text-gray-500 ml-auto">{ns.frameCount.toLocaleString()} frames</span>
                              <span className="text-[8px] text-gray-600">{ns.frameRate} fr/s</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Top IDs */}
                  <div>
                    <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-1.5">{t('linbus.topIds')}</div>
                    {statsSnapshot.byId.size === 0 ? (
                      <div className="text-[9px] text-gray-700 text-center py-4">{t('linbus.noData')}</div>
                    ) : (
                      <table className="w-full text-[9px]">
                        <thead>
                          <tr className="text-gray-600 border-b border-gray-800/50">
                            <th className="text-left py-1 font-normal">{t('linbus.id')}</th>
                            <th className="text-left py-1 font-normal">{t('linbus.msgName')}</th>
                            <th className="text-right py-1 font-normal">{t('linbus.count')}</th>
                            <th className="text-right py-1 font-normal">DLC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(statsSnapshot.byId.values())
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 10)
                            .map(is => (
                              <tr key={is.id} className="border-b border-gray-900/60">
                                <td className="py-0.5 text-emerald-400 font-bold">0x{is.id.toString(16).toUpperCase().padStart(2,'0')}</td>
                                <td className="py-0.5 text-gray-400 truncate max-w-[80px]">{is.name}</td>
                                <td className="py-0.5 text-right text-gray-300">{is.count}</td>
                                <td className="py-0.5 text-right text-gray-500">{is.lastDlc}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Frame detail panel */}
            {selectedFrame && (
              <div className="w-52 shrink-0 border-l border-gray-800/50 bg-gray-950/60 overflow-y-auto custom-scrollbar p-2 space-y-2">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] uppercase tracking-widest text-gray-500 font-bold flex-1">{t('linbus.frameDetail')}</span>
                  <button onClick={() => setSelectedFrame(null)} className="text-gray-700 hover:text-gray-400 text-[10px]">✕</button>
                </div>
                {[
                  { label: t('linbus.id'),   value: `0x${selectedFrame.id.toString(16).toUpperCase().padStart(2,'0')}` },
                  { label: 'PID',            value: pidHex(selectedFrame.pid) },
                  { label: 'DLC',            value: String(selectedFrame.data.length) },
                  { label: 'Checksum',       value: `0x${selectedFrame.checksum.toString(16).toUpperCase().padStart(2,'0')} (${selectedFrame.checksumType})` },
                  { label: t('linbus.node'), value: selectedFrame.nodeId ?? '—' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between gap-1">
                    <span className="text-[8px] text-gray-600">{row.label}</span>
                    <span className="text-[8px] text-gray-200 font-bold">{row.value}</span>
                  </div>
                ))}
                <div className="text-[8px] text-gray-600 uppercase tracking-widest mt-1">{t('linbus.data')}</div>
                <div className="flex flex-wrap gap-1">
                  {selectedFrame.data.map((b, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-700/50 rounded px-1.5 py-0.5 text-[9px] text-blue-300 font-mono">
                      {b.toString(16).toUpperCase().padStart(2, '0')}
                    </div>
                  ))}
                </div>
                {selectedFrame.frameName && (
                  <div className="mt-1 text-[8px] text-amber-400 font-bold">{selectedFrame.frameName}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
