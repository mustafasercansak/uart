import { useState } from 'react';
import type { CANNode, CANMedicalProfile } from '../../../../can/types/CANNode';
import { MEDICAL_PROFILE_LABELS, MEDICAL_PROFILE_COLORS } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';
import { resolveNodeName } from '../../../../can/utils/nodeNameResolver';

interface EditNodeModalProps {
  node: CANNode;
  onSave: (nodeId: number, patch: Partial<CANNode>) => void;
  onClose: () => void;
}

const PROFILES = Object.entries(MEDICAL_PROFILE_LABELS) as [CANMedicalProfile, string][];

export function EditNodeModal({ node, onSave, onClose }: EditNodeModalProps) {
  const { t } = useTranslation();

  const [name, setName] = useState(() => resolveNodeName(node.name, t));
  const [profile, setProfile] = useState<CANMedicalProfile>(node.profile);
  const [baseId, setBaseId] = useState(node.baseArbitrationId);
  const [intervalMs, setIntervalMs] = useState(node.sendIntervalMs);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) { setError(t('can.nodeNameRequired')); return; }
    if (baseId < 0 || baseId > 0x7ff) { setError(t('can.arbIdRange')); return; }

    onSave(node.id, {
      name: name.trim(),
      profile,
      color: MEDICAL_PROFILE_COLORS[profile],
      baseArbitrationId: baseId,
      sendIntervalMs: intervalMs,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-panel border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-mono font-bold text-sm">{t('can.editNode')}</h2>
            <p className="text-[10px] font-mono text-gray-500 mt-0.5">{t('can.nodeIdLabel', { id: node.id })}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-mono text-gray-400 mb-1">{t('can.nodeName')}</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
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
              onChange={(e) => { const v = parseInt(e.target.value.replace(/^0[xX]/, ''), 16); if (!isNaN(v)) setBaseId(v); }}
              className="w-full bg-gray-800/60 border border-white/10 text-white font-mono text-sm px-3 py-2 rounded-lg focus:border-cyan-500 outline-none"
            />
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
            {t('can.saveNode')}
          </button>
        </div>
      </div>
    </div>
  );
}
