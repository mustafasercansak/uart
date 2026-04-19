import React, { useState } from 'react';
import { Plus, Trash2, Zap, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { Trigger, TriggerAction } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../../../i18n/LanguageContext';

interface TriggerManagerProps {
  triggers: Trigger[];
  onSetTriggers: (triggers: Trigger[]) => void;
}

const TriggerManager: React.FC<TriggerManagerProps> = ({ triggers, onSetTriggers }) => {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [newTrigger, setNewTrigger] = useState<Partial<Trigger>>({
    name: t('triggerManager.newTrigger'),
    condition: 'BPM > 150',
    action: 'log_warning',
    enabled: true,
    cooldownMs: 1000
  });

  const ACTION_LABELS: Record<TriggerAction, string> = {
    'stop_simulation': t('triggerManager.actionLabels.stop_simulation'),
    'start_recording': t('triggerManager.actionLabels.start_recording'),
    'log_warning': t('triggerManager.actionLabels.log_warning'),
    'inject_error': t('triggerManager.actionLabels.inject_error'),
    'set_field': t('triggerManager.actionLabels.set_field')
  };

  const handleAdd = () => {
    const trigger: Trigger = {
      id: uuidv4(),
      name: newTrigger.name || t('triggerManager.unnamed'),
      enabled: true,
      condition: newTrigger.condition || 'true',
      action: newTrigger.action || 'log_warning',
      actionPayload: newTrigger.actionPayload,
      cooldownMs: newTrigger.cooldownMs || 1000
    };
    onSetTriggers([...triggers, trigger]);
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    onSetTriggers(triggers.filter(t => t.id !== id));
  };

  const toggleEnable = (id: string) => {
    onSetTriggers(triggers.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 border-l border-gray-800 w-80 shrink-0 shadow-2xl overflow-hidden font-mono">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/20">
        <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <Zap size={14} className="text-yellow-500" />
          {t('triggerManager.title')}
        </h3>
        <button
          onClick={() => setIsAdding(true)}
          className="p-1 hover:bg-gray-800 rounded text-emerald-500 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {triggers.length === 0 && !isAdding && (
          <div className="text-center py-10">
            <ShieldCheck size={32} className="mx-auto text-gray-800 mb-2 opacity-20" />
            <p className="text-[10px] text-gray-600 italic">{t('triggerManager.noRules')}</p>
          </div>
        )}

        {isAdding && (
          <div className="bg-gray-900/50 p-3 rounded-lg border border-emerald-500/30 space-y-3 animate-in fade-in slide-in-from-top-2">
            <div>
              <label className="text-[9px] text-gray-500 uppercase block mb-1">{t('triggerManager.ruleName')}</label>
              <input
                value={newTrigger.name}
                onChange={e => setNewTrigger({...newTrigger, name: e.target.value})}
                className="w-full bg-gray-950 border border-gray-800 text-[10px] p-1.5 rounded focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase block mb-1">{t('triggerManager.condition')}</label>
              <input
                value={newTrigger.condition}
                onChange={e => setNewTrigger({...newTrigger, condition: e.target.value})}
                className="w-full bg-gray-950 border border-gray-800 text-[10px] p-1.5 rounded font-mono text-yellow-400 focus:border-emerald-500 outline-none"
                placeholder={t('triggerManager.conditionPlaceholder')}
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase block mb-1">{t('triggerManager.action')}</label>
              <select
                value={newTrigger.action}
                onChange={e => setNewTrigger({...newTrigger, action: e.target.value as TriggerAction})}
                className="w-full bg-gray-950 border border-gray-800 text-[10px] p-1.5 rounded focus:border-emerald-500 outline-none"
              >
                {Object.entries(ACTION_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAdd}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] p-1.5 rounded font-bold transition-all"
              >
                {t('triggerManager.save')}
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] p-1.5 rounded font-bold transition-all"
              >
                {t('triggerManager.cancel')}
              </button>
            </div>
          </div>
        )}

        {triggers.map(trigger => (
          <div
            key={trigger.id}
            className={`group bg-gray-900/30 border p-3 rounded-lg transition-all ${
              trigger.enabled ? 'border-gray-800/50' : 'border-gray-900 opacity-50'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
               <div>
                  <div className="text-[11px] font-bold text-gray-200">{trigger.name}</div>
                  <div className="text-[9px] font-mono text-yellow-500/80 mt-1">{trigger.condition}</div>
               </div>
               <div className="flex gap-1 items-center">
                  <button
                    onClick={() => toggleEnable(trigger.id)}
                    className={`w-8 h-4 rounded-full relative transition-colors ${trigger.enabled ? 'bg-emerald-600' : 'bg-gray-800'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${trigger.enabled ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                  <button
                    onClick={() => handleDelete(trigger.id)}
                    className="p-1 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
               </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-800/50">
               <Zap size={10} className={trigger.enabled ? 'text-yellow-500' : 'text-gray-700'} />
               <span className="text-[9px] text-gray-500 uppercase tracking-tighter">
                  {ACTION_LABELS[trigger.action]}
               </span>
               {trigger.lastTriggeredAt && (
                 <span className="ml-auto text-[8px] text-emerald-500/50 animate-pulse">{t('triggerManager.active')}</span>
               )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 bg-gray-900/50 border-t border-gray-800">
         <div className="flex items-center gap-2 text-rose-500/70">
            <AlertTriangle size={12} />
            <span className="text-[9px] uppercase font-bold tracking-tight">{t('triggerManager.criticalMonitor')}</span>
         </div>
      </div>
    </div>
  );
};

export default TriggerManager;
