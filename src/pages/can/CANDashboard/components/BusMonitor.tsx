import { useMemo, useState, useRef } from 'react';
import { Send, Trash2 } from 'lucide-react';
import type { CANFrame } from '../../../../can/types/CANFrame';
import type { CANNode } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';

interface BusMonitorProps {
  frames: CANFrame[];
  nodes: CANNode[];
  filter: string;
  selectedFrameUid: string | null;
  showErrorFrames: boolean;
  canSend: boolean;
  onSelectFrame: (uid: string) => void;
  onSendFrame: (arbitrationId: number, data: number[]) => void;
  onClear: () => void;
}

export function BusMonitor({ frames, nodes, filter, selectedFrameUid, showErrorFrames, canSend, onSelectFrame, onSendFrame, onClear }: BusMonitorProps) {
  const { t } = useTranslation();
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const [arbId, setArbId] = useState('0x200');
  const [dataHex, setDataHex] = useState('01 02 03 04');
  const [sendError, setSendError] = useState('');
  const [flashSent, setFlashSent] = useState(false);
  const dataRef = useRef<HTMLInputElement>(null);

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

  const handleSend = () => {
    setSendError('');
    const idStr = arbId.trim().replace(/^0[xX]/, '');
    const id = parseInt(idStr, 16);
    if (isNaN(id) || id < 0 || id > 0x1fffffff) {
      setSendError(t('can.arbIdRange'));
      return;
    }
    const bytes = dataHex.trim().split(/\s+/).filter(Boolean).map(s => parseInt(s, 16));
    if (bytes.some(isNaN) || bytes.length === 0 || bytes.length > 8) {
      setSendError(t('can.injectDataError'));
      return;
    }
    onSendFrame(id, bytes);
    setFlashSent(true);
    setTimeout(() => setFlashSent(false), 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Injection bar */}
      <div className={`shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-800/60 bg-gray-900/40 transition-colors ${flashSent ? 'bg-cyan-900/20' : ''}`}>
        <span className="text-[9px] font-mono text-gray-600 uppercase tracking-widest shrink-0">{t('can.inject')}</span>
        <input
          value={arbId}
          onChange={e => setArbId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0x200"
          className="w-32 bg-gray-800/60 border border-white/10 text-yellow-400 font-mono text-[11px] px-2 py-1 rounded focus:border-cyan-600 outline-none"
          title={t('can.arbitrationId')}
        />
        <input
          ref={dataRef}
          value={dataHex}
          onChange={e => setDataHex(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="01 02 03 04"
          className="flex-1 bg-gray-800/60 border border-white/10 text-green-400 font-mono text-[11px] px-2 py-1 rounded focus:border-cyan-600 outline-none"
          title={t('can.injectDataHint')}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-mono text-[10px] font-bold transition-colors shrink-0"
          title={canSend ? t('can.injectSend') : t('can.injectNeedsRunning')}
        >
          <Send size={11} />
          {t('can.injectSend')}
        </button>
        <button
          onClick={onClear}
          disabled={frames.length === 0}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-700/50 hover:border-red-700/60 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed font-mono text-[10px] transition-colors shrink-0"
          title={t('can.clear')}
        >
          <Trash2 size={11} />
          {t('can.clear')}
        </button>
        {sendError && <span className="text-red-400 font-mono text-[10px]">{sendError}</span>}
      </div>

      {/* Frame list */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-xs">
          {frames.length === 0 ? t('can.noFrames') : t('can.noFramesFilter')}
        </div>
      ) : (
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
            const isInjected = frame.nodeId === 0;

            return (
              <div
                key={frame.uid}
                onClick={() => onSelectFrame(frame.uid)}
                className={`grid grid-cols-[80px_80px_60px_40px_180px_1fr] gap-2 px-3 py-1 cursor-pointer transition-colors border-b border-gray-900/60 ${
                  isSelected
                    ? 'bg-cyan-950/40 border-b-cyan-800/60'
                    : hasError
                    ? 'bg-red-950/20 hover:bg-red-950/30'
                    : isInjected
                    ? 'bg-cyan-950/10 hover:bg-cyan-950/20'
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                <span className="text-gray-600 tabular-nums">{new Date(frame.timestamp).toISOString().slice(11, 23)}</span>
                <span className="text-yellow-400 font-bold tabular-nums">
                  0x{frame.arbitrationId.toString(16).toUpperCase().padStart(3, '0')}
                </span>
                <span style={{ color: isInjected ? '#22d3ee' : nodeColor }} className="truncate">
                  {isInjected ? t('can.injectLabel') : (node?.name ?? `N${frame.nodeId}`)}
                </span>
                <span className="text-gray-400 text-center">{frame.dlc}</span>
                <span className="text-green-400 tabular-nums tracking-wider">
                  {frame.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
                </span>
                <span className={`truncate ${hasError ? 'text-red-400' : isInjected ? 'text-cyan-600' : 'text-gray-600'}`}>
                  {hasError ? frame.errors[0] : isInjected ? t('can.injectTag') : decodeInfo(frame, node)}
                </span>
              </div>
            );
          })}
        </div>
      )}
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
