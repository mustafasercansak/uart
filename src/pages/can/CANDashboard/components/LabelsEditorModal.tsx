import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { MEDICAL_PROFILE_LABELS, MEDICAL_PROFILE_COLORS, type CANMedicalProfile } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';
import type { Locale } from '../../../../i18n/context';
import en from '../../../../i18n/locales/en.json';
import tr from '../../../../i18n/locales/tr.json';

const PROFILES = Object.entries(MEDICAL_PROFILE_LABELS) as [CANMedicalProfile, string][];

function getDefault(i18nKey: string, locale: Locale): string {
  const parts = i18nKey.split('.');
  const src: Record<string, unknown> = locale === 'en' ? en : tr;
  let cur: unknown = src;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return i18nKey;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : i18nKey;
}

interface Props {
  onClose: () => void;
}

export function LabelsEditorModal({ onClose }: Props) {
  const { t, customLabels, setCustomLabel, resetCustomLabel } = useTranslation();

  // Local draft state: { [i18nKey]: { en: string, tr: string } }
  const [draft, setDraft] = useState<Record<string, { en: string; tr: string }>>(() => {
    const init: Record<string, { en: string; tr: string }> = {};
    for (const [, key] of PROFILES) {
      init[key] = {
        en: customLabels.en[key] ?? '',
        tr: customLabels.tr[key] ?? '',
      };
    }
    return init;
  });

  const handleChange = (key: string, locale: 'en' | 'tr', value: string) => {
    setDraft(prev => ({ ...prev, [key]: { ...prev[key], [locale]: value } }));
  };

  const handleReset = (key: string) => {
    setDraft(prev => ({ ...prev, [key]: { en: '', tr: '' } }));
  };

  const handleSave = () => {
    for (const [key, vals] of Object.entries(draft)) {
      (['en', 'tr'] as Locale[]).forEach(loc => {
        const val = vals[loc].trim();
        if (val) {
          setCustomLabel(key, loc, val);
        } else {
          resetCustomLabel(key, loc);
        }
      });
    }
    onClose();
  };

  const hasChanges = Object.entries(draft).some(([key, vals]) =>
    (vals.en.trim() || '') !== (customLabels.en[key] ?? '') ||
    (vals.tr.trim() || '') !== (customLabels.tr[key] ?? '')
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-panel border border-white/10 rounded-xl p-6 w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-mono font-bold text-sm">{t('can.labelsEditor')}</h2>
            <p className="text-[10px] font-mono text-gray-500 mt-0.5">{t('can.labelsEditorHint')}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {/* Header row */}
        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 mb-2 px-1">
          <div className="w-3" />
          <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">EN</div>
          <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">TR</div>
          <div className="w-6" />
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {PROFILES.map(([profile, key]) => {
            const defaultEn = getDefault(key, 'en');
            const defaultTr = getDefault(key, 'tr');
            const isCustomized = (draft[key]?.en.trim() || '') !== '' || (draft[key]?.tr.trim() || '') !== '';

            return (
              <div key={key} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: MEDICAL_PROFILE_COLORS[profile] }}
                />
                <input
                  type="text"
                  value={draft[key]?.en ?? ''}
                  onChange={e => handleChange(key, 'en', e.target.value)}
                  placeholder={defaultEn}
                  className="bg-gray-800/60 border border-white/10 text-white font-mono text-xs px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none placeholder:text-gray-600"
                />
                <input
                  type="text"
                  value={draft[key]?.tr ?? ''}
                  onChange={e => handleChange(key, 'tr', e.target.value)}
                  placeholder={defaultTr}
                  className="bg-gray-800/60 border border-white/10 text-white font-mono text-xs px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none placeholder:text-gray-600"
                />
                <button
                  onClick={() => handleReset(key)}
                  disabled={!isCustomized}
                  title={t('can.resetToDefault')}
                  className="text-gray-600 hover:text-yellow-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-[9px] font-mono text-gray-600 mt-3">
          {t('can.labelsEditorFooter')}
        </p>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-white/10 text-gray-400 font-mono text-sm hover:bg-white/5 transition-colors"
          >
            {t('can.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-black font-mono font-bold text-sm transition-colors"
          >
            {t('can.saveLabels')}
          </button>
        </div>
      </div>
    </div>
  );
}
