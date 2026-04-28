import React, { useState, useEffect } from 'react';
import {
  Play, Square, Plus, Trash2, CheckCircle2,
  XCircle, Clock, Send, Eye, Save,
  FilePlus, List, ChevronDown, Download, Upload
} from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import { v4 as uuidv4 } from 'uuid';

import { AutomationStep, ConversationEntry } from '../../../types';
import { useTranslation } from '../../../i18n/context';

const SequenceRunner: React.FC = () => {
  const { t } = useTranslation();
  const { state, sendRawData, automation } = useSimulation();
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [sequenceName, setSequenceName] = useState(t('automation.newSequence'));
  const [activeId, setActiveId] = useState<string | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = React.useRef(false);
  const stateRef = React.useRef(state);
  const [currentStepIdx, setCurrentStepIdx] = useState<number | null>(null);

  // Load active sequence from state or set default
  useEffect(() => {
    if (state.activeSequenceId) {
      const seq = state.sequences.find(s => s.id === state.activeSequenceId);
      if (seq && seq.id !== activeId) {
        Promise.resolve().then(() => {
          setSteps(seq.steps);
          setSequenceName(seq.name);
          setActiveId(seq.id);
        });
      }
    } else if (state.sequences.length > 0 && !activeId) {
      // Auto-load first one if none active
      const first = state.sequences[0];
      Promise.resolve().then(() => {
        setSteps(first.steps);
        setSequenceName(first.name);
        setActiveId(first.id);
      });
    } else if (steps.length === 0 && !activeId && state.sequences.length === 0) {
      // Initial default steps
      Promise.resolve().then(() => {
        setSteps([
          { id: '1', type: 'send', payload: '55 AA 01 02 03', status: 'idle' },
          { id: '2', type: 'wait', payload: '500', status: 'idle' },
          { id: '3', type: 'expect', payload: '55 AA 01 02 03', status: 'idle' },
        ]);
      });
    }
  }, [state.activeSequenceId, state.sequences, activeId, steps.length]);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const addStep = (type: AutomationStep['type']) => {
    const newStep: AutomationStep = {
      id: uuidv4(),
      type,
      payload: type === 'wait' ? '1000' : '',
      status: 'idle'
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStep = (id: string, payload: string) => {
    setSteps(steps.map(s => s.id === id ? { ...s, payload } : s));
  };

  const saveSequence = () => {
    const sequenceId = activeId || uuidv4();
    const newSequence: import('../../../types').AutomationSequence = {
      id: sequenceId,
      name: sequenceName,
      steps: steps.map(s => ({ ...s, status: 'idle' })),
      updatedAt: new Date().toISOString(),
      createdAt: (activeId ? state.sequences.find(s => s.id === activeId)?.createdAt : null) || new Date().toISOString()
    };
    automation.saveSequence(newSequence);
    if (!activeId) {
      setActiveId(sequenceId);
      automation.setActiveSequence(sequenceId);
    }
  };

  const deleteActiveSequence = () => {
    if (activeId) {
      automation.deleteSequence(activeId);
      setActiveId(null);
      setSteps([]);
      setSequenceName(t('automation.newSequence'));
    }
  };

  const createNew = () => {
    setActiveId(null);
    automation.setActiveSequence(null);
    setSteps([]);
    setSequenceName(t('automation.untitledTest'));
  };

  const onSelectSequence = (id: string) => {
    automation.setActiveSequence(id);
  };

  const runSequence = async () => {
    if (isRunningRef.current) return;
    setIsRunning(true);
    isRunningRef.current = true;
    setCurrentStepIdx(0);

    // Reset statuses to idle before starting
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle' as const })));

    for (let i = 0; i < steps.length; i++) {
      if (!isRunningRef.current) break;
      setCurrentStepIdx(i);
      setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'running' } : s));

      const step = steps[i];
      try {
        if (step.type === 'send') {
          sendRawData?.(step.payload);
          await new Promise(r => setTimeout(r, 100));
        } else if (step.type === 'wait') {
          await new Promise(r => setTimeout(r, parseInt(step.payload) || 1000));
        } else if (step.type === 'expect') {
          let matched = false;
          const [patternPart, timeoutPart] = step.payload.split('|').map((p) => p.trim());
          const searchPattern = (patternPart || '').replace(/\s+/g, '').toUpperCase();
          const timeoutMs = Number.parseInt(timeoutPart || '2500', 10);
          const deadline = Date.now() + (Number.isFinite(timeoutMs) ? Math.max(200, timeoutMs) : 2500);

          while (Date.now() < deadline) {
            if (!isRunningRef.current) break;

            // Scan more entries to handle high traffic situations
            const recentLogs = stateRef.current.conversationLogs.slice(0, 40);
            if (recentLogs.some((log: ConversationEntry) => {
              if (log.type !== 'rx') return false;
              const raw = log.rawHex.replace(/\s+/g, '').toUpperCase();
              return raw.includes(searchPattern);
            })) {
              matched = true;
              break;
            }
            await new Promise(r => setTimeout(r, 50));
          }
          if (!isRunningRef.current) return;
          if (!matched) throw new Error(t('automation.timeoutError'));
        }

        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success' } : s));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'fail', result: message } : s));
        setIsRunning(false);
        isRunningRef.current = false;
        return;
      }
    }

    setIsRunning(false);
    isRunningRef.current = false;
    setCurrentStepIdx(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-950/40 p-4">
      {/* Sequence Manager Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-black text-blue-400 uppercase tracking-widest">{t('automation.lab')}</span>
            <span className="text-xs text-gray-500 font-mono">{t('automation.runner')}</span>
          </div>

          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                onClick={runSequence}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all group"
              >
                <Play size={14} fill="currentColor" className="group-hover:scale-110 transition-transform" />
                {t('automation.runSequence')}
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsRunning(false);
                  isRunningRef.current = false;
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-900/20 transition-all"
              >
                <Square size={14} fill="currentColor" />
                {t('automation.stop')}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 glass-panel p-2 rounded-xl border border-gray-800">
          <div className="relative flex-1">
            <select
              value={activeId || ''}
              onChange={(e) => onSelectSequence(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-3 pr-8 py-2 text-xs font-mono text-gray-300 appearance-none focus:outline-none focus:border-blue-500/50"
            >
              <option value="">{t('automation.selectScenario')}</option>
              {state.sequences.map(seq => (
                <option key={seq.id} value={seq.id}>{seq.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>

          <input
            value={sequenceName}
            onChange={(e) => setSequenceName(e.target.value)}
            placeholder={t('automation.scenarioName')}
            className="flex-[1.5] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500/50"
          />

          <div className="flex items-center gap-1">
            <button
              onClick={createNew}
              title={t('automation.newScenario')}
              className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
            >
              <FilePlus size={16} />
            </button>
            <button
              onClick={saveSequence}
              title={t('automation.saveScenario')}
              className="p-2 text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"
            >
              <Save size={16} />
            </button>
            {activeId && (
              <button
                onClick={deleteActiveSequence}
                title={t('automation.deleteScenario')}
                className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-2">
        {steps.map((step, idx) => (
          <div
            key={step.id}
            className={`
              group flex items-center gap-4 p-3 rounded-xl border border-gray-800 transition-all
              ${idx === currentStepIdx ? 'bg-blue-900/10 border-blue-500/50 ring-1 ring-blue-500/20' : 'bg-gray-900/40 hover:bg-gray-900/60'}
            `}
          >
            <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-mono font-bold text-gray-500">
              {idx + 1}
            </div>

            <div className="flex items-center gap-3 min-w-[100px]">
              {step.type === 'send' && <Send size={14} className="text-emerald-500" />}
              {step.type === 'wait' && <Clock size={14} className="text-yellow-500" />}
              {step.type === 'expect' && <Eye size={14} className="text-purple-500" />}
              <span className="text-[10px] font-mono font-black uppercase text-gray-400">{step.type}</span>
            </div>

            <input
              value={step.payload}
              onChange={(e) => updateStep(step.id, e.target.value)}
              placeholder={step.type === 'wait' ? t('automation.placeholderWait') : t('automation.placeholderPattern')}
              className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
            />

            <div className="flex items-center gap-3 min-w-[100px] justify-end">
              {step.status === 'running' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />}
              {step.status === 'success' && <CheckCircle2 size={16} className="text-emerald-500" />}
              {step.status === 'fail' && (
                <div className="flex items-center gap-1.5 text-rose-500">
                  <XCircle size={16} />
                  <span className="text-[9px] font-mono">{step.result}</span>
                </div>
              )}
              <button
                onClick={() => removeStep(step.id)}
                className="p-1.5 text-gray-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 mt-4 opacity-50 hover:opacity-100 transition-all">
          <button onClick={() => addStep('send')} className="flex-1 py-3 border-2 border-dashed border-gray-800 hover:border-emerald-500/50 rounded-xl flex items-center justify-center gap-2 text-gray-600 hover:text-emerald-500 transition-all">
            <Plus size={16} />
            <span className="text-[10px] font-mono font-bold uppercase">{t('automation.addSend')}</span>
          </button>
          <button onClick={() => addStep('wait')} className="flex-1 py-3 border-2 border-dashed border-gray-800 hover:border-yellow-500/50 rounded-xl flex items-center justify-center gap-2 text-gray-600 hover:text-yellow-500 transition-all">
            <Plus size={16} />
            <span className="text-[10px] font-mono font-bold uppercase">{t('automation.addWait')}</span>
          </button>
          <button onClick={() => addStep('expect')} className="flex-1 py-3 border-2 border-dashed border-gray-800 hover:border-purple-500/50 rounded-xl flex items-center justify-center gap-2 text-gray-600 hover:text-purple-500 transition-all">
            <Plus size={16} />
            <span className="text-[10px] font-mono font-bold uppercase">{t('automation.addExpect')}</span>
          </button>
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-900/60 rounded-xl border border-gray-800 flex items-center justify-between font-mono">
        <span className="text-[9px] text-gray-500 uppercase">{t('automation.status')} <span className={isRunning ? 'text-blue-400 animate-pulse' : 'text-gray-400'}>{isRunning ? t('automation.executing') : t('automation.ready')}</span></span>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> <span className="text-[9px] text-gray-600">{t('automation.pass')} {steps.filter(s => s.status === 'success').length}</span></div>
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> <span className="text-[9px] text-gray-600">{t('automation.fail')} {steps.filter(s => s.status === 'fail').length}</span></div>
        </div>
      </div>
    </div>
  );
};

export default SequenceRunner;
