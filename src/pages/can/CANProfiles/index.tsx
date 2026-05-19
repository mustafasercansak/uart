import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Upload, Save, ChevronRight, Bus, Pencil, Check, X, Download, FolderOpen } from 'lucide-react';
import { useCANContext } from '../../../can/store/CANContext';
import {
  loadCANProfiles, saveCANProfile, deleteCANProfile, createCANProfile,
  type CANProfile, type CANProfileNode,
} from '../../../can/store/canProfileStorage';
import { MEDICAL_PROFILE_LABELS, MEDICAL_PROFILE_COLORS, type CANMedicalProfile } from '../../../can/types/CANNode';
import { parseDBC, dbcToProfileNodes } from '../../../can/utils/dbcParser';
import { useTranslation } from '../../../i18n/context';

// ─── Form type ───────────────────────────────────────────────────────────────

interface NodeEditForm {
  name: string;
  profile: CANMedicalProfile;
  arbitrationHex: string;
  intervalMs: string;
  isActive: boolean;
  nodeId: string;
  frameFormat: 'standard' | 'extended';
  dlc: string;
  nmtInitialState: 'operational' | 'pre-operational' | 'stopped';
  priority: string;
}

const DEFAULT_FORM: NodeEditForm = {
  name: '', profile: 'vital-monitor', arbitrationHex: '100',
  intervalMs: '50', isActive: true, nodeId: '1',
  frameFormat: 'standard', dlc: '8',
  nmtInitialState: 'operational', priority: '0',
};

function nodeToForm(n: CANProfileNode): NodeEditForm {
  return {
    name: n.name,
    profile: n.profile,
    arbitrationHex: n.baseArbitrationId.toString(16).toUpperCase().padStart(3, '0'),
    intervalMs: String(n.sendIntervalMs),
    isActive: n.isActive,
    nodeId: String(n.nodeId ?? n.id),
    frameFormat: n.frameFormat ?? 'standard',
    dlc: String(n.dlc ?? 8),
    nmtInitialState: n.nmtInitialState ?? 'operational',
    priority: String(n.priority ?? 0),
  };
}

function formToNode(form: NodeEditForm, base: Partial<CANProfileNode> = {}): Partial<CANProfileNode> | null {
  const arbId = parseInt(form.arbitrationHex, 16);
  const interval = parseInt(form.intervalMs, 10);
  const nodeId = parseInt(form.nodeId, 10);
  const dlc = parseInt(form.dlc, 10);
  const priority = parseInt(form.priority, 10);
  if (isNaN(arbId) || arbId < 0) return null;
  if (form.frameFormat === 'standard' && arbId > 0x7FF) return null;
  if (form.frameFormat === 'extended' && arbId > 0x1FFFFFFF) return null;
  if (isNaN(interval) || interval < 1) return null;
  return {
    ...base,
    name: form.name.trim() || (base.name ?? 'Node'),
    profile: form.profile,
    color: MEDICAL_PROFILE_COLORS[form.profile],
    baseArbitrationId: arbId,
    sendIntervalMs: interval,
    isActive: form.isActive,
    nodeId: isNaN(nodeId) ? 1 : Math.max(1, Math.min(127, nodeId)),
    frameFormat: form.frameFormat,
    dlc: isNaN(dlc) ? 8 : Math.max(1, Math.min(8, dlc)),
    nmtInitialState: form.nmtInitialState,
    priority: isNaN(priority) ? 0 : Math.max(0, Math.min(7, priority)),
  };
}

// ─── Shared node edit form component ─────────────────────────────────────────

