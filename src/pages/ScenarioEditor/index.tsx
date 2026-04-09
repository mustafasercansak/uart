import { useState, useMemo, useEffect } from 'react';
import { useSimulation } from '../../hooks/useSimulation';
import { Scenario, ScenarioStep, ActionType, ActionConfig, FrameProfile } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { loadScenarios, saveScenario as persistScenario, deleteScenario as persistDelete, loadProfiles } from '../../store/storage';

const SCENARIO_CATEGORY_COLORS: Record<string, string> = {
  custom: '#6b7280',
  test: '#3b82f6',
  production: '#10b981',
  error_injection: '#ef4444',
  physiological: '#ec4899',
  error: '#ef4444',
  stress: '#f59e0b',
  protocol: '#8b5cf6',
  combined: '#06b6d4',
};

const SCENARIO_CATEGORY_LABELS: Record<string, string> = {
  custom: 'Özel',
  physiological: 'Fizyolojik',
  error: 'Hata',
  stress: 'Stres',
  protocol: 'Protokol',
  combined: 'Karma',
};

const PRESET_SCENARIOS: Partial<Scenario>[] = [
  {
    name: 'Normal Başlatma',
    description: 'Sensörün normal çalışma düzenine geçiş senaryosu',
    category: 'custom',
    durationMs: 10000,
    loop: false,
    steps: [
      { id: '1', atMs: 0, target: 'field:SpO2', action: 'set', actionConfig: { value: 98 } as any },
      { id: '2', atMs: 500, target: 'field:BPM', action: 'set', actionConfig: { value: 75 } as any },
    ],
  },
];

