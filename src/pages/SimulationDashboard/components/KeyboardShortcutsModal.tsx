import { X, Keyboard } from 'lucide-react';
import { useTranslation } from '../../../i18n/context';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const groups: Array<{ label: string; shortcuts: Array<{ keys: string[]; desc: string }> }> = [
    {
      label: t('shortcuts.groupSimulation'),
      shortcuts: [
        { keys: ['Space'], desc: t('shortcuts.playPause') },
        { keys: ['Esc'], desc: t('shortcuts.stop') },
      ],
    },
    {
      label: t('shortcuts.groupEditor'),
      shortcuts: [
        { keys: ['Ctrl', 'Z'], desc: t('shortcuts.undo') },
        { keys: ['Ctrl', 'Y'], desc: t('shortcuts.redo') },
        { keys: ['Ctrl', 'S'], desc: t('shortcuts.save') },
      ],
    },
    {
      label: t('shortcuts.groupNavigation'),
      shortcuts: [
        { keys: ['?'], desc: t('shortcuts.showShortcuts') },
        { keys: ['Ctrl', 'K'], desc: t('shortcuts.commandPalette') },
      ],
    },
    {
      label: t('shortcuts.groupFrameMonitor'),
      shortcuts: [
        { keys: ['Click'], desc: t('shortcuts.selectFrame') },
        { keys: ['●'], desc: t('shortcuts.startRecording') },
        { keys: ['■'], desc: t('shortcuts.stopExportCsv') },
      ],
    },
    {
      label: t('shortcuts.groupAnalysis'),
      shortcuts: [
        { keys: ['A'], desc: t('shortcuts.slotA') },
        { keys: ['B'], desc: t('shortcuts.slotB') },
        { keys: ['D'], desc: t('shortcuts.diff') },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Keyboard size={16} className="text-green-400" />
            <h2 className="text-sm font-mono font-bold text-gray-200 uppercase tracking-wider">
              {t('shortcuts.title')}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">
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
