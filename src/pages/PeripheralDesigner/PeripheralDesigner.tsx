import React, { useState } from 'react';
import { usePeripheralStore } from '../../store/usePeripheralStore';
import { useTranslation } from '../../i18n/context';
import { Play, Save, Trash2, Plus, Code, Zap, Info } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PeripheralDesigner() {
  const { t } = useTranslation();
  const { 
    peripherals, 
    activePeripheralId, 
    addPeripheral, 
    updatePeripheral, 
    deletePeripheral,
    setActivePeripheral
  } = usePeripheralStore();

  const activePeripheral = peripherals.find(p => p.id === activePeripheralId);
  const [isEditing, setIsEditing] = useState(false);

  const handleCreate = () => {
    addPeripheral({
      name: t('designer.newDevice'),
      protocol: 'UART',
      script: t('designer.exampleScript'),
      initialState: { value: 0 }
    });
  };

  return (
    <div className="flex h-full bg-gray-950 text-gray-200 font-mono overflow-hidden">
      {/* Sidebar - Peripheral List */}
      <div className="w-64 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <span className="text-xs font-bold tracking-tighter text-gray-500 uppercase">{t('designer.peripherals')}</span>
          <button 
            onClick={handleCreate}
            className="p-1 hover:bg-green-900/20 text-green-400 rounded-md transition-colors border border-green-800/30"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {peripherals.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePeripheral(p.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                activePeripheralId === p.id 
                  ? 'bg-green-900/20 text-green-400 border border-green-800/40' 
                  : 'hover:bg-gray-900 text-gray-500'
              }`}
            >
              <Zap size={14} className={p.isActive ? 'text-amber-400' : 'text-gray-700'} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {peripherals.length === 0 && (
            <div className="p-4 text-center text-xs text-gray-700">{t('designer.noDevices')}</div>
          )}
        </div>
      </div>

      {/* Main Content - Code Editor */}
      {activePeripheral ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/20">
            <div className="flex items-center gap-4">
              <input 
                value={activePeripheral.name}
                onChange={e => updatePeripheral(activePeripheral.id, { name: e.target.value })}
                className="bg-transparent border-none outline-none font-bold text-lg text-white"
              />
              <span className="px-2 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400 uppercase tracking-widest border border-gray-700">
                {activePeripheral.protocol}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => deletePeripheral(activePeripheral.id)}
                className="p-2 hover:bg-red-900/20 text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-800/30"
                title={t('designer.deleteDevice')}
              >
                <Trash2 size={18} />
              </button>
              <button 
                className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-500 text-black font-bold rounded-lg transition-all"
                title={t('designer.deploy')}
              >
                <Save size={16} />
                <span className="text-sm">{t('designer.deploy')}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Editor */}
            <div className="flex-1 flex flex-col border-r border-gray-800 relative group">
              <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/40 flex items-center gap-2">
                <Code size={14} className="text-blue-400" />
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">peripheral_logic.js</span>
              </div>
              <textarea
                value={activePeripheral.script}
                onChange={e => updatePeripheral(activePeripheral.id, { script: e.target.value })}
                spellCheck={false}
                className="flex-1 bg-gray-950 p-4 font-mono text-sm leading-relaxed text-blue-100 outline-none resize-none selection:bg-blue-500/30"
              />
              {/* Floating Instructions */}
              <div className="absolute bottom-4 right-4 max-w-xs p-4 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="flex items-center gap-2 mb-2 text-blue-400">
                  <span className="text-[10px] font-bold uppercase">{t('designer.helperApi')}</span>
                </div>
                <ul className="text-[10px] space-y-1.5 text-gray-400">
                  <li><code className="text-blue-300">input</code>: Array of incoming bytes</li>
                  <li><code className="text-blue-300">state</code>: Persistent object for this device</li>
                  <li><code className="text-blue-300">send(bytes)</code>: Send data back to master</li>
                  <li><code className="text-blue-300">console.log(msg)</code>: Log to the debugger</li>
                </ul>
              </div>
            </div>

            {/* Debugger / State Panel */}
            <div className="w-80 flex flex-col bg-gray-950 overflow-hidden">
              <div className="p-4 border-b border-gray-800 h-1/2 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('designer.deviceState')}</span>
                  <button className="text-[9px] text-gray-700 hover:text-gray-500 uppercase">{t('designer.reset')}</button>
                </div>
                <div className="flex-1 bg-gray-900/30 rounded-lg border border-gray-800 p-2 overflow-y-auto text-[11px] text-green-500/80">
                  <pre>{JSON.stringify(activePeripheral.initialState, null, 2)}</pre>
                </div>
              </div>
              <div className="p-4 border-t border-gray-800 h-1/2 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('designer.debugConsole')}</span>
                  <Play size={10} className="text-green-500 animate-pulse" />
                </div>
                <div className="flex-1 bg-black/40 rounded-lg border border-gray-800 p-2 overflow-y-auto font-mono text-[11px] text-gray-400">
                  {activePeripheral.lastExecution ? (
                    <div className="space-y-2">
                      <div className="text-[9px] text-gray-600">{t('designer.lastExec')}: {new Date(activePeripheral.lastExecution.timestamp).toLocaleTimeString()}</div>
                      <div className="text-blue-400">IN: {activePeripheral.lastExecution.input.join(' ')}</div>
                      <div className="text-amber-400">OUT: {activePeripheral.lastExecution.output.join(' ')}</div>
                      <div className="whitespace-pre-wrap">{activePeripheral.lastExecution.log}</div>
                    </div>
                  ) : (
                    <div className="text-gray-700 italic">{t('designer.noActivity')}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-800 flex-col gap-4">
          <Zap size={48} className="opacity-10" />
          <p className="text-sm font-bold uppercase tracking-[0.2em]">{t('designer.title')}</p>
        </div>
      )}
    </div>
  );
}
