import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import type { CANNode } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';

interface VitalsPanelProps {
  nodes: CANNode[];
  focusNodeId?: number | null;
  onEdit?: (node: CANNode) => void;
}

interface VitalHistory {
  heartRate: number[];
  spO2: number[];
  systolicBP: number[];
  temperature: number[];
  respiratoryRate: number[];
}

const HISTORY_LEN = 100;

// VITAL_CONFIGS is defined inside VitalsPanel to access useTranslation hook

function buildPath(values: number[], min: number, max: number, w: number, h: number): string {
  if (values.length < 2) return '';
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((Math.min(Math.max(v, min), max) - min) / range) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function Sparkline({ history, color, min, max, warnLow, warnHigh, isAlarm }: {
  history: number[]; color: string; min: number; max: number;
  warnLow: number; warnHigh: number; isAlarm: boolean;
}) {
  const W = 260; const H = 52;
  const range = max - min || 1;
  const lowY  = H - ((warnLow  - min) / range) * (H - 4) - 2;
  const highY = H - ((warnHigh - min) / range) * (H - 4) - 2;
  const path  = buildPath(history, min, max, W, H);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }}>
      {/* Normal-range band */}
      <rect x={0} y={Math.min(lowY, highY)} width={W} height={Math.abs(highY - lowY)}
        fill={isAlarm ? '#ef444418' : `${color}18`} />
      {/* Threshold lines */}
      <line x1={0} y1={lowY}  x2={W} y2={lowY}  stroke={color} strokeWidth={0.5} strokeDasharray="4 3" strokeOpacity={0.35} />
      <line x1={0} y1={highY} x2={W} y2={highY} stroke={color} strokeWidth={0.5} strokeDasharray="4 3" strokeOpacity={0.35} />
      {/* Area fill */}
      {path && (
        <path d={`${path} L ${W} ${H} L 0 ${H} Z`}
          fill={isAlarm ? '#ef444412' : `${color}10`} />
      )}
      {/* Line */}
      {path && (
        <path d={path} fill="none"
          stroke={isAlarm ? '#ef4444' : color}
          strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* Current value dot */}
      {history.length > 0 && (() => {
        const last = history[history.length - 1];
        const cx = W;
        const cy = H - ((Math.min(Math.max(last, min), max) - min) / range) * (H - 4) - 2;
        return <>
          <circle cx={cx} cy={cy} r={4} fill={isAlarm ? '#ef4444' : color} fillOpacity={0.3} />
          <circle cx={cx} cy={cy} r={2.5} fill={isAlarm ? '#ef4444' : color} />
        </>;
      })()}
    </svg>
  );
}

