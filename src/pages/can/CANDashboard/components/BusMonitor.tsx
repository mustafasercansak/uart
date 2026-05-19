import { useMemo } from 'react';
import type { CANFrame } from '../../../../can/types/CANFrame';
import type { CANNode } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';

interface BusMonitorProps {
  frames: CANFrame[];
  nodes: CANNode[];
  filter: string;
  selectedFrameUid: string | null;
  showErrorFrames: boolean;
  onSelectFrame: (uid: string) => void;
}

export function BusMonitor({ frames, nodes, filter, selectedFrameUid, showErrorFrames, onSelectFrame }: BusMonitorProps) {
  const { t } = useTranslation();
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const filtered = useMemo(() => {
    let result = frames;
    if (!showErrorFrames) result = result.filter(f => f.errors.length === 0);
    if (filter.trim()) {
      const f = filter.trim().toLowerCase();
      result = result.filter(frame =>
        frame.arbitrationId.toString(16).toLowerCase().includes(f) ||
        frame.nodeId.toString().includes(f) ||
        frame.data.map(b => b.toString(16).padStart(2, '0')).join(' ').includes(f)
      );
    }
    return result;
  }, [frames, filter, showErrorFrames]);

  if (filtered.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-xs">
        {frames.length === 0 ? t('can.noFrames') : t('can.noFramesFilter')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto font-mono text-[11px]">
      {/* Header row */}
      <div className="sticky top-0 bg-gray-950/90 backdrop-blur-sm grid grid-cols-[80px_80px_60px_40px_180px_1fr] gap-2 px-3 py-1.5 text-gray-600 text-[10px] border-b border-gray-800 uppercase tracking-widest">
        <span>{t('common.time')}</span>
        <span>{t('can.iD')}</span>
        <span>{t('can.node')}</span>
        <span>{t('can.dLC')}</span>
        <span>{t('can.data')}</span>
        <span>Info</span>
      </div>

      {filtered.map((frame) => {
        const node = nodeMap.get(frame.nodeId);
        const nodeColor = node?.color ?? '#94a3b8';
        const hasError = frame.errors.length > 0;
        const isSelected = frame.uid === selectedFrameUid;

        return (
          <div
            key={frame.uid}
            onClick={() => onSelectFrame(frame.uid)}
            className={`grid grid-cols-[80px_80px_60px_40px_180px_1fr] gap-2 px-3 py-1 cursor-pointer transition-colors border-b border-gray-900/60 ${
              isSelected
                ? 'bg-cyan-950/40 border-b-cyan-800/60'
                : hasError
                ? 'bg-red-950/20 hover:bg-red-950/30'
                : 'hover:bg-white/[0.02]'
            }`}
          >
            <span className="text-gray-600 tabular-nums">{new Date(frame.timestamp).toISOString().slice(11, 23)}</span>
            <span className="text-yellow-400 font-bold tabular-nums">
              0x{frame.arbitrationId.toString(16).toUpperCase().padStart(3, '0')}
            </span>
            <span style={{ color: nodeColor }} className="truncate">{node?.name ?? `N${frame.nodeId}`}</span>
            <span className="text-gray-400 text-center">{frame.dlc}</span>
            <span className="text-green-400 tabular-nums tracking-wider">
              {frame.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
            </span>
            <span className={`truncate ${hasError ? 'text-red-400' : 'text-gray-600'}`}>
              {hasError ? frame.errors[0] : decodeInfo(frame, node)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function decodeInfo(frame: CANFrame, node: CANNode | undefined): string {
  if (!node) return `COB-ID: 0x${frame.cobId?.toString(16).toUpperCase() ?? '?'}`;
  const v = node.vitals;
  switch (node.profile) {
    case 'vital-monitor':
    case 'ecg-monitor':
    case 'pulse-oximeter':
      return `HR=${v.heartRate.toFixed(0)} SpO₂=${v.spO2.toFixed(1)}% BP=${v.systolicBP.toFixed(0)}/${v.diastolicBP.toFixed(0)}`;
    case 'iv-pump':
    case 'infusion-pump':
      return `Flow=${(v.flowRateMlHr ?? 0).toFixed(0)} ml/hr P=${(v.pressureMmHg ?? 0).toFixed(0)} mmHg`;
    case 'ventilator':
      return `TV=${v.tidalVolumeMl ?? '?'} ml PEEP=${v.peepCmH2O ?? '?'} FiO₂=${v.fio2Percent ?? '?'}%`;
    case 'defibrillator':
      return `HR=${v.heartRate.toFixed(0)} Standby`;
    default:
      return `TPDO1 Node ${node.id}`;
  }
}
