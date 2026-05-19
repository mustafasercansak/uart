import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from '../../i18n/context';
import type {
  FrameProfile,
  Field,
  FieldType,
  FixedConfig,
  RangeConfig,
  WaveformConfig,
  ChecksumConfig,
  FlagsConfig,
  ComputedConfig,
  RampConfig,
  FlagBit,
} from '../../types';
import { loadProfiles, saveProfile, deleteProfile, exportAsJson, importFromJson } from '../../store/storage';
import { SENSOR_TEMPLATES } from '../../data/templates';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { FramePreview } from './FramePreview';
import { FieldEditor } from './FieldEditor';
import ProfileCompare from '../SimulationDashboard/components/ProfileCompare';

function newField(order: number, t: (key: string, params?: Record<string, unknown>) => string): Field {
  return {
    id: uuidv4(),
    name: t('profileEditor.newFieldDefault', { index: order + 1 }),
    order,
    byteWidth: 1,
    endianness: 'big',
    type: 'range',
    typeConfig: { min: 0, max: 255, distribution: 'uniform' } as RangeConfig,
  };
}

function newProfile(t: (key: string, params?: Record<string, unknown>) => string): FrameProfile {
  const now = new Date().toISOString();
  const syncId = uuidv4();
  const dataId = uuidv4();
  const csId = uuidv4();
  return {
    id: uuidv4(),
    name: t('profileEditor.newProfileDefault'),
    description: '',
    baudRate: 9600,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 100,
    framing: { mode: 'fixed' },
    createdAt: now,
    updatedAt: now,
    fields: [
      { id: syncId, name: t('profileEditor.sync'), order: 0, byteWidth: 1, endianness: 'big', type: 'fixed', typeConfig: { value: 0xAA } as FixedConfig },
      { id: dataId, name: t('profileEditor.data'), order: 1, byteWidth: 1, endianness: 'big', type: 'range', typeConfig: { min: 0, max: 255, distribution: 'uniform' } as RangeConfig },
      { id: csId, name: t('profileEditor.checksum'), order: 2, byteWidth: 1, endianness: 'big', type: 'checksum', typeConfig: { algorithm: 'xor', scope: { startFieldId: syncId, endFieldId: dataId } } as ChecksumConfig },
    ],
  };
}

