import React, { useState } from 'react';
import { ShieldCheck, Target, User, Cpu, Play, X, Plus, Trash2 } from 'lucide-react';
import type { FrameProfile, ValidationTarget } from '../../../types';
import { v4 as uuidv4 } from 'uuid';

interface ValidationControlsProps {
  profile: FrameProfile | null;
  onStart: (config: { name: string; deviceId: string; operator: string; targets: ValidationTarget[] }) => void;
  onClose: () => void;
}

export default function ValidationControls({ profile, onStart, onClose }: ValidationControlsProps) {
  const [name, setName] = useState('Standart Uyumluluk Testi');
  const [deviceId, setDeviceId] = useState(`MN-${Math.floor(Math.random() * 10000)}`);
  const [operator, setOperator] = useState('Mustafa Sercan Sak');
  
  const [targets, setTargets] = useState<ValidationTarget[]>(() => {
    // Default targets from profile waveforms/ranges
    return (profile?.fields || [])
      .filter(f => f.type === 'waveform' || f.type === 'range')
      .map(f => ({
        id: uuidv4(),
        fieldName: f.name,
        expectedMin: f.type === 'range' ? (f.typeConfig as any).min : 0,
        expectedMax: f.type === 'range' ? (f.typeConfig as any).max : 4095,
        unit: (f as any).widgetConfig?.unit || ''
      }));
  });

  const addTarget = () => {
    setTargets([...targets, { 
        id: uuidv4(), 
        fieldName: '', 
        expectedMin: 0, 
        expectedMax: 100, 
        unit: '' 
    }]);
  };

  const removeTarget = (id: string) => {
    setTargets(targets.filter(t => t.id !== id));
  };

  const updateTarget = (id: string, updates: Partial<ValidationTarget>) => {
    setTargets(targets.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-2xl bg-gray-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-emerald-950/20 to-transparent flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-500">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Validasyon Oturumu Başlat</h2>
              <p className="text-xs text-emerald-500/60 font-mono font-bold uppercase tracking-widest mt-0.5">Medical Compliance Mode v7.0</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          
          {/* Section: Metadata */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Target size={12} /> Test Adı
              </label>
              <input 
                value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-emerald-500/50 outline-none transition-all"
                placeholder="Örn: EKG Kararlılık Testi"
              />
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Cpu size={12} /> Cihaz ID / Seri No
              </label>
              <input 
                value={deviceId} onChange={e => setDeviceId(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-emerald-500/50 outline-none transition-all"
                placeholder="Örn: MN-9920"
              />
            </div>
            <div className="space-y-4 col-span-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <User size={12} /> Operatör / Mühendis
              </label>
              <input 
                value={operator} onChange={e => setOperator(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-emerald-500/50 outline-none transition-all"
              />
            </div>
          </div>

          <div className="h-px bg-white/5" />

          {/* Section: Targets */}
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Uyumluluk Kriterleri (Targets)</h3>
              <button 
                onClick={addTarget}
                className="text-[10px] font-black text-emerald-500 uppercase flex items-center gap-2 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg transition-all"
              >
                <Plus size={12} /> Kriter Ekle
              </button>
            </div>

            <div className="space-y-3">
              {targets.map((target, idx) => (
                <div key={target.id} className="flex gap-3 bg-black/40 border border-white/5 p-4 rounded-2xl items-end group animate-in slide-in-from-right-4 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                  <div className="flex-1 space-y-2">
                    <label className="text-[9px] font-bold text-gray-600 uppercase">Alan Adı (UART Field)</label>
                    <select 
                      value={target.fieldName} 
                      onChange={e => updateTarget(target.id, { fieldName: e.target.value })}
                      className="w-full bg-gray-800 border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="">Seçiniz...</option>
                      {profile?.fields.map(f => (
                        <option key={f.id} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24 space-y-2">
                    <label className="text-[9px] font-bold text-gray-600 uppercase">Min</label>
                    <input 
                      type="number" value={target.expectedMin}
                      onChange={e => updateTarget(target.id, { expectedMin: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-white/5 rounded-lg px-3 py-2 text-xs text-emerald-400 outline-none"
                    />
                  </div>
                  <div className="w-24 space-y-2">
                    <label className="text-[9px] font-bold text-gray-600 uppercase">Max</label>
                    <input 
                      type="number" value={target.expectedMax}
                      onChange={e => updateTarget(target.id, { expectedMax: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-white/5 rounded-lg px-3 py-2 text-xs text-emerald-400 outline-none"
                    />
                  </div>
                  <div className="w-16 space-y-2">
                    <label className="text-[9px] font-bold text-gray-600 uppercase">Birim</label>
                    <input 
                      value={target.unit}
                      onChange={e => updateTarget(target.id, { unit: e.target.value })}
                      className="w-full bg-gray-800 border border-white/5 rounded-lg px-3 py-2 text-xs text-gray-400 outline-none"
                      placeholder="bpm"
                    />
                  </div>
                  <button 
                    onClick={() => removeTarget(target.id)}
                    className="p-2.5 text-rose-500/50 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {targets.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-3xl">
                  <p className="text-xs text-gray-600 font-bold uppercase tracking-widest">Kriter belirlenmedi. Lütfen bir kriter ekleyin.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-white/5 bg-black/20 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-4 rounded-2xl text-xs font-black text-gray-500 uppercase tracking-widest hover:bg-white/5 transition-all"
          >
            İptal
          </button>
          <button 
            disabled={targets.length === 0 || !profile}
            onClick={() => onStart({ name, deviceId, operator, targets })}
            className="flex-[2] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:grayscale text-white rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3 transition-all transform active:scale-95"
          >
            <Play size={16} fill="currentColor" />
            Oturumu Başlat
          </button>
        </div>
      </div>
    </div>
  );
}
