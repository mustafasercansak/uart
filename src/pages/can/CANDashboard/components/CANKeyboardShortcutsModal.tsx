import { X, Keyboard } from 'lucide-react';
import { useTranslation } from '../../../../i18n/context';

interface CANKeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CANKeyboardShortcutsModal({ isOpen, onClose }: CANKeyboardShortcutsModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const groups: Array<{ label: string; shortcuts: Array<{ keys: string[]; desc: string }> }> = [
    {
      label: t('can.canShortcutsGroupBus'),
      shortcuts: [
        { keys: ['Space'], desc: t('can.canShortcutsStartStop') },
        { keys: ['Esc'],   desc: t('can.canShortcutsStop') },
        { keys: ['C'],     desc: t('can.canShortcutsClearFrames') },
      ],
    },
    {
      label: t('can.canShortcutsGroupTabs'),
      shortcuts: [
        { keys: ['1'], desc: t('can.canShortcutsTab1') },
        { keys: ['2'], desc: t('can.canShortcutsTab2') },
        { keys: ['3'], desc: t('can.canShortcutsTab3') },
        { keys: ['4'], desc: t('can.canShortcutsTab4') },
        { keys: ['5'], desc: t('can.canShortcutsTab5') },
        { keys: ['6'], desc: t('can.canShortcutsTab6') },
        { keys: ['7'], desc: t('can.canShortcutsTab7') },
      ],
    },
    {
      label: t('can.canShortcutsGroupNodes'),
      shortcuts: [
        { keys: ['N'], desc: t('can.canShortcutsAddNode') },
      ],
    },
    {
      label: t('can.canShortcutsGroupMonitor'),
      shortcuts: [
        { keys: ['Enter'], desc: t('can.injectSend') },
        { keys: ['?'],     desc: t('can.canShortcutsShowShortcuts') },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-orange-900/40 rounded-xl w-full max-w-2xl mx-4 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Keyboard size={16} className="text-orange-400" />
            <h2 className="text-sm font-mono font-bold text-gray-200 uppercase tracking-wider">
              {t('can.canShortcutsTitle')}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-6">
          {groups.map(group => (
            <div key={group.label}>
              <div className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest mb-2">
                {group.label}
              </div>
              <div className="space-y-1.5">
                {group.shortcuts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-gray-400">{s.desc}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, ki) => (
                        <span key={ki} className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600 text-[10px] font-mono text-gray-300">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-2.5 border-t border-gray-800 text-[10px] font-mono text-gray-600 text-center">
          {t('shortcuts.pressToClose')} <span className="text-gray-400">{t('can.esc')}</span> {t('shortcuts.orClickOutside')}
        </div>
      </div>
    </div>
  );
}