export default function ScenarioEditor() {
  const { state } = useSimulation();
  
  // Data State
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [profiles, setProfiles] = useState<FrameProfile[]>([]);
  
  // UI State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  // Load Initial Data
  useEffect(() => {
    setScenarios(loadScenarios());
    setProfiles(loadProfiles());
  }, []);

  const scenario = useMemo(() => scenarios.find((s) => s.id === selectedId) || null, [scenarios, selectedId]);
  
  const exportScenario = (s: Scenario) => {
    const data = JSON.stringify(s, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario_${s.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importScenario = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as Scenario;
        // Assign new ID to avoid collisions but keep name
        const now = new Date().toISOString();
        const newScenario: Scenario = {
          ...imported,
          id: uuidv4(),
          createdAt: now,
          updatedAt: now,
        };
        const newScenarios = [...scenarios, newScenario];
        setScenarios(newScenarios);
        persistScenario(newScenario);
        setSelectedId(newScenario.id);
      } catch (err) {
        alert('Geçersiz senaryo dosyası!');
      }
    };
    reader.readAsText(file);
    // Clear input
    e.target.value = '';
  };

  const sortedSteps = useMemo(() => {
    if (!scenario || !scenario.steps) return [];
    return [...scenario.steps].sort((a, b) => a.atMs - b.atMs);
  }, [scenario]);

  const updateScenario = (patch: Partial<Scenario>) => {
    if (!selectedId || !scenario) return;
    const updated = { ...scenario, ...patch, updatedAt: new Date().toISOString() };
    const newScenarios = scenarios.map(s => s.id === selectedId ? updated : s);
    setScenarios(newScenarios);
    persistScenario(updated);
  };

  const createNew = () => {
    const now = new Date().toISOString();
    const newScenario: Scenario = {
      id: uuidv4(),
      name: 'Yeni Senaryo',
      description: '',
      category: 'custom',
      durationMs: 10000,
      profileId: state.profileId || '',
      loop: false,
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    const newScenarios = [...scenarios, newScenario];
    setScenarios(newScenarios);
    persistScenario(newScenario);
    setSelectedId(newScenario.id);
  };

  const remove = (id: string) => {
    if (confirm('Bu senaryoyu silmek istediğinize emin misiniz?')) {
      const newScenarios = scenarios.filter(s => s.id !== id);
      setScenarios(newScenarios);
      persistDelete(id);
      if (selectedId === id) setSelectedId(null);
    }
  };

  const addStep = () => {
    if (!scenario) return;
    const newStep: ScenarioStep = {
      id: uuidv4(),
      atMs: sortedSteps.length > 0 ? sortedSteps[sortedSteps.length - 1].atMs + 500 : 0,
      target: 'field:SpO2',
      action: 'set',
      actionConfig: { value: 95 } as any,
    };
    updateScenario({ steps: [...scenario.steps, newStep] });
    setSelectedStepId(newStep.id);
  };

  const updateStep = (updatedStep: ScenarioStep) => {
    if (!scenario) return;
    updateScenario({
      steps: scenario.steps.map((s) => (s.id === updatedStep.id ? updatedStep : s)),
    });
  };

  const removeStep = (stepId: string) => {
    if (!scenario) return;
    updateScenario({
      steps: scenario.steps.filter((s) => s.id !== stepId),
    });
    if (selectedStepId === stepId) setSelectedStepId(null);
  };

  const clonePreset = (preset: Partial<Scenario>) => {
    const now = new Date().toISOString();
    const id = uuidv4();
    const newScenario: Scenario = {
      ...preset,
      id,
      name: `${preset.name} (Kopya)`,
      profileId: state.profileId || '',
      loop: preset.loop || false,
      description: preset.description || '',
      category: (preset.category as any) || 'custom',
      steps: (preset.steps || []).map(s => ({ ...s, id: uuidv4() })),
      createdAt: now,
      updatedAt: now,
    } as Scenario;
    const newScenarios = [...scenarios, newScenario];
    setScenarios(newScenarios);
    persistScenario(newScenario);
    setSelectedId(id);
    setShowPresets(false);
  };

  const activeStep = scenario ? scenario.steps.find(s => s.id === selectedStepId) : null;

  return (
    <div className="flex h-full relative overflow-hidden bg-gray-950">
      {/* Sidebar List (Fixed) */}
      <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/40 whitespace-nowrap">
          <span className="text-gray-400 text-xs font-mono uppercase tracking-widest font-bold">Senaryolar</span>
          <div className="flex gap-1 items-center">
            <label className="text-gray-500 hover:text-blue-400 p-1.5 rounded-lg hover:bg-gray-800 transition-all cursor-pointer font-bold" title="Dosyadan Yükle">
              📂
              <input type="file" className="hidden" accept=".json" onChange={importScenario} />
            </label>
            <button onClick={() => setShowPresets(true)} className="text-gray-500 hover:text-green-400 p-1.5 rounded-lg hover:bg-gray-800 transition-all font-bold" title="Şablonlar">★</button>
            <button onClick={createNew} className="text-green-500 hover:text-green-400 p-1.5 rounded-lg hover:bg-green-900/20 transition-all text-lg" title="Yeni Senaryo">+</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {scenarios.map((s) => (
            <div key={s.id} onClick={() => setSelectedId(s.id)}
              className={`group flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all border ${selectedId === s.id ? 'bg-green-900/10 border-green-800/40 text-green-400' : 'text-gray-500 hover:bg-gray-800/50 hover:text-gray-300 border-transparent'}`}>
              <div className="truncate flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: SCENARIO_CATEGORY_COLORS[s.category ?? 'custom'] }} />
                  <span className="truncate font-mono text-xs">{s.name}</span>
                </div>
                <div className="text-[10px] opacity-40 mt-1 ml-3.5 italic">{s.steps.length} adım</div>
              </div>
              {selectedId === s.id && (
                <button 
                  onClick={(e) => { e.stopPropagation(); exportScenario(s); }}
                  className="p-2 text-gray-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Senaryoyu İndir"
                >
                  📥
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent">
        {!scenario ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-700 space-y-4">
            <div className="text-7xl opacity-5">⏱</div>
            <div className="font-mono text-xs uppercase tracking-[0.4em] opacity-40">Senaryo Seçimi Bekleniyor</div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header / Meta */}
            <div className="p-5 border-b border-gray-800 bg-gray-950/20 flex items-center justify-between">
              <div className="flex-1 max-w-xl">
                <input value={scenario.name} onChange={(e) => updateScenario({ name: e.target.value })}
                  className="bg-transparent text-gray-100 text-lg font-mono font-bold focus:outline-none w-full border-b border-transparent hover:border-gray-800 focus:border-green-800 transition-all" placeholder="Senaryo Başlığı..." />
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] text-gray-600 font-mono uppercase font-bold">Kategori</span>
                    <select value={scenario.category || 'custom'} onChange={(e) => updateScenario({ category: e.target.value as any })}
                      className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1 text-[10px] font-mono text-gray-400 outline-none hover:border-gray-700 transition-colors">
                      {Object.entries(SCENARIO_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] text-gray-600 font-mono uppercase font-bold">Max Süre</span>
                    <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1">
                      <input type="number" step={100} value={scenario.durationMs || 10000} onChange={(e) => updateScenario({ durationMs: Number(e.target.value) })}
                        className="bg-transparent text-[10px] font-mono text-green-500 w-16 outline-none text-right" />
                      <span className="text-[9px] text-gray-600 font-mono uppercase">ms</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2.5">
                <button onClick={() => remove(scenario.id)} className="px-3.5 py-2 bg-red-900/10 text-red-500/70 hover:text-red-400 rounded-xl text-[10px] font-mono uppercase border border-red-900/20 transition-all">Senaryoyu Sil</button>
                <div className="px-6 py-2 bg-green-900/30 text-green-400 rounded-xl text-[11px] font-mono uppercase font-bold border border-green-800/40">Kayıtlı</div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* Step List */}
              <div className="flex-1 flex flex-col min-h-0 border-r border-gray-800/40">
                <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between bg-gray-950/30">
                  <span className="text-gray-500 text-[10px] font-mono uppercase tracking-widest font-bold">Olay Akışı ({sortedSteps.length})</span>
                  <button onClick={addStep} className="text-green-400 hover:text-green-300 text-[10px] font-mono font-bold tracking-widest bg-green-900/20 px-3 py-1 rounded-full border border-green-800/30 transition-all hover:scale-105active:scale-95">+ ADIM EKLE</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {sortedSteps.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-gray-500 font-mono text-center">
                      <div className="text-4xl mb-4">⊙</div>
                      <div className="text-xs italic">İlk adımı sağ üstten ekleyerek başlayın.</div>
                    </div>
                  ) : (
                    sortedSteps.map((step) => (
                      <div key={step.id} onClick={() => setSelectedStepId(step.id === selectedStepId ? null : step.id)}
                        className={`group flex items-center gap-5 px-5 py-4 rounded-2xl border cursor-pointer transition-all ${selectedStepId === step.id ? 'bg-green-500/10 border-green-500/40 shadow-xl' : 'bg-gray-800/10 border-gray-800/40 hover:border-gray-700'}`}>
                        <div className="w-16 font-mono text-xs text-gray-500 tabular-nums">{step.atMs}ms</div>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getActionColor(step.action) }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono font-bold text-gray-200 truncate uppercase tracking-tight">{step.target.replace(/field:/g, '').replace(/bit:/g, '')}</div>
                          <div className="text-[10px] font-mono text-gray-600 mt-1 uppercase tracking-tighter">{step.action} {step.description && <span className="italic opacity-60 ml-3">{step.description}</span>}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} className="text-gray-700 hover:text-red-500 text-xl opacity-0 group-hover:opacity-100 transition-opacity p-1">×</button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Step Editor Panel */}
              {selectedStepId && (
                <div className="w-96 bg-gray-950 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
                  <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/60">
                    <h3 className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-widest">Parametreler</h3>
                    <button onClick={() => setSelectedStepId(null)} className="text-gray-500 hover:text-white text-xl p-1">×</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    {activeStep ? (
                      <StepEditor 
                        step={activeStep} 
                        onChange={updateStep} 
                        profile={profiles.find(f => f.id === scenario.profileId) || null} 
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-700 text-[10px] italic font-mono uppercase">Veri Bekleniyor</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Preset Modal */}
      {showPresets && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] backdrop-blur-md" onClick={() => setShowPresets(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-green-400 font-mono font-bold text-base tracking-widest uppercase">Kütüphane Şablonları</h2>
              <button onClick={() => setShowPresets(false)} className="text-gray-500 hover:text-white text-2xl">×</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PRESET_SCENARIOS.map((p, idx) => (
                <div key={idx} onClick={() => clonePreset(p)} className="bg-gray-800/30 border border-gray-800 p-6 rounded-2xl cursor-pointer hover:border-green-600/50 hover:bg-green-900/5 transition-all group">
                  <div className="text-gray-100 text-sm font-bold mb-2 group-hover:text-green-400 transition-colors">{p.name}</div>
                  <div className="text-gray-500 text-[11px] leading-relaxed line-clamp-2 font-mono h-10">{p.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ACTION_CONFIGS: Record<ActionType, { label: string; fields: Array<{ key: string; label: string; type: string }> }> = {
  set: { label: 'Değer Ata', fields: [{ key: 'value', label: 'Değer', type: 'number' }] },
  range: { label: 'Aralık Değiştir', fields: [{ key: 'min', label: 'Min', type: 'number' }, { key: 'max', label: 'Max', type: 'number' }] },
  ramp: { label: 'Ramp Geçişi', fields: [{ key: 'from', label: 'Başlangıç', type: 'number' }, { key: 'to', label: 'Bitiş', type: 'number' }, { key: 'durationMs', label: 'Süre (ms)', type: 'number' }] },
  toggle: { label: 'Bit Çevir', fields: [] },
  pulse: { label: 'Geçici Değer', fields: [{ key: 'value', label: 'Değer', type: 'number' }, { key: 'durationMs', label: 'Süre (ms)', type: 'number' }] },
  inject_error: { label: 'Hata Enjekte Et', fields: [{ key: 'count', label: 'Sayı', type: 'number' }] },
};

function getActionColor(action: ActionType): string {
  const colors: Record<ActionType, string> = {
    set: '#10b981',
    range: '#3b82f6',
    ramp: '#8b5cf6',
    toggle: '#f59e0b',
    pulse: '#f97316',
    inject_error: '#ef4444',
  };
  return colors[action] ?? '#6b7280';
}

function StepEditor({ step, profile, onChange }: { step: ScenarioStep; profile: any | null; onChange: (s: ScenarioStep) => void }) {
  if (!step) return null;

  const update = (patch: Partial<ScenarioStep>) => onChange({ ...step, ...patch });
  const updateConfig = (key: string, value: any) =>
    onChange({ ...step, actionConfig: { ...(step.actionConfig as Record<string, unknown>), [key]: value === '' ? 0 : (isNaN(Number(value)) ? value : Number(value)) } as ActionConfig });

  const actionCfg = ACTION_CONFIGS[step.action] || { label: 'Bilinmeyen', fields: [] };
  const inputCls = 'bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs font-mono text-gray-300 outline-none focus:border-green-600/40 w-full transition-all hover:border-gray-700';

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] text-gray-600 font-mono uppercase tracking-widest font-bold">Zaman (ms)</label>
        <input type="number" min={0} className={inputCls} value={step.atMs} onChange={(e) => update({ atMs: Number(e.target.value) })} />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-gray-600 font-mono uppercase tracking-widest font-bold">Hedef (Field/Bit)</label>
        <input className={inputCls} value={step.target} onChange={(e) => update({ target: e.target.value })} placeholder="örn: field:SpO2" />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-gray-600 font-mono uppercase tracking-widest font-bold">İşlem</label>
        <select className={inputCls} value={step.action} onChange={(e) => update({ action: e.target.value as ActionType, actionConfig: {} })}>
          {Object.entries(ACTION_CONFIGS).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
        </select>
      </div>

      {actionCfg.fields.map((f) => (
        <div key={f.key} className="space-y-2">
          <label className="text-[10px] text-gray-600 font-mono uppercase tracking-widest font-bold">{f.label}</label>
          <input type={f.type} className={inputCls}
            value={(step.actionConfig as Record<string, any>)[f.key] ?? ''}
            onChange={(e) => updateConfig(f.key, e.target.value)}
          />
        </div>
      ))}

      {step.action === 'inject_error' && (
        <div className="space-y-2">
          <label className="text-[10px] text-gray-600 font-mono uppercase tracking-widest font-bold">Hata Tipi</label>
          <select className={inputCls}
            value={(step.actionConfig as any).errorType ?? 'corrupt_checksum'}
            onChange={(e) => onChange({ ...step, actionConfig: { ...(step.actionConfig as Record<string, unknown>), errorType: e.target.value } as ActionConfig })}>
            <option value="corrupt_checksum">Checksum Hatası</option>
            <option value="skip_bytes">Sinyal Kaybı</option>
            <option value="wrong_sync">Sync Hatası</option>
          </select>
        </div>
      )}

      <div className="space-y-2 pt-6 border-t border-gray-800/60">
        <label className="text-[10px] text-gray-600 font-mono uppercase tracking-widest font-bold">Açıklama</label>
        <textarea className={`${inputCls} min-h-[100px] text-gray-500 italic`} value={step.description ?? ''} onChange={(e) => update({ description: e.target.value })} placeholder="Notlar..." />
      </div>
    </div>
  );
}
