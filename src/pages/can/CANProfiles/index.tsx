import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Upload, Save, ChevronRight, Bus } from 'lucide-react';
import { useCANContext } from '../../../can/store/CANContext';
import {
  loadCANProfiles, saveCANProfile, deleteCANProfile, createCANProfile,
  type CANProfile, type CANProfileNode,
} from '../../../can/store/canProfileStorage';
import { MEDICAL_PROFILE_LABELS, MEDICAL_PROFILE_COLORS } from '../../../can/types/CANNode';
import { useTranslation } from '../../../i18n/context';

export default function CANProfiles() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state, addNode, removeNode, setBaudRate } = useCANContext();

  const [profiles, setProfiles] = useState<CANProfile[]>(() => loadCANProfiles());
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.id ?? null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [saveDescInput, setSaveDescInput] = useState('');

  const selectedProfile = profiles.find(p => p.id === selectedId) ?? null;

  const refresh = useCallback(() => setProfiles(loadCANProfiles()), []);

  // Save current bus config as a new profile
  const handleSaveCurrent = () => {
    if (!saveNameInput.trim()) return;
    const nodes: CANProfileNode[] = state.nodes.map(n => ({
      id: n.id, name: n.name, profile: n.profile,
      color: n.color, baseArbitrationId: n.baseArbitrationId,
      sendIntervalMs: n.sendIntervalMs, isActive: n.isActive,
    }));
    const p = createCANProfile(saveNameInput.trim(), saveDescInput.trim(), state.baudRate, nodes);
    saveCANProfile(p);
    refresh();
    setSelectedId(p.id);
    setSaveNameInput('');
    setSaveDescInput('');
    setShowSaveForm(false);
  };

  // Load selected profile to bus monitor
  const handleLoad = () => {
    if (!selectedProfile) return;
    // Clear existing nodes
    state.nodes.forEach(n => removeNode(n.id));
    setBaudRate(selectedProfile.baudRate);
    setTimeout(() => {
      selectedProfile.nodes.forEach(n => addNode({
        id: n.id, name: n.name, profile: n.profile,
        color: MEDICAL_PROFILE_COLORS[n.profile],
        baseArbitrationId: n.baseArbitrationId,
        sendIntervalMs: n.sendIntervalMs, isActive: n.isActive,
      }));
      navigate('/can');
    }, 60);
  };

  const handleDelete = (id: string) => {
    deleteCANProfile(id);
    refresh();
    if (selectedId === id) setSelectedId(null);
  };

  // Rename selected profile inline
  const startRename = () => {
    if (!selectedProfile) return;
    setNameInput(selectedProfile.name);
    setDescInput(selectedProfile.description);
    setEditingName(true);
  };

  const commitRename = () => {
    if (!selectedProfile || !nameInput.trim()) return;
    const updated: CANProfile = {
      ...selectedProfile,
      name: nameInput.trim(),
      description: descInput.trim(),
      updatedAt: new Date().toISOString(),
    };
    saveCANProfile(updated);
    refresh();
    setEditingName(false);
  };

  return (
    <div className="h-full flex bg-gray-950 text-gray-200 font-mono overflow-hidden">

      {/* ── Left: profile list ── */}
      <div className="w-64 xl:w-72 shrink-0 flex flex-col border-r border-gray-800/60 bg-gray-900">
        <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('canProfiles.savedProfiles')}</span>
          <span className="text-[10px] text-gray-600">{profiles.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {profiles.length === 0 && (
            <p className="text-center text-gray-600 text-[10px] mt-8 leading-relaxed px-3">
              {t('canProfiles.noProfiles')}
            </p>
          )}
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedId(p.id); setEditingName(false); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all group ${
                p.id === selectedId
                  ? 'border-cyan-700 bg-cyan-950/30 text-white'
                  : 'border-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold truncate flex-1">{p.name}</span>
                <ChevronRight size={12} className="shrink-0 opacity-40" />
              </div>
              <div className="text-[9px] text-gray-600 mt-0.5">
                {p.baudRate}k · {p.nodes.length} {t('canProfiles.nodes')}
              </div>
            </button>
          ))}
        </div>

        {/* Save current config */}
        <div className="border-t border-gray-800/60 p-3">
          {showSaveForm ? (
            <div className="space-y-2">
              <input
                autoFocus
                type="text"
                value={saveNameInput}
                onChange={e => setSaveNameInput(e.target.value)}
                placeholder={t('canProfiles.profileName')}
                className="w-full bg-gray-800/60 border border-white/10 text-white text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
              />
              <input
                type="text"
                value={saveDescInput}
                onChange={e => setSaveDescInput(e.target.value)}
                placeholder={t('canProfiles.descriptionOpt')}
                className="w-full bg-gray-800/60 border border-white/10 text-gray-400 text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => setShowSaveForm(false)}
                  className="flex-1 py-1.5 text-[10px] border border-gray-700 text-gray-500 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {t('can.cancel')}
                </button>
                <button
                  onClick={handleSaveCurrent}
                  disabled={!saveNameInput.trim()}
                  className="flex-1 py-1.5 text-[10px] bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white font-bold rounded-lg transition-colors"
                >
                  {t('canProfiles.save')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setSaveNameInput(''); setShowSaveForm(true); }}
              disabled={state.nodes.length === 0}
              className="w-full flex items-center justify-center gap-2 py-2 text-[10px] border border-cyan-800/60 text-cyan-500 hover:bg-cyan-950/30 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Save size={11} />
              {t('canProfiles.saveCurrentBus')}
            </button>
          )}
        </div>
      </div>

      {/* ── Right: profile detail ── */}
      {selectedProfile ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-800/60 bg-gray-900/40">
            {editingName ? (
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    className="w-full bg-gray-800/60 border border-white/10 text-white text-lg font-bold px-3 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
                  />
                  <input
                    value={descInput}
                    onChange={e => setDescInput(e.target.value)}
                    placeholder={t('canProfiles.descriptionOpt')}
                    className="w-full bg-gray-800/60 border border-white/10 text-gray-400 text-sm px-3 py-1 rounded-lg focus:border-cyan-500 outline-none"
                  />
                </div>
                <button onClick={commitRename} className="px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg transition-colors">
                  {t('canProfiles.save')}
                </button>
                <button onClick={() => setEditingName(false)} className="px-3 py-2 border border-gray-700 text-gray-400 text-xs rounded-lg hover:bg-gray-800 transition-colors">
                  {t('can.cancel')}
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <button onClick={startRename} className="text-lg font-bold text-white hover:text-cyan-400 transition-colors text-left">
                    {selectedProfile.name}
                  </button>
                  {selectedProfile.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{selectedProfile.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
                    <span>{selectedProfile.baudRate}k bps</span>
                    <span>·</span>
                    <span>{selectedProfile.nodes.length} {t('canProfiles.nodes')}</span>
                    <span>·</span>
                    <span>{t('canProfiles.created')} {new Date(selectedProfile.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleLoad}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-cyan-900/20"
                  >
                    <Upload size={13} />
                    {t('canProfiles.loadToBus')}
                  </button>
                  <button
                    onClick={() => handleDelete(selectedProfile.id)}
                    className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/40 rounded-lg transition-colors"
                    title={t('canProfiles.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Node grid */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">{t('canProfiles.deviceNodes')}</div>
            {selectedProfile.nodes.length === 0 ? (
              <p className="text-gray-600 text-sm">{t('canProfiles.emptyProfile')}</p>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {selectedProfile.nodes.map(node => (
                  <div key={node.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: MEDICAL_PROFILE_COLORS[node.profile] }} />
                      <span className="font-bold text-sm text-white truncate">{node.name}</span>
                      <span className="text-[10px] text-gray-600 ml-auto">#{node.id}</span>
                    </div>
                    <div className="text-[10px] text-gray-500">{t(MEDICAL_PROFILE_LABELS[node.profile])}</div>
                    <div className="flex items-center justify-between text-[10px] text-gray-600">
                      <span>ID: 0x{node.baseArbitrationId.toString(16).toUpperCase().padStart(3, '0')}</span>
                      <span>{node.sendIntervalMs}ms</span>
                    </div>
                    <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded w-fit ${node.isActive ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                      {node.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <Bus size={40} className="text-gray-700" />
          <div>
            <div className="text-gray-500 font-bold text-sm mb-1">{t('canProfiles.selectOrCreate')}</div>
            <div className="text-gray-700 text-xs leading-relaxed max-w-xs">
              {t('canProfiles.hint')}
            </div>
          </div>
          {state.nodes.length > 0 && (
            <button
              onClick={() => setShowSaveForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Plus size={13} />
              {t('canProfiles.saveCurrentBus')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
