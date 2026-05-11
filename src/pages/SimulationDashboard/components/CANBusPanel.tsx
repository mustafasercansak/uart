import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Radio, Send, Trash2, Filter, Play, Square, Hash, AlertTriangle,
  Upload, FileCode2, BarChart2, Activity, Settings2, CheckCircle2,
} from 'lucide-react';
import type {
  CANFrame, CANNode, DBCDatabase, CANBusStats,
  CANNodeStats, CANIdStats, SignalHistory, SignalSample,
} from '../../../types/protocols/canbus';
import {
  buildCANFrame, frameIdHex, frameDataHex, matchesFilter,
} from '../../../utils/canbus';
import { decodeFrame, formatSignalValue, generateRealisticData } from '../../../utils/canDecoder';
import { parseDBCFile, generateSampleDBC } from '../../../utils/dbcParser';
import { useTranslation } from '../../../i18n/context';
import CANSignalChart from './CANSignalChart';

// ── Constants ─────────────────────────────────────────────────────────────────

const SIGNAL_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#a855f7',
  '#ef4444', '#06b6d4', '#84cc16', '#f97316',
];

const DEFAULT_NODES: CANNode[] = [
  { id: 'ECU', name: 'ECU', color: '#3b82f6', enabled: true, txIds: [0x100, 0x101], txPeriods: { 0x100: 100, 0x101: 200 } },
  { id: 'TCU', name: 'TCU', color: '#10b981', enabled: true, txIds: [0x200, 0x201], txPeriods: { 0x200: 100, 0x201: 500 } },
  { id: 'BCM', name: 'BCM', color: '#a855f7', enabled: true, txIds: [0x300],        txPeriods: { 0x300: 200 } },
  { id: 'ABS', name: 'ABS', color: '#f59e0b', enabled: true, txIds: [0x400, 0x401], txPeriods: { 0x400: 20, 0x401: 100 } },
];

const PERIOD_OPTIONS = [10, 20, 50, 100, 200, 500, 1000, 0];
const MAX_FRAMES = 500;
const MAX_SIGNAL_SAMPLES = 120;

type TabId = 'log' | 'signals' | 'nodes' | 'stats';