export default function ProfileEditor() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fromDashboard = searchParams.get('from') === 'dashboard';
  const [profiles, setProfiles] = useState<FrameProfile[]>(() => loadProfiles());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<FrameProfile | null>(null);
  const [shareModal, setShareModal] = useState<{ json: string; url: string; copied: boolean } | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showBer, setShowBer] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const historyRef = useRef<FrameProfile[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncUndoRedo = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const pushHistory = useCallback((p: FrameProfile) => {
    if (skipHistoryRef.current) return;
    const snapshot = JSON.parse(JSON.stringify(p)) as FrameProfile;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
    syncUndoRedo();
  }, [syncUndoRedo]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    skipHistoryRef.current = true;
    setProfile(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
    skipHistoryRef.current = false;
    syncUndoRedo();
  }, [syncUndoRedo]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    skipHistoryRef.current = true;
    setProfile(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
    skipHistoryRef.current = false;
    syncUndoRedo();
  }, [syncUndoRedo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const setProfileWithHistory = useCallback((updater: FrameProfile | ((prev: FrameProfile | null) => FrameProfile | null)) => {
    setProfile(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next) pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  const openProfile = (p: FrameProfile) => {
    historyRef.current = [];
    historyIndexRef.current = -1;
    const copy = JSON.parse(JSON.stringify(p)) as FrameProfile;
    pushHistory(copy);
    setProfile(copy);
    setSelectedId(p.id);
    setSelectedFieldId(null);
  };

  const createNew = () => {
    const p = newProfile(t);
    setProfile(p);
    setSelectedId(p.id);
    setSelectedFieldId(null);
  };

  // URL param ile otomatik profil aç veya yeni oluştur
  useEffect(() => {
    const editId = searchParams.get('edit');
    const isNew  = searchParams.get('new') === '1';
    if (editId) {
      const target = profiles.find(p => p.id === editId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (target) openProfile(target);
    } else if (isNew) {
      createNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    if (!profile) return;
    const updated = { ...profile, updatedAt: new Date().toISOString() };
    saveProfile(updated);
    setProfiles(loadProfiles());
    setProfile(updated);
    setSaved(true);
    if (fromDashboard) {
      setTimeout(() => navigate('/'), 800);
    } else {
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const remove = (id: string) => {
    deleteProfile(id);
    setProfiles(loadProfiles());
    if (selectedId === id) { setProfile(null); setSelectedId(null); }
  };

  const duplicate = () => {
    if (!profile) return;
    const now = new Date().toISOString();
    const dup: FrameProfile = { ...profile, id: uuidv4(), name: `${profile.name} ${t('profileEditor.copySuffix')}`, createdAt: now, updatedAt: now };
    saveProfile(dup);
    setProfiles(loadProfiles());
    openProfile(dup);
  };

  const submitToCommunity = async (p: FrameProfile) => {
    // Block built-in templates — detect by matching all field IDs against SENSOR_TEMPLATES
    const profileFieldIds = new Set(p.fields.map((f) => f.id));
    const isBuiltin = SENSOR_TEMPLATES.some((tmpl) =>
      tmpl.profile.fields.every((f) => profileFieldIds.has(f.id))
    );
    if (isBuiltin) {
      alert(t('profileEditor.submitBuiltinBlocked'));
      return;
    }

    const template = {
      id: `community-${p.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${uuidv4().slice(0, 6)}`,
      name: p.name,
      description: p.description || '',
      icon: '📡',
      category: 'general',
      profile: {
        name: p.name,
        description: p.description,
        baudRate: p.baudRate,
        dataBits: p.dataBits,
        parity: p.parity,
        stopBits: p.stopBits,
        sendIntervalMs: p.sendIntervalMs,
        framing: p.framing,
        fields: p.fields,
      },
      scenarios: [],
    };

    const json = JSON.stringify(template, null, 2);
    const body = `## Community Template Submission\n\n**Template Name:** ${p.name}\n**Category:** general\n**Author:** (GitHub kullanıcı adınız)\n\n### Template JSON\n\n\`\`\`json\n(JSON buraya yapıştırın)\n\`\`\`\n\n### Açıklama\n(Bu şablonun ne simüle ettiğini yazın.)`;
    const url = `https://github.com/mustafasercansak/uart/issues/new?title=${encodeURIComponent(`Community Template: ${p.name}`)}&body=${encodeURIComponent(body)}&labels=community-template`;
    setShareModal({ json, url, copied: false });
  };

  const addField = () => {
    if (!profile) return;
    const field = newField(profile.fields.length, t);
    setProfileWithHistory({ ...profile, fields: [...profile.fields, field] });
    setSelectedFieldId(field.id);
  };

  const removeField = (id: string) => {
    if (!profile) return;
    setProfileWithHistory({ ...profile, fields: profile.fields.filter((f) => f.id !== id).map((f, i) => ({ ...f, order: i })) });
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  const moveField = (id: string, dir: -1 | 1) => {
    if (!profile) return;
    const fields = [...profile.fields].sort((a, b) => a.order - b.order);
    const idx = fields.findIndex((f) => f.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= fields.length) return;
    [fields[idx], fields[newIdx]] = [fields[newIdx], fields[idx]];
    setProfileWithHistory({ ...profile, fields: fields.map((f, i) => ({ ...f, order: i })) });
  };

  const updateField = useCallback((updated: Field) => {
    setProfileWithHistory((p) => p ? { ...p, fields: p.fields.map((f) => f.id === updated.id ? updated : f) } : p);
  }, [setProfileWithHistory]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importFromJson<FrameProfile>(file);
      const now = new Date().toISOString();
      const p = { ...imported, id: uuidv4(), createdAt: now, updatedAt: now };
      saveProfile(p);
      setProfiles(loadProfiles());
      openProfile(p);
    } catch {
      alert(t('profileEditor.invalidFile'));
    }
    e.target.value = '';
  };

  const selectedField = profile?.fields.find((f) => f.id === selectedFieldId) ?? null;
  const sortedFields = useMemo(
    () => profile ? [...profile.fields].sort((a, b) => a.order - b.order) : [],
    [profile]
  );

  // BER / Frame timing calculations
  const berStats = useMemo(() => {
    if (!profile) return null;
    const parityBits = profile.parity !== 'None' ? 1 : 0;
    const bitsPerByte = 1 + profile.dataBits + parityBits + profile.stopBits; // start + data + parity + stop
    const totalBytes = sortedFields.reduce((s, f) => s + f.byteWidth, 0);
    const bitsPerFrame = totalBytes * bitsPerByte;
    const frameTimeUs = (bitsPerFrame / profile.baudRate) * 1_000_000;
    const maxFps = 1_000_000 / frameTimeUs;
    const requestedFps = 1000 / profile.sendIntervalMs;
    const utilizationPct = Math.min(100, (requestedFps / maxFps) * 100);
    return { bitsPerByte, bitsPerFrame, frameTimeUs: Math.round(frameTimeUs * 10) / 10, maxFps: Math.round(maxFps * 10) / 10, requestedFps: Math.round(requestedFps * 10) / 10, utilizationPct: Math.round(utilizationPct) };
  }, [profile, sortedFields]);

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || !profile) return;
    if ((profile.tags ?? []).includes(tag)) { setTagInput(''); return; }
    setProfileWithHistory({ ...profile, tags: [...(profile.tags ?? []), tag] });
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    if (!profile) return;
    setProfileWithHistory({ ...profile, tags: (profile.tags ?? []).filter(t => t !== tag) });
  };

  return (
    <div className="flex h-full">
      {/* Profile List */}
      <div className="w-56 bg-gray-950 border-r border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-gray-400 text-xs font-mono uppercase tracking-wider">{t('profileEditor.profiles')}</span>
          <div className="flex gap-1">
            <label className="cursor-pointer text-gray-500 hover:text-gray-300 text-xs px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors" title={t('profileEditor.import')}>
              ↑
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button onClick={createNew} className="text-green-400 hover:text-green-300 text-xs px-1.5 py-0.5 rounded hover:bg-green-900/20 transition-colors" title={t('profileEditor.newProfile')}>+</button>
          </div>
        </div>
        {/* Tag filter */}
        {profiles.some(p => (p.tags ?? []).length > 0) && (
          <div className="px-2 py-1.5 border-b border-gray-800 flex flex-wrap gap-1">
            {Array.from(new Set(profiles.flatMap(p => p.tags ?? []))).map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTagFilter(f => f === tag ? null : tag)}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${activeTagFilter === tag ? 'bg-indigo-900/40 border-indigo-700 text-indigo-300' : 'bg-gray-800/60 border-gray-700 text-gray-500 hover:text-gray-300'}`}
              >#{tag}</button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {profiles.length === 0 && (
            <div className="text-gray-600 text-xs font-mono p-2 text-center">{t('profileEditor.noProfileYet')}</div>
          )}
          {profiles
            .filter(p => !activeTagFilter || (p.tags ?? []).includes(activeTagFilter))
            .map((p) => (
            <div
              key={p.id}
              onClick={() => openProfile(p)}
              className={`group flex items-center justify-between px-2 py-2 rounded cursor-pointer transition-colors text-xs font-mono ${
                selectedId === p.id ? 'bg-green-900/30 text-green-400 border border-green-800/40' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <div className="truncate flex-1">
                <div className="truncate">{p.name}</div>
                <div className="text-gray-600 text-[10px]">{p.baudRate} bps · {p.fields.length} {t('profileEditor.fields')}</div>
                {(p.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {(p.tags ?? []).map(tag => (
                      <span key={tag} className="text-[8px] font-mono px-1 py-0 rounded bg-indigo-900/20 text-indigo-400">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); submitToCommunity(p); }}
                  className="text-blue-500 hover:text-blue-400 text-[10px] px-1"
                  title={t('profileEditor.submitToCommunity')}
                >↑</button>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                  className="text-red-500 hover:text-red-400"
                >×</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor */}
      {!profile ? (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-40">⊞</div>
            <div className="font-mono text-sm">{t('profileEditor.selectOrCreate')}</div>
            <button onClick={createNew} className="mt-4 px-4 py-2 bg-green-900/30 border border-green-800/50 text-green-400 rounded font-mono text-xs hover:bg-green-900/50 transition-colors">
              {t('profileEditor.newProfileTitle')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Center: Profile Config + Field List */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm font-mono text-gray-200 outline-none focus:border-green-700"
                value={profile.name}
                onChange={(e) => setProfileWithHistory({ ...profile, name: e.target.value })}
              />
              <button
                onClick={undo}
                disabled={!canUndo}
                className="text-xs font-mono px-2 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-30"
                title={t('profileEditor.undoTitle')}
              >↩</button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="text-xs font-mono px-2 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-30"
                title={t('profileEditor.redoTitle')}
              >↪</button>
              <button onClick={duplicate} className="text-xs font-mono px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-gray-200 hover:bg-gray-700 transition-colors">{t('profileEditor.copy')}</button>
              <button onClick={() => exportAsJson(profile, `${profile.name}.json`)} className="text-xs font-mono px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-gray-200 hover:bg-gray-700 transition-colors">{t('profileEditor.exportJson')}</button>
              <button onClick={() => setShowBer(v => !v)} className={`text-xs font-mono px-3 py-1.5 rounded border transition-colors ${showBer ? 'bg-amber-900/30 border-amber-700 text-amber-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`} title={t('profileEditor.berTitle')}>{t('can.bER')}</button>
              {profiles.length >= 2 && (
                <button onClick={() => setShowCompare(v => !v)} className={`text-xs font-mono px-3 py-1.5 rounded border transition-colors ${showCompare ? 'bg-indigo-900/30 border-indigo-700 text-indigo-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`} title={t('profileEditor.compareProfiles')}>⇆</button>
              )}
              <button onClick={() => submitToCommunity(profile)} className="text-xs font-mono px-3 py-1.5 bg-blue-900/20 border border-blue-800/40 text-blue-400 rounded hover:border-blue-600 hover:bg-blue-900/30 transition-colors">{t('profileEditor.submitToCommunity')}</button>
              <button onClick={save} className={`text-xs font-mono px-4 py-1.5 rounded border transition-colors ${saved ? 'bg-green-900/50 border-green-600 text-green-300' : 'bg-green-900/30 border-green-800/50 text-green-400 hover:bg-green-900/50'}`}>
                {saved ? (fromDashboard ? '✓ Kaydedildi, dönülüyor…' : t('profileEditor.saved')) : t('common.save')}
              </button>
              {fromDashboard && (
                <button
                  onClick={() => navigate('/')}
                  className="text-xs font-mono px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded hover:text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  ← Dashboard
                </button>
              )}
            </div>

            {/* UART Settings */}
            <div className="px-4 py-3 border-b border-gray-800 flex gap-4">
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">{t('profileEditor.baudRate')}</label>
                <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
                  value={profile.baudRate} onChange={(e) => setProfileWithHistory({ ...profile, baudRate: Number(e.target.value) })}>
                  {[300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">{t('profileEditor.parity')}</label>
                <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
                  value={profile.parity} onChange={(e) => setProfileWithHistory({ ...profile, parity: e.target.value as FrameProfile['parity'] })}>
                  {['None', 'Even', 'Odd', 'Mark', 'Space'].map((p) => (
                    <option key={p} value={p}>
                      {t(`profileEditor.${p.toLowerCase()}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">{t('profileEditor.stopBit')}</label>
                <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700"
                  value={profile.stopBits} onChange={(e) => setProfileWithHistory({ ...profile, stopBits: Number(e.target.value) as FrameProfile['stopBits'] })}>
                  {[1, 1.5, 2].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">{t('profileEditor.sendInterval')}</label>
                <input type="number" min={1} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700 w-24"
                  value={profile.sendIntervalMs} onChange={(e) => setProfileWithHistory({ ...profile, sendIntervalMs: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">{t('profileEditor.description')}</label>
                <input className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700 w-48"
                  value={profile.description} onChange={(e) => setProfileWithHistory({ ...profile, description: e.target.value })} />
              </div>
              {/* Tags */}
              <div>
                <label className="text-gray-500 text-xs font-mono block mb-1">{t('profileEditor.tags')}</label>
                <div className="flex items-center gap-1 flex-wrap">
                  {(profile.tags ?? []).map(tag => (
                    <span key={tag} className="flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-900/30 border border-indigo-800/40 text-indigo-300">
                      #{tag}
                      <button onClick={() => removeTag(tag)} className="ml-0.5 text-indigo-500 hover:text-red-400 leading-none">×</button>
                    </span>
                  ))}
                  <input
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono text-gray-200 outline-none focus:border-indigo-600 w-24"
                    placeholder={t('profileEditor.addTag')}
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  />
                  <button onClick={addTag} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-900/20 border border-indigo-800/40 text-indigo-400 hover:border-indigo-600">+</button>
                </div>
              </div>
            </div>

            {/* BER Panel */}
            {showBer && berStats && (
              <div className="px-4 py-3 border-b border-gray-800 bg-amber-950/10">
                <div className="flex items-center gap-6 flex-wrap text-xs font-mono">
                  <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">{t('profileEditor.berTitle')}</span>
                  <span className="text-gray-400">{t('profileEditor.berBitsPerByte')}: <span className="text-amber-300">{berStats.bitsPerByte}</span></span>
                  <span className="text-gray-400">{t('profileEditor.berBitsPerFrame')}: <span className="text-amber-300">{berStats.bitsPerFrame}</span></span>
                  <span className="text-gray-400">{t('profileEditor.berFrameTime')}: <span className="text-amber-300">{berStats.frameTimeUs} µs</span></span>
                  <span className="text-gray-400">{t('profileEditor.berMaxFps')}: <span className="text-amber-300">{berStats.maxFps}</span></span>
                  <span className="text-gray-400">{t('profileEditor.berRequestedFps')}: <span className={berStats.requestedFps > berStats.maxFps ? 'text-red-400 font-bold' : 'text-green-400'}>{berStats.requestedFps}</span></span>
                  <span className="text-gray-400">{t('profileEditor.berUtil')}: <span className={berStats.utilizationPct > 90 ? 'text-red-400 font-bold' : berStats.utilizationPct > 70 ? 'text-yellow-400' : 'text-green-400'}>{berStats.utilizationPct}%</span></span>
                </div>
              </div>
            )}

            {/* Field List */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-400 text-xs font-mono uppercase tracking-wider">{t('profileEditor.fields')} ({sortedFields.length} · {sortedFields.reduce((s, f) => s + f.byteWidth, 0)} byte)</span>
                  <button onClick={addField} className="text-xs font-mono px-3 py-1 bg-green-900/30 border border-green-800/50 text-green-400 rounded hover:bg-green-900/50 transition-colors">{t('profileEditor.addField')}</button>
                </div>

                {/* Header */}
                <div className="grid grid-cols-12 gap-2 text-[10px] font-mono text-gray-600 uppercase mb-2 px-2">
                  <div className="col-span-1">{t('profileEditor.order')}</div>
                  <div className="col-span-3">{t('profileEditor.fieldName')}</div>
                  <div className="col-span-2">{t('profileEditor.fieldTypCol')}</div>
                  <div className="col-span-1 text-center">{t('profileEditor.byteWidth')}</div>
                  <div className="col-span-2">{t('profileEditor.byteOrder')}</div>
                  <div className="col-span-3">{t('profileEditor.actions')}</div>
                </div>

                <div className="space-y-1">
                  {sortedFields.map((field, idx) => (
                    <div
                      key={field.id}
                      onClick={() => setSelectedFieldId(field.id === selectedFieldId ? null : field.id)}
                      className={`grid grid-cols-12 gap-2 items-center px-2 py-2 rounded cursor-pointer transition-colors text-xs font-mono ${
                        selectedFieldId === field.id
                          ? 'bg-blue-900/30 border border-blue-700/40 text-blue-300'
                          : 'hover:bg-gray-800/50 text-gray-300 border border-transparent'
                      }`}
                    >
                      <div className="col-span-1 text-gray-500">{idx}</div>
                      <div className="col-span-3 truncate">{field.name}</div>
                      <div className="col-span-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          field.type === 'fixed' ? 'bg-gray-700 text-gray-300' :
                          field.type === 'range' ? 'bg-blue-900/50 text-blue-300' :
                          field.type === 'waveform' ? 'bg-purple-900/50 text-purple-300' :
                          field.type === 'checksum' ? 'bg-orange-900/50 text-orange-300' :
                          field.type === 'flags' ? 'bg-yellow-900/50 text-yellow-300' :
                          field.type === 'computed' ? 'bg-cyan-900/50 text-cyan-300' :
                          'bg-green-900/50 text-green-300'
                        }`}>
                          {field.type}
                        </span>
                      </div>
                      <div className="col-span-1 text-center text-gray-400">{field.byteWidth}</div>
                      <div className="col-span-2 text-gray-500">{field.endianness === 'big' ? t('profileEditor.bigEndian') : t('profileEditor.littleEndian')}</div>
                      <div className="col-span-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => moveField(field.id, -1)} disabled={idx === 0} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">↑</button>
                        <button onClick={() => moveField(field.id, 1)} disabled={idx === sortedFields.length - 1} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">↓</button>
                        <button onClick={() => removeField(field.id)} className="px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Frame Preview */}
            <div className="border-t border-gray-800">
              <FramePreview fields={sortedFields} />
            </div>
          </div>

          {/* Right Panel: Field Editor */}
          {selectedField && (
            <div className="w-80 border-l border-gray-800 overflow-y-auto">
              <FieldEditor
                field={selectedField}
                allFields={sortedFields}
                onChange={updateField}
              />
            </div>
          )}
        </div>
      )}

      {/* Profile Compare Modal */}
      {showCompare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl mx-4 h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
              <h2 className="text-sm font-mono font-bold text-gray-200">⇆ {t('profileEditor.compareProfiles')}</h2>
              <button onClick={() => setShowCompare(false)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProfileCompare profiles={profiles} />
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h2 className="text-sm font-mono font-bold text-gray-200">{t('profileEditor.submitToCommunity')}</h2>
              <button onClick={() => setShareModal(null)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs font-mono text-gray-400">{t('profileEditor.shareModalHint')}</p>
              <pre className="bg-gray-800 border border-gray-700 rounded p-3 text-[10px] font-mono text-gray-300 max-h-48 overflow-auto whitespace-pre-wrap break-all">
                {shareModal.json}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareModal.json);
                    setShareModal({ ...shareModal, copied: true });
                  }}
                  className={`flex-1 px-3 py-2 rounded text-xs font-mono border transition-colors ${
                    shareModal.copied
                      ? 'bg-green-900/30 border-green-700 text-green-400'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
                  }`}
                >
                  {shareModal.copied ? t('profileEditor.shareCopied') : t('profileEditor.shareCopy')}
                </button>
                <button
                  onClick={() => { openUrl(shareModal.url); setShareModal(null); }}
                  disabled={!shareModal.copied}
                  className="flex-1 px-3 py-2 rounded text-xs font-mono bg-blue-900/20 border border-blue-800/40 text-blue-400 hover:border-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('profileEditor.shareOpenGithub')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
