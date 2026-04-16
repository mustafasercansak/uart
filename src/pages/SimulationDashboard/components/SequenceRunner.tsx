import React, { useState, useCallback, useEffect } from 'react';
import { Play, Square, Plus, Trash2, CheckCircle2, XCircle, Clock, Send, Eye } from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';

interface SequenceStep {
  id: string;
  type: 'send' | 'wait' | 'expect';
  payload: string;
  status: 'idle' | 'running' | 'success' | 'fail';
  result?: string;
}

const SequenceRunner: React.FC = () => {
  const { state, start, injectError, overrideField } = useSimulation();
  const [steps, setSteps] = useState<SequenceStep[]>([
    { id: '1', type: 'send', payload: '55 AA 01 02 03', status: 'idle' },
    { id: '2', type: 'wait', payload: '500', status: 'idle' },
    { id: '3', type: 'expect', payload: '55 AA', status: 'idle' },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState<number | null>(null);

  const addStep = (type: SequenceStep['type']) => {
    const newStep: SequenceStep = {
      id: Math.random().toString(36).substr(2, 9),
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

  const runSequence = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setCurrentStepIdx(0);
    
    const newSteps = steps.map(s => ({ ...s, status: 'idle' as const }));
    setSteps(newSteps);

    for (let i = 0; i < steps.length; i++) {
      setCurrentStepIdx(i);
      setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'running' } : s));
      
      const step = steps[i];
      try {
        if (step.type === 'send') {
          // In a real app, we'd send raw bytes to the backend
          console.log('Sending:', step.payload);
          // Simulate some time
          await new Promise(r => setTimeout(r, 100));
        } else if (step.type === 'wait') {
          await new Promise(r => setTimeout(r, parseInt(step.payload) || 1000));
        } else if (step.type === 'expect') {
          // Wait for match in conversationLogs (simplified)
          let matched = false;
          for (let attempt = 0; attempt < 20; attempt++) {
            const lastLog = state.conversationLogs[0];
            if (lastLog?.rawHex.includes(step.payload)) {
              matched = true;
              break;
            }
            await new Promise(r => setTimeout(r, 100));
          }
          if (!matched) throw new Error('Timeout waiting for pattern');
        }
        
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'success' } : s));
      } catch (err: any) {
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'fail', result: err.message } : s));
        setIsRunning(false);
        return;
      }
    }
    
    setIsRunning(false);
    setCurrentStepIdx(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-950/40 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono font-black text-blue-400 uppercase tracking-widest">Automation Lab</span>
          <span className="text-xs text-gray-500 font-mono">Sequence Runner & Protocol Validation</span>
        </div>
        
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button 
              onClick={runSequence}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"
            >
              <Play size={14} fill="currentColor" />
              RUN SEQUENCE
            </button>
          ) : (
            <button 
              onClick={() => setIsRunning(false)}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-900/20 transition-all"
            >
              <Square size={14} fill="currentColor" />
              STOP
            </button>
          )}
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
              placeholder={step.type === 'wait' ? 'ms' : 'Hex pattern...'}
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
             <span className="text-[10px] font-mono font-bold uppercase">Add Send Step</span>
           </button>
           <button onClick={() => addStep('wait')} className="flex-1 py-3 border-2 border-dashed border-gray-800 hover:border-yellow-500/50 rounded-xl flex items-center justify-center gap-2 text-gray-600 hover:text-yellow-500 transition-all">
             <Plus size={16} />
             <span className="text-[10px] font-mono font-bold uppercase">Add Wait Step</span>
           </button>
           <button onClick={() => addStep('expect')} className="flex-1 py-3 border-2 border-dashed border-gray-800 hover:border-purple-500/50 rounded-xl flex items-center justify-center gap-2 text-gray-600 hover:text-purple-500 transition-all">
             <Plus size={16} />
             <span className="text-[10px] font-mono font-bold uppercase">Add Expect Step</span>
           </button>
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-900/60 rounded-xl border border-gray-800 flex items-center justify-between">
        <span className="text-[9px] font-mono text-gray-500 uppercase">Sequence Status: <span className={isRunning ? 'text-blue-400 animate-pulse' : 'text-gray-400'}>{isRunning ? 'EXECUTING TEST CASE' : 'READY'}</span></span>
        <div className="flex gap-4">
           <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> <span className="text-[9px] font-mono text-gray-600">PASS: {steps.filter(s => s.status === 'success').length}</span></div>
           <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> <span className="text-[9px] font-mono text-gray-600">FAIL: {steps.filter(s => s.status === 'fail').length}</span></div>
        </div>
      </div>
    </div>
  );
};

export default SequenceRunner;