function parseHexBytes(input: string): number[] | null {
  const parts = input.trim().split(/[\s,]+/).filter(Boolean);
  const result: number[] = [];
  for (const p of parts) {
    const v = parseInt(p, 16);
    if (isNaN(v) || v < 0 || v > 255) return null;
    result.push(v);
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CANBusPanel() {
  const { t } = useTranslation();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [frames, setFrames] = useState<CANFrame[]>([]);
  const [nodes, setNodes] = useState<CANNode[]>(DEFAULT_NODES);
  const [selectedFrame, setSelectedFrame] = useState<CANFrame | null>(null);
  const [dbc, setDbc] = useState<DBCDatabase | null>(null);
  const [dbcError, setDbcError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('log');
  const [signalHistories, setSignalHistories] = useState<Map<string, SignalHistory>>(new Map());

  // ── Manual TX ───────────────────────────────────────────────────────────────
  const [txId, setTxId] = useState('0x100');
  const [idType, setIdType] = useState<'standard' | 'extended'>('standard');
  const [txData, setTxData] = useState('DE AD BE EF 01 02 03 04');
  const [txNode, setTxNode] = useState('ECU');
  const [txError, setTxError] = useState<string | null>(null);

  // ── Filter ──────────────────────────────────────────────────────────────────
  const [filterId, setFilterId] = useState('');
  const [filterMask, setFilterMask] = useState('');
  const [filterEnabled, setFilterEnabled] = useState(false);

  // ── Simulation ──────────────────────────────────────────────────────────────
  const [simRunning, setSimRunning] = useState(false);
  const simRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const simTimeRef = useRef(0);

  // ── Stats (ref for perf) ─────────────────────────────────────────────────────
  const statsRef = useRef<CANBusStats>({
    totalFrames: 0, framesPerSecond: 0, busLoad: 0,
    byNodes: new Map(), byId: new Map(), startTime: Date.now(),
  });
  const [statsSnapshot, setStatsSnapshot] = useState<CANBusStats>({ ...statsRef.current });

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const dbcRef = useRef<DBCDatabase | null>(null);
  dbcRef.current = dbc;
  const framesRef = useRef<CANFrame[]>([]);
  framesRef.current = frames;
  const nodesRef = useRef<CANNode[]>(nodes);
  nodesRef.current = nodes;

  // ── addFrame ─────────────────────────────────────────────────────────────────
  const addFrame = useCallback((frame: CANFrame) => {
    const now = Date.now();
    // Decode signals if DBC loaded
    const decoded = dbcRef.current
      ? decodeFrame(frame.data, frame.id, dbcRef.current) ?? undefined
      : undefined;
    const enriched: CANFrame = { ...frame, timestamp: now, decoded };

    setFrames(prev => [enriched, ...prev].slice(0, MAX_FRAMES));

    // Update stats
    const stats = statsRef.current;
    stats.totalFrames++;

    // Per-node stats
    if (frame.nodeId) {
      const ns = stats.byNodes.get(frame.nodeId) ?? { nodeId: frame.nodeId, frameCount: 0, frameRate: 0, lastSeen: 0, bytesSent: 0 } as CANNodeStats;
      ns.frameCount++;
      ns.lastSeen = now;
      ns.bytesSent += frame.dlc;
      stats.byNodes.set(frame.nodeId, ns);
    }

    // Per-ID stats
    const db = dbcRef.current;
    const existing = stats.byId.get(frame.id) ?? { id: frame.id, count: 0, rate: 0, lastDlc: 0, lastSeen: 0, messageName: db?.messages.get(frame.id)?.name } as CANIdStats;
    existing.count++;
    existing.lastDlc = frame.dlc;
    existing.lastSeen = now;
    stats.byId.set(frame.id, existing);

    // Signal history
    if (decoded && db) {
      const msg = db.messages.get(frame.id);
      if (msg) {
        setSignalHistories(prev => {
          const next = new Map(prev);
          msg.signals.forEach((sig, idx) => {
            const key = `${frame.id}:${sig.name}`;
            const hist = next.get(key) ?? {
              msgId: frame.id, signalName: sig.name, unit: sig.unit,
              min: sig.min, max: sig.max, samples: [],
            } as SignalHistory;
            const sample: SignalSample = { t: now, v: decoded[sig.name] ?? 0 };
            hist.samples = [...hist.samples.slice(-(MAX_SIGNAL_SAMPLES - 1)), sample];
            if (idx === 0) next.set(key, hist); // trick: need all
            next.set(key, { ...hist });
          });
          return next;
        });
      }
    }
  }, []);

  // ── Simulation engine ─────────────────────────────────────────────────────────
  const startSim = useCallback(() => {
    setSimRunning(true);
    simTimeRef.current = 0;

    const timers: ReturnType<typeof setInterval>[] = [];
    const ns = nodesRef.current;

    ns.forEach(node => {
      if (!node.enabled) return;
      node.txIds.forEach(id => {
        const period = node.txPeriods[id] ?? 100;
        if (period === 0) return;

        const timer = setInterval(() => {
          simTimeRef.current += period / 1000;
          const db = dbcRef.current;
          const data = db
            ? generateRealisticData(id, db, simTimeRef.current)
            : Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
          addFrame(buildCANFrame(id, data, 'standard', node.id));
        }, period);
        timers.push(timer);
      });
    });

    simRef.current = timers;
  }, [addFrame]);

  const stopSim = useCallback(() => {
    setSimRunning(false);
    simRef.current.forEach(t => clearInterval(t));
    simRef.current = [];
  }, []);

  // Stats refresh
  useEffect(() => {
    if (!simRunning) return;
    const id = setInterval(() => {
      const stats = statsRef.current;
      const elapsed = (Date.now() - stats.startTime) / 1000;
      stats.framesPerSecond = elapsed > 0 ? Math.round(stats.totalFrames / elapsed) : 0;
      // Rough bus load: assume 500 kbps, ~108 bits per frame avg
      stats.busLoad = Math.min(100, Math.round((stats.framesPerSecond * 108) / 5000));
      // Per-node rates
      stats.byNodes.forEach(ns => {
        ns.frameRate = elapsed > 0 ? Math.round(ns.frameCount / elapsed) : 0;
      });
      setStatsSnapshot({ ...stats, byNodes: new Map(stats.byNodes), byId: new Map(stats.byId) });
    }, 500);
    return () => clearInterval(id);
  }, [simRunning]);

  useEffect(() => () => { simRef.current.forEach(clearInterval); }, []);

  // ── DBC file import ───────────────────────────────────────────────────────────
  const handleDBCFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDbcError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseDBCFile(text, file.name);
        setDbc(parsed);
        setSignalHistories(new Map());
      } catch (err) {
        setDbcError((err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const loadSampleDBC = () => {
    setDbcError(null);
    const parsed = parseDBCFile(generateSampleDBC(), 'sample.dbc');
    setDbc(parsed);
    setSignalHistories(new Map());
  };

  // ── Manual TX ────────────────────────────────────────────────────────────────
  const sendManual = () => {
    setTxError(null);
    const idNum = parseInt(txId, 16);
    if (isNaN(idNum)) { setTxError(t('canbus.invalidId')); return; }
    const maxId = idType === 'standard' ? 0x7ff : 0x1fffffff;
    if (idNum < 0 || idNum > maxId) { setTxError(t('canbus.idOutOfRange', { max: '0x' + maxId.toString(16).toUpperCase() })); return; }
    const data = parseHexBytes(txData);
    if (!data) { setTxError(t('canbus.invalidData')); return; }
    if (data.length > 8) { setTxError(t('canbus.maxBytes')); return; }
    addFrame(buildCANFrame(idNum, data, idType, txNode));
  };

  // ── Filter ────────────────────────────────────────────────────────────────────
  const visibleFrames = useMemo(() => {
    if (!filterEnabled) return frames;
    const fId = parseInt(filterId, 16);
    const fMask = parseInt(filterMask || 'FFF', 16);
    if (isNaN(fId)) return frames;
    return frames.filter(f => matchesFilter(f, fId, fMask));
  }, [frames, filterEnabled, filterId, filterMask]);

  const nodeColor = (nodeId?: string) => nodes.find(n => n.id === nodeId)?.color ?? '#6b7280';

  const clearAll = () => {
    setFrames([]);
    setSelectedFrame(null);
    setSignalHistories(new Map());
    statsRef.current = { totalFrames: 0, framesPerSecond: 0, busLoad: 0, byNodes: new Map(), byId: new Map(), startTime: Date.now() };
    setStatsSnapshot({ ...statsRef.current });
  };

  // ── Sorted signal histories ───────────────────────────────────────────────────
  const sortedHistories = useMemo(() => [...signalHistories.values()], [signalHistories]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'log',     label: t('canbus.tabLog'),     icon: <Radio size={11} /> },
    { id: 'signals', label: t('canbus.tabSignals'),  icon: <Activity size={11} /> },
    { id: 'nodes',   label: t('canbus.tabNodes'),    icon: <Settings2 size={11} /> },
    { id: 'stats',   label: t('canbus.tabStats'),    icon: <BarChart2 size={11} /> },
  ];

  return (
    <div className="h-full flex flex-col font-mono text-xs overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/50 bg-gray-900/40 flex-wrap">
        <div className="p-1.5 bg-blue-500/10 rounded-lg shrink-0">
          <Radio size={14} className="text-blue-400" />
        </div>
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-200 shrink-0">{t('canbus.title')}</span>

        {/* Bus load pill */}
        <div className="flex items-center gap-3 text-[9px] shrink-0">
          <span className="text-gray-600">{statsSnapshot.framesPerSecond} fr/s</span>
          <div className="flex items-center gap-1">
            <div className="w-16 h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${statsSnapshot.busLoad > 70 ? 'bg-red-500' : statsSnapshot.busLoad > 40 ? 'bg-amber-500' : 'bg-blue-500'}`}
                style={{ width: `${statsSnapshot.busLoad}%` }}
              />
            </div>
            <span className="text-gray-500">{statsSnapshot.busLoad}%</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* DBC import */}
          <div className="flex items-center gap-1">
            {dbc ? (
              <span className="flex items-center gap-1 text-[9px] text-green-400 bg-green-900/20 border border-green-800/30 px-2 py-1 rounded-lg">
                <CheckCircle2 size={9} /> {dbc.filename ?? 'DBC'} ({dbc.messages.size} msg)
              </span>
            ) : (
              <button onClick={loadSampleDBC} className="text-[9px] text-blue-400 bg-blue-900/20 border border-blue-800/30 px-2 py-1 rounded-lg hover:bg-blue-900/40 transition-all flex items-center gap-1">
                <FileCode2 size={9} /> {t('canbus.loadSample')}
              </button>
            )}
            <label className="cursor-pointer text-[9px] text-gray-400 bg-gray-900/40 border border-gray-700/50 px-2 py-1 rounded-lg hover:bg-gray-800/60 transition-all flex items-center gap-1">
              <Upload size={9} /> {t('canbus.importDBC')}
              <input type="file" accept=".dbc" onChange={handleDBCFile} className="hidden" />
            </label>
          </div>

          {/* Sim controls */}
          <button
            onClick={simRunning ? stopSim : startSim}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${simRunning ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-blue-700 hover:bg-blue-600 text-white'}`}
          >
            {simRunning ? <><Square size={10} /> {t('canbus.stop')}</> : <><Play size={10} /> {t('canbus.start')}</>}
          </button>
          <button onClick={clearAll} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {dbcError && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-red-950/30 border-b border-red-800/30 text-[9px] text-red-300">
          <AlertTriangle size={9} /> {dbcError}
        </div>
      )}

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex border-b border-gray-800/50 bg-gray-950/20">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-[9px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === tab.id ? 'border-blue-500 text-blue-400 bg-blue-950/20' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center px-3 text-[9px] text-gray-700">
          {visibleFrames.length} / {frames.length}
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ── Left sidebar (always visible) ─────────────────────────────────── */}
        <div className="w-56 shrink-0 border-r border-gray-800/50 flex flex-col overflow-y-auto custom-scrollbar">

          {/* Manual TX */}
          <div className="p-3 border-b border-gray-800/30 space-y-2">
            <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold">{t('canbus.frameSend')}</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-gray-600 w-5 shrink-0">{t('canbus.id')}</span>
              <input value={txId} onChange={e => setTxId(e.target.value)}
                className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1 text-blue-300 text-[10px] outline-none focus:border-blue-500/50 font-mono"
                placeholder="0x100" />
              <select value={idType} onChange={e => setIdType(e.target.value as 'standard' | 'extended')}
                className="bg-gray-900/60 border border-gray-700/50 rounded px-1 py-1 text-gray-400 text-[9px] outline-none">
                <option value="standard">STD</option>
                <option value="extended">EXT</option>
              </select>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[8px] text-gray-600 w-5 shrink-0 mt-1.5">{t('canbus.data')}</span>
              <textarea value={txData} onChange={e => setTxData(e.target.value)} rows={2}
                className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1 text-gray-300 text-[10px] outline-none focus:border-blue-500/50 resize-none font-mono"
                placeholder="DE AD BE EF" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-gray-600 w-5 shrink-0">{t('canbus.node')}</span>
              <select value={txNode} onChange={e => setTxNode(e.target.value)}
                className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1 text-gray-300 text-[10px] outline-none">
                {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            {txError && <div className="flex items-center gap-1 text-[8px] text-red-400"><AlertTriangle size={9} /> {txError}</div>}
            <button onClick={sendManual}
              className="w-full py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 transition-all">
              <Send size={11} /> {t('canbus.send')}
            </button>
          </div>

          {/* Filter */}
          <div className="p-3 border-b border-gray-800/30 space-y-2">
            <div className="flex items-center gap-1.5">
              <Filter size={9} className={filterEnabled ? 'text-blue-400' : 'text-gray-600'} />
              <span className="text-[8px] text-gray-600 uppercase tracking-widest font-bold flex-1">{t('canbus.filter')}</span>
              <button onClick={() => setFilterEnabled(v => !v)}
                className={`text-[8px] px-2 py-0.5 rounded font-bold uppercase transition-all ${filterEnabled ? 'bg-blue-800/40 text-blue-300' : 'bg-gray-800/40 text-gray-600'}`}>
                {filterEnabled ? t('canbus.filterOn') : t('canbus.filterOff')}
              </button>
            </div>
            <div className="flex gap-1">
              <input value={filterId} onChange={e => setFilterId(e.target.value)} placeholder="ID (hex)"
                className="flex-1 bg-gray-900/40 border border-gray-700/40 rounded px-1.5 py-0.5 text-[9px] text-blue-300 font-mono outline-none" />
              <input value={filterMask} onChange={e => setFilterMask(e.target.value)} placeholder="Mask"
                className="w-14 bg-gray-900/40 border border-gray-700/40 rounded px-1.5 py-0.5 text-[9px] text-gray-400 font-mono outline-none" />
            </div>
          </div>

          {/* DBC message list */}
          {dbc && (
            <div className="p-3 flex-1">
              <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-2">{t('canbus.dbcMessages')} ({dbc.messages.size})</div>
              <div className="space-y-1">
                {[...dbc.messages.values()].map(msg => (
                  <div key={msg.id}
                    onClick={() => { setFilterId('0x' + msg.id.toString(16).toUpperCase()); setFilterEnabled(true); }}
                    className="px-2 py-1.5 rounded-lg bg-gray-900/30 border border-gray-800/40 hover:border-blue-800/40 cursor-pointer transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-blue-300 font-bold">{msg.name}</span>
                      <span className="text-[8px] text-gray-600">0x{msg.id.toString(16).toUpperCase()}</span>
                    </div>
                    <div className="text-[7px] text-gray-700 mt-0.5">{msg.signals.length} sig · {msg.dlc}B · {msg.sender}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Tab content ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* LOG tab */}
          {activeTab === 'log' && (
            <>
              <div className="shrink-0 grid grid-cols-[76px_54px_32px_1fr_64px] gap-2 px-3 py-1.5 border-b border-gray-800/30 bg-gray-950/40 text-[8px] text-gray-600 uppercase tracking-widest font-bold">
                <span>{t('canbus.time')}</span><span>{t('canbus.id')}</span>
                <span>DLC</span><span>{t('canbus.data')}</span><span>{t('canbus.node')}</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {visibleFrames.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-700">
                    <Radio size={32} className="mb-2 opacity-20" />
                    <p className="text-[9px] uppercase tracking-widest">{t('canbus.busEmpty')}</p>
                  </div>
                )}
                {visibleFrames.map((f, i) => (
                  <button key={i} onClick={() => setSelectedFrame(f === selectedFrame ? null : f)}
                    className={`w-full grid grid-cols-[76px_54px_32px_1fr_64px] gap-2 px-3 py-1 border-b border-gray-800/20 text-left transition-colors hover:bg-gray-900/40 ${selectedFrame === f ? 'bg-gray-900/60 border-l-2' : ''}`}
                    style={selectedFrame === f ? { borderLeftColor: nodeColor(f.nodeId) } : {}}>
                    <span className="text-[8px] text-gray-600 font-mono tabular-nums">
                      {new Date(f.timestamp).toLocaleTimeString('tr-TR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="text-[10px] font-bold font-mono" style={{ color: nodeColor(f.nodeId) }}>{frameIdHex(f)}</span>
                    <span className="text-[9px] text-gray-500 text-center">{f.dlc}</span>
                    <span className="text-[9px] text-gray-300 font-mono truncate">
                      {f.decoded && dbc
                        ? Object.entries(f.decoded).slice(0, 2).map(([k, v]) => {
                            const msg = dbc.messages.get(f.id);
                            const sig = msg?.signals.find(s => s.name === k);
                            return sig ? `${k}:${formatSignalValue(v, sig).split(' ')[0]}` : '';
                          }).filter(Boolean).join('  ') || frameDataHex(f)
                        : frameDataHex(f)}
                    </span>
                    <span className="text-[9px] text-right" style={{ color: nodeColor(f.nodeId) }}>{f.nodeId ?? '—'}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* SIGNALS tab */}
          {activeTab === 'signals' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
              {sortedHistories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-700">
                  <Activity size={32} className="mb-2 opacity-20" />
                  <p className="text-[9px] uppercase tracking-widest">{t('canbus.noSignals')}</p>
                  {!dbc && <p className="text-[8px] text-gray-700 mt-1">{t('canbus.loadDBCFirst')}</p>}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {sortedHistories.map((hist, idx) => {
                    const last = hist.samples[hist.samples.length - 1];
                    const db2 = dbc;
                    const sig = db2?.messages.get(hist.msgId)?.signals.find(s => s.name === hist.signalName);
                    const msgName = db2?.messages.get(hist.msgId)?.name ?? `0x${hist.msgId.toString(16).toUpperCase()}`;
                    const color = SIGNAL_COLORS[idx % SIGNAL_COLORS.length];
                    return (
                      <div key={`${hist.msgId}:${hist.signalName}`}
                        className="border border-gray-800/50 rounded-lg overflow-hidden bg-gray-950/40">
                        <div className="px-2 pt-2 pb-1 flex items-start justify-between">
                          <div>
                            <div className="text-[9px] font-bold" style={{ color }}>{hist.signalName}</div>
                            <div className="text-[7px] text-gray-600">{msgName}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] font-black font-mono" style={{ color }}>
                              {last ? (sig ? formatSignalValue(last.v, sig) : last.v.toFixed(2)) : '—'}
                            </div>
                          </div>
                        </div>
                        <CANSignalChart history={hist} width={190} height={44} color={color} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* NODES tab */}
          {activeTab === 'nodes' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold">{t('canbus.periodicConfig')}</div>
              {nodes.map(node => (
                <div key={node.id} className="border border-gray-800/50 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-900/40 border-b border-gray-800/30">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
                    <span className="text-[10px] font-bold text-gray-200 flex-1">{node.name}</span>
                    <button
                      onClick={() => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, enabled: !n.enabled } : n))}
                      className={`text-[8px] px-2 py-0.5 rounded font-bold uppercase transition-all ${node.enabled ? 'bg-blue-800/40 text-blue-300' : 'bg-gray-800/40 text-gray-600'}`}>
                      {node.enabled ? t('canbus.nodeOn') : t('canbus.nodeOff')}
                    </button>
                  </div>
                  <div className="px-3 py-2 space-y-1.5">
                    {node.txIds.map(id => (
                      <div key={id} className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-blue-300 w-14">0x{id.toString(16).toUpperCase()}</span>
                        {dbc && <span className="text-[8px] text-gray-600 flex-1 truncate">{dbc.messages.get(id)?.name ?? ''}</span>}
                        <select
                          value={node.txPeriods[id] ?? 100}
                          onChange={e => setNodes(prev => prev.map(n => n.id === node.id
                            ? { ...n, txPeriods: { ...n.txPeriods, [id]: +e.target.value } } : n))}
                          className="bg-gray-900/60 border border-gray-700/50 rounded px-1 py-0.5 text-gray-400 text-[9px] outline-none"
                        >
                          {PERIOD_OPTIONS.map(p => (
                            <option key={p} value={p}>{p === 0 ? t('canbus.manual') : `${p}ms`}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* STATS tab */}
          {activeTab === 'stats' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: t('canbus.totalFrames'), value: statsSnapshot.totalFrames.toLocaleString() },
                  { label: t('canbus.frameRate'),   value: `${statsSnapshot.framesPerSecond} fr/s` },
                  { label: t('canbus.busLoad'),      value: `${statsSnapshot.busLoad}%`,
                    color: statsSnapshot.busLoad > 70 ? 'text-red-400' : statsSnapshot.busLoad > 40 ? 'text-amber-400' : 'text-green-400' },
                ].map(card => (
                  <div key={card.label} className="p-2.5 border border-gray-800/50 rounded-lg bg-gray-950/40 text-center">
                    <div className={`text-xl font-black font-mono ${card.color ?? 'text-blue-300'}`}>{card.value}</div>
                    <div className="text-[8px] text-gray-600 uppercase tracking-widest mt-0.5">{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Per-node */}
              <div>
                <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-2">{t('canbus.nodeStats')}</div>
                <div className="space-y-1">
                  {[...statsSnapshot.byNodes.values()].map(ns => {
                    const node = nodes.find(n => n.id === ns.nodeId);
                    return (
                      <div key={ns.nodeId} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-gray-900/30 border border-gray-800/40">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node?.color ?? '#6b7280' }} />
                        <span className="text-[9px] text-gray-300 font-bold w-10">{ns.nodeId}</span>
                        <span className="text-[9px] text-gray-400 flex-1">{ns.frameCount.toLocaleString()} fr</span>
                        <span className="text-[9px] text-blue-300">{ns.frameRate} fr/s</span>
                        <span className="text-[8px] text-gray-600">{(ns.bytesSent / 1024).toFixed(1)} KB</span>
                      </div>
                    );
                  })}
                  {statsSnapshot.byNodes.size === 0 && (
                    <div className="text-[9px] text-gray-700 text-center py-4">{t('canbus.noData')}</div>
                  )}
                </div>
              </div>

              {/* Top IDs */}
              <div>
                <div className="text-[8px] text-gray-600 uppercase tracking-widest font-bold mb-2">{t('canbus.topIds')}</div>
                <div className="border border-gray-800/50 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[60px_1fr_60px_50px] gap-2 px-3 py-1 bg-gray-900/50 text-[8px] text-gray-600 font-bold uppercase tracking-widest">
                    <span>{t('canbus.id')}</span><span>{t('canbus.msgName')}</span>
                    <span className="text-right">{t('canbus.count')}</span><span className="text-right">DLC</span>
                  </div>
                  {[...statsSnapshot.byId.values()]
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 20)
                    .map(entry => (
                      <div key={entry.id} className="grid grid-cols-[60px_1fr_60px_50px] gap-2 px-3 py-1 border-t border-gray-800/30 text-[9px]">
                        <span className="text-blue-300 font-mono">0x{entry.id.toString(16).toUpperCase()}</span>
                        <span className="text-gray-500 truncate">{entry.messageName ?? '—'}</span>
                        <span className="text-gray-300 text-right">{entry.count.toLocaleString()}</span>
                        <span className="text-gray-600 text-right">{entry.lastDlc}</span>
                      </div>
                    ))}
                  {statsSnapshot.byId.size === 0 && (
                    <div className="text-[9px] text-gray-700 text-center py-4">{t('canbus.noData')}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right detail panel ─────────────────────────────────────────────── */}
        {selectedFrame && activeTab === 'log' && (
          <div className="w-52 shrink-0 border-l border-gray-800/50 overflow-y-auto custom-scrollbar p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">{t('canbus.frameDetail')}</span>
              <button onClick={() => setSelectedFrame(null)} className="text-gray-700 hover:text-gray-400 text-[10px]">✕</button>
            </div>

            <div className="space-y-1.5">
              {[
                { label: t('canbus.id'), value: frameIdHex(selectedFrame) },
                { label: t('canbus.type'), value: selectedFrame.idType === 'extended' ? t('canbus.extended') : t('canbus.standard') },
                { label: 'DLC', value: `${selectedFrame.dlc} byte` },
                { label: 'CRC-15', value: `0x${selectedFrame.crc.toString(16).toUpperCase().padStart(4,'0')}` },
                { label: t('canbus.node'), value: selectedFrame.nodeId ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-600 uppercase tracking-widest">{label}</span>
                  <span className="text-[9px] text-gray-300 font-mono">{value}</span>
                </div>
              ))}
            </div>

            <div>
              <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-1">{t('canbus.data')}</div>
              <div className="flex flex-wrap gap-1">
                {selectedFrame.data.map((b, i) => (
                  <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-800/60 text-blue-300">
                    {b.toString(16).padStart(2,'0').toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            {/* Decoded signals */}
            {selectedFrame.decoded && dbc && (
              <div>
                <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-1">{t('canbus.decoded')}</div>
                <div className="space-y-1">
                  {Object.entries(selectedFrame.decoded).map(([name, value], idx) => {
                    const msg = dbc.messages.get(selectedFrame.id);
                    const sig = msg?.signals.find(s => s.name === name);
                    const color = SIGNAL_COLORS[idx % SIGNAL_COLORS.length];
                    return (
                      <div key={name} className="flex items-center justify-between px-1.5 py-1 rounded bg-gray-900/40 border border-gray-800/30">
                        <span className="text-[8px] font-bold truncate" style={{ color }}>{name}</span>
                        <span className="text-[9px] text-gray-300 font-mono ml-1 shrink-0">
                          {sig ? formatSignalValue(value, sig) : value.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-1">
                <Hash size={8} className="inline mr-1" />{t('canbus.bitFrame')}
              </div>
              <div className="text-[7px] font-mono text-gray-700 break-all leading-4">
                {selectedFrame.raw?.slice(0, 80) ?? '—'}{(selectedFrame.raw?.length ?? 0) > 80 && '…'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
