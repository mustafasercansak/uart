import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Scenario,
  ScenarioStep,
  ActionType,
  ActionConfig,
  ScenarioCategory,
  FrameProfile,
  ErrorType,
} from '../../types';
import { loadScenarios, saveScenario, deleteScenario, exportAsJson, importFromJson } from '../../store/storage';
import { loadProfiles } from '../../store/storage';
import { PRESET_SCENARIOS, SCENARIO_CATEGORY_LABELS, SCENARIO_CATEGORY_COLORS } from '../../data/presets';

function newScenario(profileId: string): Scenario {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    name: 'Yeni Senaryo',
    description: '',
    profileId,
    loop: false,
    durationMs: 10000,
    category: 'custom',
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

function newStep(atMs: number): ScenarioStep {
  return {
    id: uuidv4(),
    atMs,
    target: 'field:',
    action: 'set',
    actionConfig: { value: 0 },
    description: '',
  };
}

export default function ScenarioEditor() {
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios());
  const [profiles] = useState<FrameProfile[]>(() => loadProfiles());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('list');
  const [showPresets, setShowPresets] = useState(false);

  const openScenario = (s: Scenario) => {
    setScenario(JSON.parse(JSON.stringify(s)));
    setSelectedId(s.id);
    setSelectedStepId(null);
  };

  const createNew = () => {
    const profileId = profiles[0]?.id ?? '';
    const s = newScenario(profileId);
    setScenario(s);
    setSelectedId(s.id);
    setSelectedStepId(null);
  };

  const save = () => {
    if (!scenario) return;
    const updated = { ...scenario, updatedAt: new Date().toISOString() };
    saveScenario(updated);
    setScenarios(loadScenarios());
    setScenario(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const remove = (id: string) => {
    deleteScenario(id);
    setScenarios(loadScenarios());
    if (selectedId === id) { setScenario(null); setSelectedId(null); }
  };

  const duplicate = () => {
    if (!scenario) return;
    const now = new Date().toISOString();
    const dup: Scenario = { ...scenario, id: uuidv4(), name: `${scenario.name} (Kopya)`, createdAt: now, updatedAt: now };
    saveScenario(dup);
    setScenarios(loadScenarios());
    openScenario(dup);
  };

  const clonePreset = (preset: typeof PRESET_SCENARIOS[0]) => {
    const profileId = profiles[0]?.id ?? '';
    const now = new Date().toISOString();
    const s: Scenario = {
      ...preset,
      id: uuidv4(),
      profileId,
      steps: preset.steps.map((step) => ({ ...step, id: uuidv4() })),
      createdAt: now,
      updatedAt: now,
    };
    saveScenario(s);
    setScenarios(loadScenarios());
    openScenario(s);
    setShowPresets(false);
  };

  const addStep = () => {
    if (!scenario) return;
    const lastMs = scenario.steps.length > 0 ? Math.max(...scenario.steps.map((s) => s.atMs)) + 1000 : 0;
    const step = newStep(lastMs);
    setScenario({ ...scenario, steps: [...scenario.steps, step] });
    setSelectedStepId(step.id);
  };

  const removeStep = (id: string) => {
    if (!scenario) return;
    setScenario({ ...scenario, steps: scenario.steps.filter((s) => s.id !== id) });
    if (selectedStepId === id) setSelectedStepId(null);
  };

  const updateStep = (updated: ScenarioStep) => {
    if (!scenario) return;
    setScenario({ ...scenario, steps: scenario.steps.map((s) => s.id === updated.id ? updated : s) });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importFromJson<Scenario>(file);
      const now = new Date().toISOString();
      const s = { ...imported, id: uuidv4(), createdAt: now, updatedAt: now };
      saveScenario(s);
      setScenarios(loadScenarios());
      openScenario(s);
    } catch { alert('Geçersiz senaryo dosyası'); }
    e.target.value = '';
  };

  const linkedProfile = profiles.find((p) => p.id === scenario?.profileId);
  const sortedSteps = scenario ? [...scenario.steps].sort((a, b) => a.atMs - b.atMs) : [];
  const selectedStep = scenario?.steps.find((s) => s.id === selectedStepId) ?? null;

  return (
    <div className="flex h-full">
      {/* Scenario List */}
      <div className="w-56 bg-gray-950 border-r border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-gray-400 text-xs font-mono uppercase tracking-wider">Senaryolar</span>
          <div className="flex gap-1">
            <button onClick={() => setShowPresets(true)} className="text-gray-500 hover:text-gray-300 text-xs px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors" title="Hazır Senaryolar">★</button>
            <label className="cursor-pointer text-gray-500 hover:text-gray-300 text-xs px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors" title="İçe Aktar">↑
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button onClick={createNew} className="text-green-400 hover:text-green-300 text-xs px-1.5 py-0.5 rounded hover:bg-green-900/20 transition-colors">+</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {scenarios.length === 0 && <div className="text-gray-600 text-xs font-mono p-2 text-center">Henüz senaryo yok</div>}
          {scenarios.map((s) => (
            <div key={s.id} onClick={() => openScenario(s)}
              className={`group flex items-center justify-between px-2 py-2 rounded cursor-pointer transition-colors text-xs font-mono ${selectedId === s.id ? 'bg-green-900/30 text-green-400 border border-green-800/40' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}>
              <div className="truncate flex-1">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ background: SCENARIO_CATEGORY_COLORS[s.category ?? 'custom'] }} />
                  <span className="truncate">{s.name}</span>
                </div>
                <div className="text-gray-600 text-[10px] mt-0.5">{s.steps.length} adım</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); remove(s.id); }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 ml-1">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor */}
      {!scenario ? (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-40">⏱</div>
            <div className="font-mono text-sm">Senaryo seçin veya yeni oluşturun</div>
            <div className="flex gap-3 mt-4 justify-center">
              <button onClick={createNew} className="px-4 py-2 bg-green-900/30 border border-green-800/50 text-green-400 rounded font-mono text-xs hover:bg-green-900/50 transition-colors">+ Yeni Senaryo</button>
              <button onClick={() => setShowPresets(true)} className="px-4 py-2 bg-yellow-900/30 border border-yellow-800/50 text-yellow-400 rounded font-mono text-xs hover:bg-yellow-900/50 transition-colors">★ Hazır Senaryolar</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
              <input className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm font-mono text-gray-200 outline-none focus:border-green-700"
                value={scenario.name} onChange={(e) => setScenario({ ...scenario, name: e.target.value })} />
              <button onClick={duplicate} className="text-xs font-mono px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-gray-200 hover:bg-gray-700 transition-colors">Kopyala</button>
              <button onClick={() => exportAsJson(scenario, `${scenario.name}.json`)} className="text-xs font-mono px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-gray-200 hover:bg-gray-700 transition-colors">↓ Dışa Aktar</button>
              <button onClick={save} className={`text-xs font-mono px-4 py-1.5 rounded border transition-colors ${saved ? 'bg-green-900/50 border-green-600 text-green-300' : 'bg-green-900/30 border-green-800/50 text-green-400 hover:bg-green-900/50'}`}>
                {saved ? '✓ Kaydedildi' : 'Kaydet'}
              </button>
            </div>

            {/* Scenario Settings */}
            <div className="px-4 py-3 border-b border-gray-800 flex gap-4 flex-wrap">
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">Bağlı Profil</label>
                <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
                  value={scenario.profileId} onChange={(e) => setScenario({ ...scenario, profileId: e.target.value })}>
                  <option value="">— Seçin —</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">Kategori</label>
                <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
                  value={scenario.category ?? 'custom'} onChange={(e) => setScenario({ ...scenario, category: e.target.value as ScenarioCategory })}>
                  {Object.entries(SCENARIO_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">Süre (ms)</label>
                <input type="number" min={100} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700 w-28"
                  value={scenario.durationMs ?? 10000} onChange={(e) => setScenario({ ...scenario, durationMs: Number(e.target.value) })} />
              </div>
              <label className="flex items-center gap-2 text-xs font-mono text-gray-400 cursor-pointer mt-4">
                <input type="checkbox" checked={scenario.loop} onChange={(e) => setScenario({ ...scenario, loop: e.target.checked })} className="accent-green-500" />
                Döngüsel
              </label>
              <div className="flex-1">
                <label className="text-gray-500 text-xs font-mono block mb-1">Açıklama</label>
                <input className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700 w-full"
                  value={scenario.description} onChange={(e) => setScenario({ ...scenario, description: e.target.value })} />
              </div>
            </div>

            {/* View Toggle + Timeline/List */}
            <div className="flex-1 overflow-y-auto">
              {/* Timeline View */}
              {viewMode === 'timeline' && (
                <TimelineView steps={sortedSteps} durationMs={scenario.durationMs ?? 10000} selectedStepId={selectedStepId} onSelect={setSelectedStepId} />
              )}

              {/* List View */}
              {viewMode === 'list' && (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-2">
                      <button onClick={() => setViewMode('list')} className="text-xs font-mono px-2 py-1 rounded transition-colors bg-green-900/30 text-green-400 border border-green-800/50">Liste</button>
                      <button onClick={() => setViewMode('timeline')} className="text-xs font-mono px-2 py-1 rounded transition-colors text-gray-500 hover:text-gray-300">Zaman Çizelgesi</button>
                    </div>
                    <button onClick={addStep} className="text-xs font-mono px-3 py-1 bg-green-900/30 border border-green-800/50 text-green-400 rounded hover:bg-green-900/50 transition-colors">+ Adım Ekle</button>
                  </div>

                  {sortedSteps.length === 0 && (
                    <div className="text-center py-12 text-gray-600">
                      <div className="text-3xl mb-2 opacity-30">◎</div>
                      <div className="font-mono text-xs">Henüz adım yok — adım ekleyerek başlayın</div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {sortedSteps.map((step) => (
                      <div key={step.id} onClick={() => setSelectedStepId(step.id === selectedStepId ? null : step.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer transition-colors border ${selectedStepId === step.id ? 'bg-blue-900/30 border-blue-700/40 text-blue-300' : 'border-transparent hover:bg-gray-800/50 text-gray-300'}`}>
                        <div className="text-gray-500 font-mono text-xs w-16 shrink-0">{step.atMs}ms</div>
                        <div className={`w-2 h-2 rounded-full shrink-0`} style={{ background: getActionColor(step.action) }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs truncate">{step.target}</div>
                          <div className="text-gray-500 text-[10px] font-mono">{step.action} · {step.description || '—'}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} className="text-red-500 hover:text-red-400 text-xs opacity-50 hover:opacity-100">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Step Editor */}
          {selectedStep && (
            <div className="w-80 border-l border-gray-800 overflow-y-auto">
              <StepEditor step={selectedStep} profile={linkedProfile ?? null} onChange={updateStep} />
            </div>
          )}
        </div>
      )}

      {/* Preset Modal */}
      {showPresets && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowPresets(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-green-400 font-mono font-bold text-sm">Hazır Senaryolar</h2>
              <button onClick={() => setShowPresets(false)} className="text-gray-500 hover:text-gray-300">×</button>
            </div>
            {Object.entries(SCENARIO_CATEGORY_LABELS).map(([cat, catLabel]) => {
              const presets = PRESET_SCENARIOS.filter((p) => p.category === cat);
              if (presets.length === 0) return null;
              return (
                <div key={cat} className="mb-4">
                  <div className="text-gray-500 text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: SCENARIO_CATEGORY_COLORS[cat] }} />
                    {catLabel}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {presets.map((preset, idx) => (
                      <div key={idx} className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-green-700 cursor-pointer transition-colors" onClick={() => clonePreset(preset)}>
                        <div className="text-gray-200 text-xs font-mono font-bold mb-1">{preset.name}</div>
                        <div className="text-gray-500 text-[10px] font-mono">{preset.description}</div>
                        <div className="text-gray-600 text-[10px] font-mono mt-1">{preset.steps.length} adım</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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

function TimelineView({ steps, durationMs, selectedStepId, onSelect }: {
  steps: ScenarioStep[];
  durationMs: number;
  selectedStepId: string | null;
  onSelect: (id: string) => void;
}) {
  const width = 800;
  return (
    <div className="p-4 overflow-x-auto">
      <div className="relative" style={{ minWidth: width, height: 120 }}>
        {/* Time axis */}
        <div className="absolute left-0 right-0 top-8 border-t border-gray-700" />
        {/* Time markers */}
        {Array.from({ length: 11 }, (_, i) => {
          const ms = Math.round((i / 10) * durationMs);
          const pct = i * 10;
          return (
            <div key={i} className="absolute" style={{ left: `${pct}%`, top: 0 }}>
              <div className="text-gray-600 text-[9px] font-mono" style={{ transform: 'translateX(-50%)' }}>{ms}ms</div>
              <div className="w-px h-2 bg-gray-700 mx-auto mt-1" />
            </div>
          );
        })}
        {/* Steps */}
        {steps.map((step) => {
          const pct = (step.atMs / durationMs) * 100;
          return (
            <div
              key={step.id}
              className="absolute cursor-pointer"
              style={{ left: `${Math.min(pct, 97)}%`, top: 24 }}
              onClick={() => onSelect(step.id)}
            >
              <div className={`w-3 h-3 rounded-full border-2 transition-transform hover:scale-125 ${selectedStepId === step.id ? 'scale-125' : ''}`}
                style={{ background: getActionColor(step.action), borderColor: selectedStepId === step.id ? 'white' : 'transparent' }} />
              <div className="text-[9px] font-mono text-gray-500 mt-1" style={{ transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
                {step.action}
              </div>
            </div>
          );
        })}
      </div>
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

function StepEditor({ step, profile, onChange }: { step: ScenarioStep; profile: FrameProfile | null; onChange: (s: ScenarioStep) => void }) {
  const update = (patch: Partial<ScenarioStep>) => onChange({ ...step, ...patch });
  const updateConfig = (key: string, value: number | string) =>
    onChange({ ...step, actionConfig: { ...(step.actionConfig as Record<string, unknown>), [key]: typeof value === 'string' ? value : Number(value) } as ActionConfig });

  const actionCfg = ACTION_CONFIGS[step.action];

  // Build target suggestions
  const fieldTargets = profile ? profile.fields.map((f) => `field:${f.name}`) : [];
  const bitTargets: string[] = profile ? profile.fields.filter((f) => f.type === 'flags').flatMap((f) => {
    const cfg = f.typeConfig as import('../../types').FlagsConfig;
    return cfg.bits.map((b) => `bit:${f.name}.${b.name}`);
  }) : [];
  const allTargets = [...fieldTargets, ...bitTargets];

  const inputCls = 'bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-green-700 w-full';

  return (
    <div className="p-4 space-y-3">
      <div className="text-blue-400 text-xs font-mono font-bold uppercase tracking-wider border-b border-gray-800 pb-2">Adım Yapılandırması</div>

      <div>
        <label className="text-gray-500 text-xs font-mono block mb-1">Zaman (ms)</label>
        <input type="number" min={0} className={inputCls} value={step.atMs} onChange={(e) => update({ atMs: Number(e.target.value) })} />
      </div>

      <div>
        <label className="text-gray-500 text-xs font-mono block mb-1">Hedef</label>
        <input className={inputCls} value={step.target} onChange={(e) => update({ target: e.target.value })}
          list="target-suggestions" placeholder="field:Alan veya bit:Alan.BitAdı" />
        <datalist id="target-suggestions">
          {allTargets.map((t) => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div>
        <label className="text-gray-500 text-xs font-mono block mb-1">İşlem</label>
        <select className={inputCls} value={step.action} onChange={(e) => update({ action: e.target.value as ActionType, actionConfig: {} })}>
          {Object.entries(ACTION_CONFIGS).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
        </select>
      </div>

      {actionCfg.fields.map((f) => (
        <div key={f.key}>
          <label className="text-gray-500 text-xs font-mono block mb-1">{f.label}</label>
          <input type={f.type} className={inputCls}
            value={(step.actionConfig as Record<string, number | string>)[f.key] ?? ''}
            onChange={(e) => updateConfig(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
          />
        </div>
      ))}

      {step.action === 'inject_error' && (
        <div>
          <label className="text-gray-500 text-xs font-mono block mb-1">Hata Türü</label>
          <select className={inputCls}
            value={(step.actionConfig as { errorType?: string }).errorType ?? 'corrupt_checksum'}
            onChange={(e) => onChange({ ...step, actionConfig: { ...(step.actionConfig as Record<string, unknown>), errorType: e.target.value as ErrorType } as ActionConfig })}>
            <option value="corrupt_checksum">Checksum Bozulması</option>
            <option value="skip_bytes">Eksik Byte</option>
            <option value="wrong_sync">Yanlış Sync</option>
            <option value="extra_bytes">Ekstra Byte</option>
            <option value="delay_frame">Frame Gecikmesi</option>
          </select>
        </div>
      )}

      {step.action === 'ramp' && (
        <div>
          <label className="text-gray-500 text-xs font-mono block mb-1">Eğri</label>
          <select className={inputCls}
            value={(step.actionConfig as { curve?: string }).curve ?? 'linear'}
            onChange={(e) => onChange({ ...step, actionConfig: { ...(step.actionConfig as Record<string, unknown>), curve: e.target.value as import('../../types').EasingCurve } as ActionConfig })}>
            <option value="linear">Doğrusal</option>
            <option value="ease-in">Ease In</option>
            <option value="ease-out">Ease Out</option>
            <option value="ease-in-out">Ease In-Out</option>
          </select>
        </div>
      )}

      <div>
        <label className="text-gray-500 text-xs font-mono block mb-1">Açıklama (isteğe bağlı)</label>
        <input className={inputCls} value={step.description ?? ''} onChange={(e) => update({ description: e.target.value })} placeholder="Bu adımın açıklaması..." />
      </div>
    </div>
  );
}
