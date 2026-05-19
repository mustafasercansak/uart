import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Trash2, Clock, Zap, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../../../i18n/context';
import type { CANNode, CANFaultType } from '../../../../can/types/CANNode';
import { FAULT_LABELS } from '../../../../can/types/CANNode';

export interface CANAutoStep {
  id: string;
  timeMs: number;
  type: 'fault' | 'recover';
  nodeId: number;
  faultType?: CANFaultType;
}

interface CANAutomationTabProps {
  nodes: CANNode[];
  elapsedMs: number;
  status: 'running' | 'paused' | 'stopped';
  onInjectFault: (nodeId: number, fault: CANFaultType) => void;
  onRecoverNode: (nodeId: number) => void;
}

export function CANAutomationTab({ nodes, elapsedMs, status, onInjectFault, onRecoverNode }: CANAutomationTabProps) {
  const { t } = useTranslation();
  const [steps, setSteps] = useState<CANAutoStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [startTimeMs, setStartTimeMs] = useState(0);
  const executedSteps = useRef<Set<string>>(new Set());

  // Handle execution
  useEffect(() => {
    if (!isRunning || status !== 'running') return;
    
    const currentMs = elapsedMs - startTimeMs;
    
    steps.forEach(step => {
      if (currentMs >= step.timeMs && !executedSteps.current.has(step.id)) {
        executedSteps.current.add(step.id);
        setActiveStepId(step.id);
        
        if (step.type === 'fault' && step.faultType) {
          onInjectFault(step.nodeId, step.faultType);
        } else if (step.type === 'recover') {
          onRecoverNode(step.nodeId);
        }
      }
    });

    if (executedSteps.current.size === steps.length && steps.length > 0) {
      setTimeout(() => setIsRunning(false), 1000);
    }
  }, [elapsedMs, isRunning, status, steps, onInjectFault, onRecoverNode, startTimeMs]);

  const addStep = () => {
    if (nodes.length === 0) return;
    const newStep: CANAutoStep = {
      id: Math.random().toString(36).substring(7),
      timeMs: steps.length > 0 ? Math.max(...steps.map(s => s.timeMs)) + 5000 : 5000,
      type: 'fault',
      nodeId: nodes[0].id,
      faultType: 'noise-burst'
    };
    setSteps([...steps, newStep].sort((a, b) => a.timeMs - b.timeMs));
  };

  const updateStep = (id: string, patch: Partial<CANAutoStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s).sort((a, b) => a.timeMs - b.timeMs));
  };

  const removeStep = (id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const startSequence = () => {
    executedSteps.current.clear();
    setStartTimeMs(elapsedMs);
    setActiveStepId(null);
    setIsRunning(true);
  };

  const stopSequence = () => {
    setIsRunning(false);
    setActiveStepId(null);
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const progress = isRunning && steps.length > 0
    ? Math.min(100, Math.max(0, ((elapsedMs - startTimeMs) / Math.max(...steps.map(s => s.timeMs))) * 100))
    : 0;

  return (
    <div className="flex flex-col h-full bg-gray-950 font-mono text-[11px] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/40">
        <div>
          <h3 className="text-gray-200 font-bold uppercase tracking-widest flex items-center gap-2">
            <Clock size={14} className="text-purple-400" />
            {t('can.automation')}
          </h3>
          <p className="text-gray-500 text-[9px] mt-0.5">{t('can.automationDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button onClick={stopSequence} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/40 text-rose-400 border border-rose-800/60 hover:bg-rose-900/60 rounded font-bold transition-all">
              <Square size={12} className="fill-current" />
              {t('common.stop')}
            </button>
          ) : (
            <button onClick={startSequence} disabled={steps.length === 0 || status !== 'running'} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/40 text-purple-400 border border-purple-800/60 hover:bg-purple-900/60 rounded font-bold disabled:opacity-30 transition-all">
              <Play size={12} className="fill-current" />
              {t('common.start')}
            </button>
          )}
          <button onClick={addStep} disabled={isRunning} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 rounded transition-all ml-4">
            <Plus size={12} />
            {t('common.add')}
          </button>
        </div>
      </div>

      {isRunning && (
        <div className="h-1 bg-gray-900 relative">
          <div className="absolute top-0 left-0 h-full bg-purple-500 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <Clock size={24} className="text-gray-700" />
            <span>{t('can.noAutomationSteps')}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* eslint-disable react-hooks/refs */}
            {steps.map((step) => {
              const isActive = activeStepId === step.id;
              const isExecuted = executedSteps.current.has(step.id);
              
              return (
                <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isActive ? 'bg-purple-900/20 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' :
                  isExecuted ? 'bg-gray-900/30 border-gray-800/50 opacity-60' :
                  'bg-gray-900/50 border-gray-800'
                }`}>
                  <div className="text-gray-500 font-bold tabular-nums w-12 shrink-0">
                    {formatTime(step.timeMs)}
                  </div>
                  
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <select
                      value={step.type}
                      onChange={e => updateStep(step.id, { type: e.target.value as CANAutoStep['type'] })}
                      disabled={isRunning}
                      className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300 outline-none focus:border-purple-500"
                    >
                      <option value="fault">{t('can.injectFault')}</option>
                      <option value="recover">{t('can.recoverNode')}</option>
                    </select>

                    <select
                      value={step.nodeId}
                      onChange={e => updateStep(step.id, { nodeId: Number(e.target.value) })}
                      disabled={isRunning}
                      className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300 outline-none focus:border-purple-500"
                    >
                      {nodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>

                    {step.type === 'fault' ? (
                      <select
                        value={step.faultType}
                        onChange={e => updateStep(step.id, { faultType: e.target.value as CANFaultType })}
                        disabled={isRunning}
                        className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-rose-400 outline-none focus:border-rose-500"
                      >
                        {Object.entries(FAULT_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{t(v)}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="bg-emerald-950/30 border border-emerald-900/50 rounded px-2 py-1 text-emerald-500 flex items-center gap-1">
                        <ShieldCheck size={12} /> {t('can.normalOperation')}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => removeStep(step.id)}
                    disabled={isRunning}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            {/* eslint-enable react-hooks/refs */}
          </div>
        )}
      </div>
    </div>
  );
}
