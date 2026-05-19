import { useState } from 'react';
import type { CANMedicalProfile } from '../../../../can/types/CANNode';
import { MEDICAL_PROFILE_LABELS, MEDICAL_PROFILE_COLORS } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';

interface AddNodeModalProps {
  existingIds: number[];
  onAdd: (node: {
    id: number;
    name: string;
    profile: CANMedicalProfile;
    color: string;
    baseArbitrationId: number;
    sendIntervalMs: number;
    isActive: boolean;
  }) => void;
  onClose: () => void;
}

const PROFILES = Object.entries(MEDICAL_PROFILE_LABELS) as [CANMedicalProfile, string][];

export function AddNodeModal({ existingIds, onAdd, onClose }: AddNodeModalProps) {
  const { t } = useTranslation();
  const nextId = Array.from({ length: 127 }, (_, i) => i + 1).find(id => !existingIds.includes(id)) ?? 1;

  const [id, setId] = useState(nextId);
  const [name, setName] = useState('');
  const [profile, setProfile] = useState<CANMedicalProfile>('vital-monitor');
  const [baseId, setBaseId] = useState(0x180 + nextId);
  const [intervalMs, setIntervalMs] = useState(100);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) { setError(t('can.nodeNameRequired')); return; }
    if (id < 1 || id > 127) { setError(t('can.nodeIdRange2')); return; }
    if (existingIds.includes(id)) { setError(t('can.nodeIdInUse', { id })); return; }
    if (baseId < 0 || baseId > 0x7ff) { setError(t('can.arbIdRange')); return; }

    onAdd({ id, name: name.trim(), profile, color: MEDICAL_PROFILE_COLORS[profile], baseArbitrationId: baseId, sendIntervalMs: intervalMs, isActive: true });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-panel border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-mono font-bold text-sm">{t('can.addNode')}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="space-y-4">
          {/* Node ID */}
          <div>
            <label className="block text-[10px] font-mono text-gray-400 mb-1">{t('can.nodeIdRange')}</label>
            <input
              type="number" min={1} max={127}
              value={id}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setId(v); setBaseId(0x180 + v); }}
              className="w-full bg-gray-800/60 border border-white/10 text-white font-mono text-sm px-3 py-2 rounded-lg focus:border-cyan-500 outline-none"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-[10px] font-mono text-gray-400 mb-1">{t('can.nodeName')}</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('can.eGBed3VitalMoni')}
              className="w-full bg-gray-800/60 border border-white/10 text-white font-mono text-sm px-3 py-2 rounded-lg focus:border-cyan-500 outline-none"
            />
          </div>

          {/* Profile */}
          <div>
            <label className="block text-[10px] font-mono text-gray-400 mb-1">{t('can.medicalProfile')}</label>
            <div className="grid grid-cols-2 gap-2">
              {PROFILES.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setProfile(key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono transition-colors ${
                    profile === key ? 'border-cyan-600 bg-cyan-950/40 text-cyan-400' : 'border-gray-700/50 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: MEDICAL_PROFILE_COLORS[key] }} />
                  {t(label)}
                </button>
              ))}
            </div>
          </div>

          {/* Arbitration ID */}
          <div>
            <label className="block text-[10px] font-mono text-gray-400 mb-1">{t('can.arbitrationId')}</label>
            <input
              type="text"
              value={`0x${baseId.toString(16).toUpperCase().padStart(3, '0')}`}
              onChange={(e) => { const v = parseInt(e.target.value.replace('0x', '').replace('0X', ''), 16); if (!isNaN(v)) setBaseId(v); }}
              className="w-full bg-gray-800/60 border border-white/10 text-white font-mono text-sm px-3 py-2 rounded-lg focus:border-cyan-500 outline-none"
            />
            <p className="text-[9px] text-gray-600 mt-1 font-mono">
              {t('can.arbitrationIdHint', { id: `0x${(0x180 + id).toString(16).toUpperCase().padStart(3, '0')}` })}
            </p>
          </div>

          {/* Send interval */}
          <div>
            <label className="block text-[10px] font-mono text-gray-400 mb-1">
              {t('can.sendInterval', { ms: intervalMs, hz: (1000 / intervalMs).toFixed(1) })}
            </label>
            <input
              type="range" min={10} max={2000} step={10} value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>

          {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-white/10 text-gray-400 font-mono text-sm hover:bg-white/5 transition-colors"
          >
            {t('can.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-black font-mono font-bold text-sm transition-colors"
          >
            {t('can.addNodeBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
