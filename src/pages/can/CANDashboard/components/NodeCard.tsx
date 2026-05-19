import { Pencil } from 'lucide-react';
import type { CANNode } from '../../../../can/types/CANNode';
import { MEDICAL_PROFILE_LABELS } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';

interface NodeCardProps {
  node: CANNode;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onEdit?: () => void;
}

const NMT_BADGE: Record<CANNode['nmtState'], string> = {
  'initializing':    'text-gray-500',
  'pre-operational': 'text-yellow-500',
  'operational':     'text-green-400',
  'stopped':         'text-red-400',
};

export function NodeCard({ node, isSelected, onSelect, onToggle, onRemove, onEdit }: NodeCardProps) {
  const { t } = useTranslation();
  
  const STATE_BADGE: Record<CANNode['state'], { label: string; cls: string }> = {
    'error-active':  { label: t('can.errorActive'),  cls: 'bg-green-900/60 text-green-400 border-green-700' },
    'error-passive': { label: t('can.errorPassive'), cls: 'bg-yellow-900/60 text-yellow-400 border-yellow-700' },
    'bus-off':       { label: t('can.busOff'),        cls: 'bg-red-900/60 text-red-400 border-red-700' },
    'offline':       { label: t('can.offline'),        cls: 'bg-gray-900/60 text-gray-500 border-gray-700' },
  };

  const stateBadge = STATE_BADGE[node.state];
  const nmtCls = NMT_BADGE[node.nmtState];

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border p-3 cursor-pointer transition-all ${
        isSelected ? 'border-cyan-600 bg-cyan-950/30' : 'border-gray-800 bg-gray-900/40 hover:border-gray-600'
      } ${!node.isActive ? 'opacity-50' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
          <span className="text-xs font-mono font-bold text-white">{node.name}</span>
          <span className="text-[10px] font-mono text-gray-500">#{node.id}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
              node.isActive
                ? 'border-green-700 text-green-400 hover:bg-green-900/30'
                : 'border-gray-700 text-gray-500 hover:bg-gray-800'
            }`}
          >
            {node.isActive ? t('can.on') : t('can.off')}
          </button>
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="text-gray-600 hover:text-cyan-400 p-0.5 transition-colors"
              title={t('can.editNode')}
            >
              <Pencil size={10} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-[10px] text-gray-600 hover:text-red-400 px-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Profile & ID */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono text-gray-400">{t(MEDICAL_PROFILE_LABELS[node.profile])}</span>
        <span className="text-[10px] font-mono text-gray-500">
          ID: 0x{node.baseArbitrationId.toString(16).toUpperCase().padStart(3, '0')}
        </span>
      </div>

      {/* State badges */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${stateBadge.cls}`}>
          {stateBadge.label}
        </span>
        <span className={`text-[9px] font-mono ${nmtCls}`}>
          NMT: {node.nmtState}
        </span>
      </div>

      {/* Error counters */}
      <div className="flex items-center gap-3 mb-2 text-[9px] font-mono">
        <span className="text-gray-500">
          {t('can.tec')}: <span className={node.txErrorCounter > 127 ? 'text-red-400' : 'text-gray-300'}>{node.txErrorCounter}</span>
        </span>
        <span className="text-gray-500">
          {t('can.rec')}: <span className={node.rxErrorCounter > 127 ? 'text-red-400' : 'text-gray-300'}>{node.rxErrorCounter}</span>
        </span>
        <span className="text-gray-500 ml-auto">
          {t('can.tx')}: <span className="text-cyan-400">{node.framesSent}</span>
        </span>
      </div>

      {/* Vitals preview */}
      {node.isActive && (
        <div className="grid grid-cols-3 gap-1">
          <VitalChip label={t('can.heartRate')} value={node.vitals.heartRate.toFixed(0)} unit="bpm" warn={!!(node.vitals.alarmFlags & 0x01)} />
          <VitalChip label={t('can.spO2')} value={node.vitals.spO2.toFixed(1)} unit="%" warn={!!(node.vitals.alarmFlags & 0x02)} />
          <VitalChip label={t('can.temp')} value={node.vitals.temperature.toFixed(1)} unit="°C" warn={!!(node.vitals.alarmFlags & 0x08)} />
        </div>
      )}
    </div>
  );
}

function VitalChip({ label, value, unit, warn }: { label: string; value: string; unit: string; warn: boolean }) {
  return (
    <div className={`rounded px-1.5 py-1 text-center ${warn ? 'bg-red-950/60 border border-red-800' : 'bg-gray-800/60'}`}>
      <div className="text-[8px] font-mono text-gray-500">{label}</div>
      <div className={`text-[10px] font-mono font-bold ${warn ? 'text-red-400' : 'text-white'}`}>{value}</div>
      <div className="text-[8px] font-mono text-gray-600">{unit}</div>
    </div>
  );
}