export function VitalsPanel({ nodes, focusNodeId, onEdit }: VitalsPanelProps) {
  const { t } = useTranslation();
  const VITAL_CONFIGS = [
    { key: 'heartRate'       as keyof VitalHistory, label: t('can.heartRate'),  unit: 'bpm',    color: '#ef4444', min: 20,  max: 200, warnLow: 50,  warnHigh: 120, alarmBit: 0x01, decimals: 0 },
    { key: 'spO2'            as keyof VitalHistory, label: 'SpO₂',        unit: '%',      color: '#3b82f6', min: 60,  max: 100, warnLow: 94,  warnHigh: 100, alarmBit: 0x02, decimals: 1 },
    { key: 'systolicBP'      as keyof VitalHistory, label: t('can.systolicBP'), unit: 'mmHg',   color: '#f97316', min: 60,  max: 200, warnLow: 90,  warnHigh: 160, alarmBit: 0x04, decimals: 0 },
    { key: 'temperature'     as keyof VitalHistory, label: 'Temp',        unit: '°C',     color: '#22c55e', min: 34,  max: 41,  warnLow: 35,  warnHigh: 39,  alarmBit: 0x08, decimals: 1 },
    { key: 'respiratoryRate' as keyof VitalHistory, label: t('can.respRate'),  unit: '/min',   color: '#a855f7', min: 0,   max: 40,  warnLow: 8,   warnHigh: 30,  alarmBit: 0x10, decimals: 0 },
  ] as const;

  // Maintain per-node history keyed by node.id
  const historiesRef = useRef<Map<number, VitalHistory>>(new Map());

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Auto-select first active node when nodes change
  const activeNodes = nodes.filter(n => n.isActive && n.state !== 'bus-off');
  const validFocusId = focusNodeId != null && nodes.some(n => n.id === focusNodeId) ? focusNodeId : null;
  const effectiveId = validFocusId !== null
    ? validFocusId
    : selectedId !== null && nodes.some(n => n.id === selectedId)
    ? selectedId
    : (activeNodes[0]?.id ?? null);

  // Append vitals to history on every render
  useEffect(() => {
    for (const node of nodes) {
      if (!historiesRef.current.has(node.id)) {
        historiesRef.current.set(node.id, {
          heartRate: [], spO2: [], systolicBP: [], temperature: [], respiratoryRate: [],
        });
      }
      const h = historiesRef.current.get(node.id)!;
      const push = (key: keyof VitalHistory, val: number) => {
        h[key] = [...h[key].slice(-(HISTORY_LEN - 1)), val];
      };
      push('heartRate',       node.vitals.heartRate);
      push('spO2',            node.vitals.spO2);
      push('systolicBP',      node.vitals.systolicBP);
      push('temperature',     node.vitals.temperature);
      push('respiratoryRate', node.vitals.respiratoryRate);
    }
    // Clean up removed nodes
    for (const id of historiesRef.current.keys()) {
      if (!nodes.some(n => n.id === id)) historiesRef.current.delete(id);
    }
  });

  const selectedNode = nodes.find(n => n.id === effectiveId) ?? null;
  // eslint-disable-next-line react-hooks/refs
  const history = effectiveId !== null ? (historiesRef.current.get(effectiveId) ?? null) : null;

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-center text-gray-600 font-mono text-xs">
        {t('can.noNodes')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Node selector strip */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-800/60 overflow-x-auto no-scrollbar shrink-0">
        {nodes.map(node => {
          const isSelected = node.id === effectiveId;
          const hasAlarm   = node.vitals.alarmFlags !== 0;
          return (
            <button
              key={node.id}
              onClick={() => setSelectedId(node.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono whitespace-nowrap shrink-0 transition-all ${
                isSelected
                  ? 'border-white/20 bg-gray-800 text-white'
                  : 'border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              } ${!node.isActive ? 'opacity-40' : ''}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
              <span className="max-w-[80px] truncate">{node.name}</span>
              {hasAlarm && <span className="text-red-400">⚠</span>}
            </button>
          );
        })}
      </div>

      {/* Vitals content */}
      {selectedNode && history ? (
        <div className="flex-1 overflow-y-auto">
          {/* Node header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/40">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedNode.color }} />
            <span className="text-xs font-mono font-bold text-white">{selectedNode.name}</span>
            <span className="text-[9px] font-mono text-gray-600">#{selectedNode.id}</span>
            {onEdit && (
              <button
                onClick={() => onEdit(selectedNode)}
                className="ml-auto text-gray-600 hover:text-cyan-400 p-0.5 transition-colors"
                title={t('can.editNode')}
              >
                <Pencil size={11} />
              </button>
            )}
            {selectedNode.activeFault && (
              <span className={`${onEdit ? '' : 'ml-auto'} text-[9px] font-mono text-orange-400 bg-orange-900/30 border border-orange-800/60 px-1.5 py-0.5 rounded`}>
                {selectedNode.activeFault}
              </span>
            )}
            {selectedNode.vitals.alarmFlags !== 0 && (
              <span className={`${selectedNode.activeFault || onEdit ? '' : 'ml-auto'} flex items-center gap-1 text-[9px] font-mono font-bold text-red-400 bg-red-900/30 border border-red-800 px-1.5 py-0.5 rounded animate-pulse`}>
                <AlertTriangle size={9} />
                {t('can.alarm')}
              </span>
            )}
          </div>

          {/* Vital cards */}
          <div className="p-2 space-y-1.5">
            {VITAL_CONFIGS.map(cfg => {
              const current  = selectedNode.vitals[cfg.key as keyof typeof selectedNode.vitals] as number;
              const isAlarm  = !!(selectedNode.vitals.alarmFlags & cfg.alarmBit);
              const hist     = history[cfg.key];
              const pct      = Math.max(0, Math.min(100, ((current - cfg.min) / (cfg.max - cfg.min)) * 100));
              const warnPctL = ((cfg.warnLow  - cfg.min) / (cfg.max - cfg.min)) * 100;
              const warnPctH = ((cfg.warnHigh - cfg.min) / (cfg.max - cfg.min)) * 100;

              return (
                <div key={cfg.key}
                  className={`rounded-xl p-3 ${isAlarm ? 'bg-red-950/20 border border-red-900/50' : 'bg-gray-900/50 border border-gray-800/40'}`}
                >
                  {/* Label + value row */}
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wide">{cfg.label}</span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-mono font-bold tabular-nums leading-none ${isAlarm ? 'text-red-400' : 'text-white'}`}>
                        {current.toFixed(cfg.decimals)}
                      </span>
                      <span className="text-[10px] font-mono text-gray-500">{cfg.unit}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="relative h-1.5 bg-gray-800 rounded-full mb-2 overflow-visible">
                    {/* Normal range highlight */}
                    <div className="absolute top-0 h-full rounded-full opacity-20"
                      style={{ left: `${warnPctL}%`, width: `${warnPctH - warnPctL}%`, backgroundColor: cfg.color }} />
                    {/* Current value marker */}
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-gray-950 transition-all duration-300"
                      style={{ left: `calc(${pct}% - 6px)`, backgroundColor: isAlarm ? '#ef4444' : cfg.color }} />
                  </div>

                  {/* Range labels */}
                  <div className="flex justify-between text-[8px] font-mono text-gray-700 mb-2">
                    <span>{cfg.min}{cfg.unit}</span>
                    <span style={{ color: `${cfg.color}80` }}>{cfg.warnLow}–{cfg.warnHigh}</span>
                    <span>{cfg.max}{cfg.unit}</span>
                  </div>

                  {/* Sparkline */}
                  <Sparkline
                    history={hist}
                    color={cfg.color}
                    min={cfg.min}
                    max={cfg.max}
                    warnLow={cfg.warnLow}
                    warnHigh={cfg.warnHigh}
                    isAlarm={isAlarm}
                  />
                </div>
              );
            })}

            {/* Pump extras */}
            {(selectedNode.profile === 'iv-pump' || selectedNode.profile === 'infusion-pump') && (
              <div className="rounded-xl p-3 bg-gray-900/50 border border-gray-800/40 space-y-2">
                <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wide">{t('can.pumpParams')}</div>
                <PumpRow label={t('can.flowRate')}     value={selectedNode.vitals.flowRateMlHr?.toFixed(1) ?? '—'}     unit="mL/h" />
                <PumpRow label={t('can.infusedVolume')} value={selectedNode.vitals.volumeInfusedMl?.toFixed(0) ?? '—'} unit="mL" />
                <PumpRow label={t('can.pressure')}              value={selectedNode.vitals.pressureMmHg?.toFixed(1) ?? '—'}     unit="mmHg" />
              </div>
            )}

            {selectedNode.profile === 'ventilator' && (
              <div className="rounded-xl p-3 bg-gray-900/50 border border-gray-800/40 space-y-2">
                <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wide">{t('can.ventParams')}</div>
                <PumpRow label="Tidal Vol" value={selectedNode.vitals.tidalVolumeMl?.toFixed(0) ?? '—'}  unit="mL" />
                <PumpRow label="PEEP"      value={selectedNode.vitals.peepCmH2O?.toFixed(1) ?? '—'}     unit={t('can.cmHO')} />
                <PumpRow label={t('can.fiO')}     value={selectedNode.vitals.fio2Percent?.toFixed(0) ?? '—'}    unit="%" />
                <PumpRow label={t('can.peakP')}  value={selectedNode.vitals.peakPressure?.toFixed(1) ?? '—'}   unit={t('can.cmHO')} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-xs p-4 text-center">
          {t('can.selectNodeForVitals')}
        </div>
      )}
    </div>
  );
}

function PumpRow({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center justify-between text-[11px] font-mono">
      <span className="text-gray-500">{label}</span>
      <span className="text-white tabular-nums">{value} <span className="text-gray-600 text-[10px]">{unit}</span></span>
    </div>
  );
}