function NodeForm({ form, onChange, onSave, onCancel, saveLabel, autoFocus = true }: {
  form: NodeEditForm;
  onChange: (f: NodeEditForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const arbLimit = form.frameFormat === 'standard' ? 3 : 8;
  const arbPattern = form.frameFormat === 'standard' ? /[^0-9A-F]/g : /[^0-9A-F]/g;

  return (
    <div className="rounded-xl border border-cyan-700/60 bg-cyan-950/20 p-4 space-y-3">
      {/* Name */}
      <input
        autoFocus={autoFocus}
        value={form.name}
        onChange={e => onChange({ ...form, name: e.target.value })}
        placeholder={t('canProfiles.nodeName')}
        className="w-full bg-gray-800/60 border border-white/10 text-white text-xs font-bold px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
      />

      {/* Profile type */}
      <select
        value={form.profile}
        onChange={e => onChange({ ...form, profile: e.target.value as CANMedicalProfile })}
        className="w-full bg-gray-800/60 border border-white/10 text-gray-300 text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
      >
        {(Object.keys(MEDICAL_PROFILE_LABELS) as CANMedicalProfile[]).map(p => (
          <option key={p} value={p}>{t(MEDICAL_PROFILE_LABELS[p])}</option>
        ))}
      </select>

      {/* Node ID | Frame Format */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-wide">{t('canProfiles.nodeId')} (1–127)</div>
          <input
            type="number" min={1} max={127}
            value={form.nodeId}
            onChange={e => onChange({ ...form, nodeId: e.target.value })}
            className="w-full bg-gray-800/60 border border-white/10 text-white text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
          />
        </div>
        <div>
          <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-wide">{t('canProfiles.frameFormat')}</div>
          <select
            value={form.frameFormat}
            onChange={e => onChange({ ...form, frameFormat: e.target.value as 'standard' | 'extended' })}
            className="w-full bg-gray-800/60 border border-white/10 text-gray-300 text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
          >
            <option value="standard">{t('canProfiles.standard')}</option>
            <option value="extended">{t('canProfiles.extended')}</option>
          </select>
        </div>
      </div>

      {/* ARB ID | DLC */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-wide">
            {t('canProfiles.arbId')} {form.frameFormat === 'standard' ? '(0x000–0x7FF)' : '(0x00000000–0x1FFFFFFF)'}
          </div>
          <div className="flex items-center gap-1 bg-gray-800/60 border border-white/10 rounded-lg px-2 py-1.5">
            <span className="text-[10px] text-gray-600">0x</span>
            <input
              value={form.arbitrationHex}
              onChange={e => onChange({ ...form, arbitrationHex: e.target.value.toUpperCase().replace(arbPattern, '').slice(0, arbLimit) })}
              className="flex-1 bg-transparent text-white text-[11px] outline-none w-0 min-w-0"
            />
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-wide">{t('canProfiles.dlc')} (1–8)</div>
          <input
            type="number" min={1} max={8}
            value={form.dlc}
            onChange={e => onChange({ ...form, dlc: e.target.value })}
            className="w-full bg-gray-800/60 border border-white/10 text-white text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
          />
        </div>
      </div>

      {/* Interval | Priority */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-wide">{t('canProfiles.interval')} (ms)</div>
          <input
            type="number" min={1}
            value={form.intervalMs}
            onChange={e => onChange({ ...form, intervalMs: e.target.value })}
            className="w-full bg-gray-800/60 border border-white/10 text-white text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
          />
        </div>
        <div>
          <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-wide">{t('canProfiles.priority')} (0–7)</div>
          <input
            type="number" min={0} max={7}
            value={form.priority}
            onChange={e => onChange({ ...form, priority: e.target.value })}
            className="w-full bg-gray-800/60 border border-white/10 text-white text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
          />
        </div>
      </div>

      {/* NMT Initial State */}
      <div>
        <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-wide">{t('canProfiles.nmtState')}</div>
        <select
          value={form.nmtInitialState}
          onChange={e => onChange({ ...form, nmtInitialState: e.target.value as NodeEditForm['nmtInitialState'] })}
          className="w-full bg-gray-800/60 border border-white/10 text-gray-300 text-[11px] px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
        >
          <option value="operational">{t('canProfiles.nmtOperational')}</option>
          <option value="pre-operational">{t('canProfiles.nmtPreOperational')}</option>
          <option value="stopped">{t('canProfiles.nmtStopped')}</option>
        </select>
      </div>

      {/* Active toggle + actions */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => onChange({ ...form, isActive: !form.isActive })}
          className={`text-[9px] font-bold px-2 py-1 rounded border transition-colors ${form.isActive ? 'bg-green-900/40 text-green-400 border-green-700' : 'bg-gray-800 text-gray-500 border-gray-700'}`}
        >
          {form.isActive ? 'ACTIVE' : 'INACTIVE'}
        </button>
        <div className="flex items-center gap-1.5">
          <button onClick={onCancel} className="p-1.5 text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg transition-colors">
            <X size={11} />
          </button>
          <button onClick={onSave} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-white bg-cyan-700 hover:bg-cyan-600 rounded-lg transition-colors">
            <Check size={11} />
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Read-only node card ──────────────────────────────────────────────────────

function NodeCard({ node, onEdit, onRemove, t }: {
  node: CANProfileNode;
  onEdit: () => void;
  onRemove: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: MEDICAL_PROFILE_COLORS[node.profile] }} />
        <span className="font-bold text-sm text-white truncate">{node.name}</span>
        <span className="text-[10px] text-gray-600 ml-auto">#{node.nodeId ?? node.id}</span>
        <button onClick={onEdit} className="text-gray-600 hover:text-cyan-400 p-0.5 transition-colors" title={t('can.editNode')}>
          <Pencil size={11} />
        </button>
        <button onClick={onRemove} className="text-gray-600 hover:text-red-400 p-0.5 transition-colors" title={t('canProfiles.deleteNode')}>
          <X size={11} />
        </button>
      </div>
      <div className="text-[10px] text-gray-500">{t(MEDICAL_PROFILE_LABELS[node.profile])}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono text-gray-600">
        <span>{t('canProfiles.arbId')}: 0x{node.baseArbitrationId.toString(16).toUpperCase().padStart(3, '0')}</span>
        <span>{t('canProfiles.interval')}: {node.sendIntervalMs}ms</span>
        {node.frameFormat && <span>{node.frameFormat === 'extended' ? '29-bit' : '11-bit'}</span>}
        {node.dlc !== undefined && <span>DLC: {node.dlc}</span>}
        {node.nmtInitialState && <span>NMT: {node.nmtInitialState}</span>}
        {node.priority !== undefined && <span>{t('canProfiles.priority')}: {node.priority}</span>}
      </div>
      <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded w-fit ${node.isActive ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
        {node.isActive ? 'ACTIVE' : 'INACTIVE'}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [importError, setImportError] = useState<string | null>(null);

  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [nodeForm, setNodeForm] = useState<NodeEditForm | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [addForm, setAddForm] = useState<NodeEditForm>({ ...DEFAULT_FORM });

  const jsonImportRef = useRef<HTMLInputElement>(null);
  const dbcImportRef = useRef<HTMLInputElement>(null);

  const selectedProfile = profiles.find(p => p.id === selectedId) ?? null;
  const refresh = useCallback(() => setProfiles(loadCANProfiles()), []);

  // ── Profile-level actions ──────────────────────────────────────────────────

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

  const handleLoad = () => {
    if (!selectedProfile) return;
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

  const startRename = () => {
    if (!selectedProfile) return;
    setNameInput(selectedProfile.name);
    setDescInput(selectedProfile.description);
    setEditingName(true);
  };

  const commitRename = () => {
    if (!selectedProfile || !nameInput.trim()) return;
    saveCANProfile({ ...selectedProfile, name: nameInput.trim(), description: descInput.trim(), updatedAt: new Date().toISOString() });
    refresh();
    setEditingName(false);
  };

  // ── Export / Import ────────────────────────────────────────────────────────

  const handleExportJSON = () => {
    if (!selectedProfile) return;
    const data = JSON.stringify({ $schema: 'uart-can-profile/v1', ...selectedProfile }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedProfile.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as CANProfile;
        if (!raw.nodes || !raw.baudRate) throw new Error('Invalid profile format');
        const imported: CANProfile = {
          ...raw,
          id: crypto.randomUUID(),
          createdAt: raw.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        saveCANProfile(imported);
        refresh();
        setSelectedId(imported.id);
        setImportError(null);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : t('canProfiles.importError'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportDBC = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const { messages, errors } = parseDBC(content);
      if (messages.length === 0) {
        setImportError(errors[0] ?? t('canProfiles.dbcNoMessages'));
        return;
      }
      const nodes = dbcToProfileNodes(messages);
      const name = file.name.replace(/\.dbc$/i, '');
      const p = createCANProfile(name, t('canProfiles.dbcImportedDesc'), 500, nodes);
      saveCANProfile(p);
      refresh();
      setSelectedId(p.id);
      setImportError(errors.length > 0 ? `${t('canProfiles.dbcPartial')}: ${errors.slice(0, 2).join('; ')}` : null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Node-level actions ─────────────────────────────────────────────────────

  const startEditNode = (node: CANProfileNode) => {
    setEditingNodeId(node.id);
    setNodeForm(nodeToForm(node));
    setShowAddNode(false);
  };

  const cancelEditNode = () => { setEditingNodeId(null); setNodeForm(null); };

  const commitEditNode = () => {
    if (!selectedProfile || !nodeForm || editingNodeId === null) return;
    const patch = formToNode(nodeForm);
    if (!patch) return;
    const updatedNodes = selectedProfile.nodes.map(n =>
      n.id === editingNodeId ? { ...n, ...patch } as CANProfileNode : n
    );
    saveCANProfile({ ...selectedProfile, nodes: updatedNodes, updatedAt: new Date().toISOString() });
    refresh();
    cancelEditNode();
  };

  const commitAddNode = () => {
    if (!selectedProfile || !addForm.name.trim()) return;
    const patch = formToNode(addForm);
    if (!patch) return;
    const existingIds = selectedProfile.nodes.map(n => n.id);
    const newId = Math.max(0, ...existingIds) + 1;
    const newNode: CANProfileNode = { id: newId, ...patch } as CANProfileNode;
    saveCANProfile({ ...selectedProfile, nodes: [...selectedProfile.nodes, newNode], updatedAt: new Date().toISOString() });
    refresh();
    setShowAddNode(false);
    setAddForm({ ...DEFAULT_FORM });
  };

  const removeNodeFromProfile = (nodeId: number) => {
    if (!selectedProfile) return;
    saveCANProfile({ ...selectedProfile, nodes: selectedProfile.nodes.filter(n => n.id !== nodeId), updatedAt: new Date().toISOString() });
    refresh();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex bg-gray-950 text-gray-200 font-mono overflow-hidden">
      {/* Hidden file inputs */}
      <input ref={jsonImportRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
      <input ref={dbcImportRef} type="file" accept=".dbc" className="hidden" onChange={handleImportDBC} />

      {/* ── Left: profile list ── */}
      <div className="w-64 xl:w-72 shrink-0 flex flex-col border-r border-gray-800/60 bg-gray-900">
        <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('canProfiles.savedProfiles')}</span>
          <span className="text-[10px] text-gray-600">{profiles.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {profiles.length === 0 && (
            <p className="text-center text-gray-600 text-[10px] mt-8 leading-relaxed px-3">{t('canProfiles.noProfiles')}</p>
          )}
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedId(p.id); setEditingName(false); cancelEditNode(); setShowAddNode(false); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                p.id === selectedId
                  ? 'border-cyan-700 bg-cyan-950/30 text-white'
                  : 'border-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold truncate flex-1">{p.name}</span>
                <ChevronRight size={12} className="shrink-0 opacity-40" />
              </div>
              <div className="text-[9px] text-gray-600 mt-0.5">{p.baudRate}k · {p.nodes.length} {t('canProfiles.nodes')}</div>
            </button>
          ))}
        </div>

        {/* Bottom actions */}
        <div className="border-t border-gray-800/60 p-3 space-y-2">
          {/* Import buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => jsonImportRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 rounded-lg transition-colors"
            >
              <FolderOpen size={11} /> JSON
            </button>
            <button
              onClick={() => dbcImportRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 rounded-lg transition-colors"
            >
              <FolderOpen size={11} /> DBC
            </button>
          </div>
          {importError && (
            <p className="text-[9px] text-red-400 leading-snug px-1">{importError}</p>
          )}
          {/* Save current bus */}
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
                <button onClick={() => setShowSaveForm(false)} className="flex-1 py-1.5 text-[10px] border border-gray-700 text-gray-500 rounded-lg hover:bg-gray-800 transition-colors">
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
                    onClick={handleExportJSON}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs font-bold rounded-lg transition-colors"
                    title={t('canProfiles.exportJson')}
                  >
                    <Download size={13} />
                    {t('canProfiles.exportJson')}
                  </button>
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
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest">{t('canProfiles.deviceNodes')}</div>
              <button
                onClick={() => { setShowAddNode(true); cancelEditNode(); }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold border border-cyan-800/60 text-cyan-500 hover:bg-cyan-950/30 rounded-lg transition-colors"
              >
                <Plus size={11} />
                {t('canProfiles.addNode')}
              </button>
            </div>

            {/* Add node form */}
            {showAddNode && (
              <div className="mb-3">
                <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide mb-2">{t('canProfiles.newNode')}</div>
                <NodeForm
                  form={addForm}
                  onChange={setAddForm}
                  onSave={commitAddNode}
                  onCancel={() => setShowAddNode(false)}
                  saveLabel={t('canProfiles.addNode')}
                />
              </div>
            )}

            {selectedProfile.nodes.length === 0 && !showAddNode ? (
              <p className="text-gray-600 text-sm">{t('canProfiles.emptyProfile')}</p>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {selectedProfile.nodes.map(node => (
                  editingNodeId === node.id && nodeForm ? (
                    <NodeForm
                      key={node.id}
                      form={nodeForm}
                      onChange={setNodeForm}
                      onSave={commitEditNode}
                      onCancel={cancelEditNode}
                      saveLabel={t('canProfiles.save')}
                    />
                  ) : (
                    <NodeCard
                      key={node.id}
                      node={node}
                      onEdit={() => startEditNode(node)}
                      onRemove={() => removeNodeFromProfile(node.id)}
                      t={t}
                    />
                  )
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
            <div className="text-gray-700 text-xs leading-relaxed max-w-xs">{t('canProfiles.hint')}</div>
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
