import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Plus, Trash2, Clock,
  CheckCircle2, XCircle, FileText, Send, Radio, Pencil,
  Check, X as XIcon, FolderPlus, Folder, FolderOpen, ChevronRight, ChevronDown,
} from 'lucide-react';
import { useTranslation } from '../../../../i18n/context';
import type { CANNode, CANFaultType } from '../../../../can/types/CANNode';
import { FAULT_LABELS } from '../../../../can/types/CANNode';
import type { CANFrame } from '../../../../can/types/CANFrame';
import { CANAutomationReport } from './CANAutomationReport';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CANAutoStep {
  id: string;
  timeMs: number;
  type: 'fault' | 'recover' | 'send-frame' | 'expect-frame';
  nodeId: number;
  faultType?: CANFaultType;
  sendArbId?: number;
  sendDataHex?: string;
  sendExtended?: boolean;
  expectArbId?: number;
  expectDataHex?: string;
  expectTimeoutMs?: number;
  label?: string;
}

export interface CANStepResult {
  stepId: string;
  profileId: string;
  type: CANAutoStep['type'];
  label: string;
  timeMs: number;
  passed: boolean;
  expected?: string;
  actual?: string;
}

export interface CANAutomationGroup {
  id: string;
  name: string;
  parentId?: string;
}

interface CANAutomationProfile {
  id: string;
  name: string;
  mode: 'sequential' | 'timeline';
  steps: CANAutoStep[];
  groupId?: string;
  repeatCount?: number;
}

interface ProfileRunState {
  activeStepId: string | null;
  results: CANStepResult[];
  done: boolean;
}

interface CANAutomationTabProps {
  nodes: CANNode[];
  elapsedMs: number;
  status: 'running' | 'paused' | 'stopped';
  frames: CANFrame[];
  networkConnected: boolean;
  serialConnected: boolean;
  onInjectFault: (nodeId: number, fault: CANFaultType) => void;
  onRecoverNode: (nodeId: number) => void;
  onSendFrame: (arbitrationId: number, data: number[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHex(hex: string): number[] {
  return (hex ?? '').trim().split(/\s+/).map(h => parseInt(h, 16)).filter(n => !isNaN(n));
}

function hexStr(id: number, pad = 3): string {
  return `0x${id.toString(16).toUpperCase().padStart(pad, '0')}`;
}

function framesMatch(frame: CANFrame, arbId: number, dataPattern: number[]): boolean {
  if (frame.arbitrationId !== arbId) return false;
  for (let i = 0; i < dataPattern.length; i++) {
    if (frame.data[i] !== dataPattern[i]) return false;
  }
  return true;
}

function getNodeNameFromList(nodeId: number, sourceNodes: CANNode[]) {
  return sourceNodes.find(n => n.id === nodeId)?.name ?? `Node ${nodeId}`;
}

function formatStepLabel(step: CANAutoStep, sourceNodes: CANNode[]): string {
  if (step.label) return step.label;
  switch (step.type) {
    case 'fault':        return `Fault -> ${getNodeNameFromList(step.nodeId, sourceNodes)}`;
    case 'recover':      return `Recover -> ${getNodeNameFromList(step.nodeId, sourceNodes)}`;
    case 'send-frame':   return `Send ${hexStr(step.sendArbId ?? 0)}`;
    case 'expect-frame': return `Expect ${hexStr(step.expectArbId ?? 0)}`;
  }
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

const STORAGE_KEY = 'can-automation-profiles-v1';
const STORAGE_KEY_GROUPS = 'can-automation-groups-v1';

function loadProfiles(): CANAutomationProfile[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveProfiles(p: CANAutomationProfile[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {
    return;
  }
}
function loadGroups(): CANAutomationGroup[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_GROUPS) ?? '[]'); } catch { return []; }
}
function saveGroups(g: CANAutomationGroup[]) {
  try { localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(g)); } catch {
    return;
  }
}
function makeId() { return Math.random().toString(36).substring(2, 9); }

function getGroupProfileIds(groupId: string, allProfiles: CANAutomationProfile[], allGroups: CANAutomationGroup[]): string[] {
  const direct = allProfiles.filter(p => p.groupId === groupId).map(p => p.id);
  const children = allGroups.filter(g => g.parentId === groupId);
  return [...direct, ...children.flatMap(cg => getGroupProfileIds(cg.id, allProfiles, allGroups))];
}
function isGroupInSubtree(ancestorId: string, nodeId: string, allGroups: CANAutomationGroup[]): boolean {
  if (ancestorId === nodeId) return true;
  return allGroups
    .filter(g => g.parentId === ancestorId)
    .some(child => isGroupInSubtree(child.id, nodeId, allGroups));
}
function newProfile(name: string, groupId?: string): CANAutomationProfile {
  return { id: makeId(), name, mode: 'sequential', steps: [], groupId };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CANAutomationTab({
  nodes, elapsedMs, status: _status, frames,
  networkConnected: _networkConnected, serialConnected: _serialConnected,
  onInjectFault, onRecoverNode, onSendFrame,
}: CANAutomationTabProps) {
  const { t } = useTranslation();

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<CANAutomationProfile[]>(() => {
    const s = loadProfiles();
    return s.length ? s : [newProfile(`${t('can.autoReportScenario')} 1`)];
  });
  const [groups, setGroups] = useState<CANAutomationGroup[]>(() => loadGroups());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string>(() => {
    const s = loadProfiles();
    return s.length ? s[0].id : '';
  });
  const [selectedForRun, setSelectedForRun] = useState<Set<string>>(() => {
    const s = loadProfiles();
    return new Set(s.length ? [s[0].id] : []);
  });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  // Use refs so drag-source IDs don't trigger re-renders during drag (re-renders can cancel the browser drag)
  const dragProfileIdRef = useRef<string | null>(null);
  const dragGroupIdRef = useRef<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);

  useEffect(() => { saveProfiles(profiles); }, [profiles]);
  useEffect(() => { saveGroups(groups); }, [groups]);

  const editingProfile = profiles.find(p => p.id === editingId) ?? profiles[0];

  const updateProfile = (id: string, patch: Partial<CANAutomationProfile>) =>
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const setSteps = useCallback((updater: (prev: CANAutoStep[]) => CANAutoStep[]) => {
    setProfiles(prev => prev.map(p =>
      p.id === editingId ? { ...p, steps: updater(p.steps) } : p
    ));
  }, [editingId]);

  const toggleSelect = (id: string) => {
    setSelectedForRun(prev => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  };

  const toggleGroupExpanded = (id: string) => {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  };

  const addGroup = (parentId?: string) => {
    const g: CANAutomationGroup = { id: makeId(), name: `Grup ${groups.length + 1}`, parentId };
    setGroups(prev => [...prev, g]);
    setExpandedGroups(prev => new Set([...prev, g.id, ...(parentId ? [parentId] : [])]));
    setRenamingGroupId(g.id);
    setGroupNameInput(g.name);
  };

  const deleteGroup = (gid: string) => {
    // Collect all descendant group IDs
    const collectDescendants = (id: string, all: CANAutomationGroup[]): string[] => {
      const children = all.filter(g => g.parentId === id);
      return [id, ...children.flatMap(c => collectDescendants(c.id, all))];
    };
    const toDelete = new Set(collectDescendants(gid, groups));
    setGroups(prev => prev.filter(g => !toDelete.has(g.id)));
    setProfiles(prev => prev.map(p => p.groupId && toDelete.has(p.groupId) ? { ...p, groupId: undefined } : p));
  };

  const addProfileToGroup = (groupId?: string) => {
    const count = profiles.length + 1;
    const p = newProfile(`${t('can.autoReportScenario')} ${count}`, groupId);
    setProfiles(prev => [...prev, p]);
    setEditingId(p.id);
    if (groupId) setExpandedGroups(prev => new Set([...prev, groupId]));
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDropOnGroup = (targetGroupId: string) => {
    const pId = dragProfileIdRef.current;
    const gId = dragGroupIdRef.current;
    if (pId) {
      updateProfile(pId, { groupId: targetGroupId });
      setExpandedGroups(prev => new Set([...prev, targetGroupId]));
    } else if (gId && gId !== targetGroupId) {
      if (!isGroupInSubtree(gId, targetGroupId, groups)) {
        setGroups(prev => prev.map(g => g.id === gId ? { ...g, parentId: targetGroupId } : g));
        setExpandedGroups(prev => new Set([...prev, targetGroupId]));
      }
    }
    dragProfileIdRef.current = null; dragGroupIdRef.current = null; setDragOverGroupId(null);
  };

  const handleDropOnUngrouped = () => {
    const pId = dragProfileIdRef.current;
    const gId = dragGroupIdRef.current;
    if (pId) updateProfile(pId, { groupId: undefined });
    else if (gId) setGroups(prev => prev.map(g => g.id === gId ? { ...g, parentId: undefined } : g));
    dragProfileIdRef.current = null; dragGroupIdRef.current = null; setDragOverUngrouped(false);
  };

  // ── Execution state ────────────────────────────────────────────────────────
  const [globalRunning, setGlobalRunning] = useState(false);
  const [runStates, setRunStates] = useState<Record<string, ProfileRunState>>({});
  const [runAt, setRunAt] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);

  const runtimeRef = useRef<Record<string, {
    aborted: boolean;
    pendingExpect: {
      step: CANAutoStep;
      startMs: number;
      onDone: (passed: boolean, actual?: string) => void;
      timeoutHandle: ReturnType<typeof setTimeout>;
    } | null;
    executedSteps: Set<string>;
    startTimeMs: number;
    startWallClockMs: number;
    timelinePending: Map<string, { step: CANAutoStep; triggerWallMs: number; framesAtTrigger: number }>;
  }>>({});

  const framesRef = useRef(frames);
  useEffect(() => { framesRef.current = frames; }, [frames]);

  const cbRefs = useRef({ onInjectFault, onRecoverNode, onSendFrame });
  useEffect(() => { cbRefs.current = { onInjectFault, onRecoverNode, onSendFrame }; }, [onInjectFault, onRecoverNode, onSendFrame]);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const getNodeName = (nodeId: number) => getNodeNameFromList(nodeId, nodesRef.current);
  const stepLabel = (step: CANAutoStep): string => formatStepLabel(step, nodesRef.current);

  // ── State helpers ──────────────────────────────────────────────────────────
  const updateRunState = useCallback((profileId: string, patch: Partial<ProfileRunState>) => {
    setRunStates(prev => ({ ...prev, [profileId]: { ...prev[profileId], ...patch } }));
  }, []);

  const addRunResult = useCallback((profileId: string, result: Omit<CANStepResult, 'profileId'>) => {
    setRunStates(prev => ({
      ...prev,
      [profileId]: { ...prev[profileId], results: [...(prev[profileId]?.results ?? []), { ...result, profileId }] },
    }));
  }, []);

  // ── Sequential runner ─────────────────────────────────────────────────────
  const runSequentialRef = useRef<(profile: CANAutomationProfile, iteration?: number) => void>(() => {});
  const runSequential = useCallback((profile: CANAutomationProfile, iteration = 0) => {
    const pid = profile.id;
    const rt = runtimeRef.current[pid];
    const steps = profile.steps;
    const maxIterations = Math.max(1, profile.repeatCount ?? 1);
    let idx = 0;

    const runNext = () => {
      if (rt.aborted) return;
      if (idx >= steps.length) {
        const nextIteration = iteration + 1;
        if (nextIteration < maxIterations) {
          rt.executedSteps.clear();
          runSequentialRef.current(profile, nextIteration);
        } else {
          updateRunState(pid, { activeStepId: null, done: true });
          setRunStates(prev => {
            const next = { ...prev, [pid]: { ...prev[pid], activeStepId: null, done: true } };
            const allDone = Object.values(next).every(s => s.done);
            if (allDone) setGlobalRunning(false);
            return next;
          });
        }
        return;
      }

      const step = steps[idx++];
      rt.executedSteps.add(step.id);
      updateRunState(pid, { activeStepId: step.id });

      const execute = () => {
        if (rt.aborted) return;
        if (step.type === 'fault' && step.faultType) {
          cbRefs.current.onInjectFault(step.nodeId, step.faultType);
          addRunResult(pid, { stepId: step.id, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed: true, expected: `${step.faultType} on ${getNodeName(step.nodeId)}` });
          runNext();
        } else if (step.type === 'recover') {
          cbRefs.current.onRecoverNode(step.nodeId);
          addRunResult(pid, { stepId: step.id, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed: true, expected: getNodeName(step.nodeId) });
          runNext();
        } else if (step.type === 'send-frame') {
          const id = step.sendArbId ?? 0;
          const data = parseHex(step.sendDataHex ?? '');
          cbRefs.current.onSendFrame(id, data);
          addRunResult(pid, { stepId: step.id, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed: true, expected: `${hexStr(id)} [${data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]` });
          runNext();
        } else if (step.type === 'expect-frame') {
          const startMs = Date.now();
          const timeout = step.expectTimeoutMs ?? 2000;
          const arbId = step.expectArbId ?? 0;
          const onDone = (passed: boolean, actual?: string) => {
            if (rt.aborted) return;
            addRunResult(pid, { stepId: step.id, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed, expected: hexStr(arbId), actual: passed ? actual : tRef.current('can.autoExpectTimeout') });
            runNext();
          };
          const timeoutHandle = setTimeout(() => {
            if (rt.pendingExpect?.step.id === step.id) { rt.pendingExpect = null; onDone(false); }
          }, timeout);
          rt.pendingExpect = { step, startMs, onDone, timeoutHandle };
        }
      };

      if (step.timeMs > 0) {
        setTimeout(execute, step.timeMs);
      } else {
        execute();
      }
    };

    runNext();
  }, [updateRunState, addRunResult]);
  useEffect(() => { runSequentialRef.current = runSequential; }, [runSequential]);

  // ── Frames effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    Object.entries(runtimeRef.current).forEach(([, rt]) => {
      if (!rt.pendingExpect) return;
      const { step, startMs, onDone, timeoutHandle } = rt.pendingExpect;
      const arbId = step.expectArbId ?? 0;
      const dataPattern = parseHex(step.expectDataHex ?? '');
      const match = framesRef.current.find(f => f.timestamp >= startMs && framesMatch(f, arbId, dataPattern));
      if (match) {
        clearTimeout(timeoutHandle);
        rt.pendingExpect = null;
        onDone(true, `${hexStr(match.arbitrationId)} [${match.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`);
      }
    });
  }, [frames]);

  // ── Timeline wall-clock ticker (independent of simulation state) ───────────
  const profilesRef = useRef(profiles);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);

  useEffect(() => {
    if (!globalRunning) return;
    const interval = setInterval(() => {
      const now = Date.now();
      Object.entries(runtimeRef.current).forEach(([pid, rt]) => {
        if (rt.aborted) return;
        const profile = profilesRef.current.find(p => p.id === pid);
        if (!profile || profile.mode !== 'timeline') return;
        const currentMs = now - rt.startWallClockMs;
        profile.steps.forEach(step => {
          if (currentMs < step.timeMs || rt.executedSteps.has(step.id)) return;
          rt.executedSteps.add(step.id);
          updateRunState(pid, { activeStepId: step.id });
          if (step.type === 'fault' && step.faultType) {
            cbRefs.current.onInjectFault(step.nodeId, step.faultType);
            addRunResult(pid, { stepId: step.id, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed: true });
          } else if (step.type === 'recover') {
            cbRefs.current.onRecoverNode(step.nodeId);
            addRunResult(pid, { stepId: step.id, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed: true });
          } else if (step.type === 'send-frame') {
            const id = step.sendArbId ?? 0;
            const data = parseHex(step.sendDataHex ?? '');
            cbRefs.current.onSendFrame(id, data);
            addRunResult(pid, { stepId: step.id, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed: true, expected: `${hexStr(id)} [${data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]` });
          } else if (step.type === 'expect-frame') {
            rt.timelinePending.set(step.id, { step, triggerWallMs: now, framesAtTrigger: framesRef.current.length });
          }
        });
        // Resolve pending expects
        rt.timelinePending.forEach((pending, stepId) => {
          const { step, triggerWallMs, framesAtTrigger } = pending;
          const elapsed = now - triggerWallMs;
          const arbId = step.expectArbId ?? 0;
          const dataPattern = parseHex(step.expectDataHex ?? '');
          const newFrames = framesRef.current.slice(framesAtTrigger);
          const match = newFrames.find(f => framesMatch(f, arbId, dataPattern));
          if (match) {
            rt.timelinePending.delete(stepId);
            addRunResult(pid, { stepId, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed: true, expected: hexStr(arbId), actual: `${hexStr(match.arbitrationId)} [${match.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]` });
          } else if (elapsed > (step.expectTimeoutMs ?? 2000)) {
            rt.timelinePending.delete(stepId);
            addRunResult(pid, { stepId, type: step.type, label: stepLabel(step), timeMs: step.timeMs, passed: false, expected: hexStr(arbId), actual: tRef.current('can.autoExpectTimeout') });
          }
        });
        // Check completion
        if (rt.executedSteps.size === profile.steps.length && rt.timelinePending.size === 0 && profile.steps.length > 0) {
          rt.aborted = true;
          setTimeout(() => {
            updateRunState(pid, { activeStepId: null, done: true });
            setRunStates(prev => {
              const next = { ...prev, [pid]: { ...prev[pid], activeStepId: null, done: true } };
              if (Object.values(next).every(s => s.done)) setGlobalRunning(false);
              return next;
            });
          }, 200);
        }
      });
    }, 100);
    return () => clearInterval(interval);
  }, [globalRunning, updateRunState, addRunResult]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const startAll = () => {
    const toRun = profiles.filter(p => selectedForRun.has(p.id));
    if (!toRun.length) return;
    const initialStates: Record<string, ProfileRunState> = {};
    toRun.forEach(p => { initialStates[p.id] = { activeStepId: null, results: [], done: false }; });
    runtimeRef.current = {};
    const wallNow = Date.now();
    toRun.forEach(p => {
      runtimeRef.current[p.id] = {
        aborted: false, pendingExpect: null,
        executedSteps: new Set(), startTimeMs: elapsedMs,
        startWallClockMs: wallNow,
        timelinePending: new Map(),
      };
    });
    setRunStates(initialStates);
    setRunAt(Date.now());
    setGlobalRunning(true);
    toRun.forEach(p => {
      if (p.mode === 'sequential') runSequential(p);
    });
  };

  const stopAll = () => {
    Object.values(runtimeRef.current).forEach(rt => {
      rt.aborted = true;
      if (rt.pendingExpect) { clearTimeout(rt.pendingExpect.timeoutHandle); rt.pendingExpect = null; }
    });
    setGlobalRunning(false);
    setRunStates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], activeStepId: null, done: true }; });
      return next;
    });
  };

  const canStart = selectedForRun.size > 0 && !globalRunning;

  const addStep = () => {
    const mode = editingProfile.mode;
    const steps = editingProfile.steps;
    const newStep: CANAutoStep = {
      id: makeId(),
      timeMs: mode === 'sequential' ? 1000 : (steps.length > 0 ? Math.max(...steps.map(s => s.timeMs)) + 5000 : 5000),
      type: 'send-frame', nodeId: nodes[0]?.id ?? 0,
      sendArbId: 0x100, sendDataHex: '01 02 03 04', sendExtended: false, expectTimeoutMs: 2000,
    };
    setSteps(prev => [...prev, newStep].sort((a, b) => a.timeMs - b.timeMs));
  };

  const updateStep = (id: string, patch: Partial<CANAutoStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s).sort((a, b) => a.timeMs - b.timeMs));
  };

  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));

  const allResults = Object.values(runStates).flatMap(s => s.results);
  const allDone = Object.keys(runStates).length > 0 && Object.values(runStates).every(s => s.done);

  // ── Sidebar profile item (render function, not React component — avoids remount on drag state changes) ──
  const renderProfile = (p: CANAutomationProfile, indent = 0): React.ReactNode => {
    const isEditing = p.id === editingId;
    const isSelected = selectedForRun.has(p.id);
    const isRenaming = renamingId === p.id;
    const rs = runStates[p.id];
    const isSeq = p.mode === 'sequential';

    return (
      <div
        key={p.id}
        draggable={!globalRunning && !isRenaming}
        onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', `p:${p.id}`); dragProfileIdRef.current = p.id; dragGroupIdRef.current = null; }}
        onDragEnd={() => { dragProfileIdRef.current = null; setDragOverGroupId(null); setDragOverUngrouped(false); }}
        onClick={() => !isRenaming && setEditingId(p.id)}
        style={{ paddingLeft: 8 + indent * 10 }}
        className={`group flex flex-col pr-2 py-2 cursor-grab active:cursor-grabbing transition-colors border-l-2 ${
          isEditing ? 'border-purple-500 bg-purple-950/20' : 'border-transparent hover:border-gray-700 hover:bg-gray-800/20'
        }`}
      >
        {/* Row 1: checkbox + name + status */}
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={e => { e.stopPropagation(); toggleSelect(p.id); }}
            disabled={globalRunning}
            onClick={e => e.stopPropagation()}
            className="accent-purple-500 cursor-pointer shrink-0"
          />
          {isRenaming ? (
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { updateProfile(p.id, { name: nameInput.trim() || p.name }); setRenamingId(null); }
                if (e.key === 'Escape') setRenamingId(null);
              }}
              autoFocus
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 bg-gray-800 border border-purple-600 rounded px-1 py-0.5 text-gray-200 text-[10px] outline-none"
            />
          ) : (
            <span className={`flex-1 min-w-0 truncate text-[10px] select-none ${isEditing ? 'text-purple-300 font-bold' : 'text-gray-300'}`}>
              {p.name}
            </span>
          )}
          {rs?.done && (
            rs.results.filter(r => !r.passed).length === 0
              ? <CheckCircle2 size={9} className="text-emerald-500 shrink-0" />
              : <XCircle size={9} className="text-rose-500 shrink-0" />
          )}
          {/* Rename / delete actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
            {isRenaming ? (
              <>
                <button onClick={e => { e.stopPropagation(); updateProfile(p.id, { name: nameInput.trim() || p.name }); setRenamingId(null); }} className="p-0.5 text-emerald-400"><Check size={9} /></button>
                <button onClick={e => { e.stopPropagation(); setRenamingId(null); }} className="p-0.5 text-gray-500"><XIcon size={9} /></button>
              </>
            ) : (
              <button onClick={e => { e.stopPropagation(); setNameInput(p.name); setRenamingId(p.id); }} disabled={globalRunning} className="p-0.5 text-gray-600 hover:text-gray-300"><Pencil size={9} /></button>
            )}
            {profiles.length > 1 && (
              <button onClick={e => {
                e.stopPropagation();
                const next = profiles.find(x => x.id !== p.id);
                if (next) { setEditingId(next.id); setSelectedForRun(prev => { const n = new Set(prev); n.delete(p.id); return n; }); }
                setProfiles(prev => prev.filter(x => x.id !== p.id));
              }} disabled={globalRunning} className="p-0.5 text-gray-700 hover:text-red-400"><XIcon size={9} /></button>
            )}
          </div>
        </div>

        {/* Row 2: mode toggle (prominent) + repeat */}
        <div className="flex items-center gap-1.5 mt-1.5 pl-5" onClick={e => e.stopPropagation()}>
          <div className="flex rounded overflow-hidden text-[9px] font-black">
            <button
              onClick={() => updateProfile(p.id, { mode: 'sequential' })}
              disabled={globalRunning}
              className={`px-2 py-0.5 transition-colors ${isSeq ? 'bg-purple-700 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
            >{t('can.autoModeSerial')}</button>
            <button
              onClick={() => updateProfile(p.id, { mode: 'timeline' })}
              disabled={globalRunning}
              className={`px-2 py-0.5 transition-colors ${!isSeq ? 'bg-cyan-700 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
            >{t('can.autoModeTimeline')}</button>
          </div>
          {isSeq && (
            <div className="flex items-center gap-0.5">
              <span className="text-[9px] text-gray-500 font-bold">×</span>
              <input
                type="number"
                value={p.repeatCount ?? 1}
                min={1}
                max={99}
                onChange={e => updateProfile(p.id, { repeatCount: Math.max(1, parseInt(e.target.value) || 1) })}
                disabled={globalRunning}
                onClick={e => e.stopPropagation()}
                className="w-9 bg-gray-800 border border-purple-700/50 rounded px-0.5 text-[9px] text-purple-300 outline-none text-center tabular-nums"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Recursive group section (render function — avoids remount on drag state changes) ──
  const renderGroup = (g: CANAutomationGroup, depth = 0): React.ReactNode => {
    const isExpanded = expandedGroups.has(g.id);
    const isRenamingGroup = renamingGroupId === g.id;
    const isDragOver = dragOverGroupId === g.id;
    const childGroups = groups.filter(cg => cg.parentId === g.id);
    const groupProfiles = profiles.filter(p => p.groupId === g.id);

    const allGroupProfileIds = getGroupProfileIds(g.id, profiles, groups);
    const selectedCount = allGroupProfileIds.filter(id => selectedForRun.has(id)).length;
    const allSelected = allGroupProfileIds.length > 0 && selectedCount === allGroupProfileIds.length;
    const someSelected = selectedCount > 0 && !allSelected;

    const toggleGroupSelect = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedForRun(prev => {
        const next = new Set(prev);
        if (allSelected) allGroupProfileIds.forEach(id => next.delete(id));
        else allGroupProfileIds.forEach(id => next.add(id));
        return next;
      });
    };

    return (
      // Outer wrapper is the drop zone — covers header AND children so the whole group area accepts drops
      <div
        key={g.id}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverGroupId(g.id); setDragOverUngrouped(false); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroupId(null); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDropOnGroup(g.id); }}
        className={`transition-colors ${isDragOver ? 'bg-cyan-900/10 outline outline-1 outline-cyan-700/40 rounded' : ''}`}
      >
        {/* Group header — draggable to move the group itself */}
        <div
          draggable={!globalRunning}
          onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', `g:${g.id}`); dragGroupIdRef.current = g.id; dragProfileIdRef.current = null; }}
          onDragEnd={() => { dragGroupIdRef.current = null; setDragOverGroupId(null); setDragOverUngrouped(false); }}
          onClick={() => !isRenamingGroup && toggleGroupExpanded(g.id)}
          style={{ paddingLeft: 8 + depth * 10 }}
          className={`group flex items-center gap-1 pr-2 py-1.5 cursor-pointer transition-colors border-l-2 ${
            isDragOver ? 'border-cyan-500' : 'hover:bg-gray-800/30 border-transparent'
          }`}
        >
          {isExpanded ? <ChevronDown size={10} className="text-gray-500 shrink-0" /> : <ChevronRight size={10} className="text-gray-500 shrink-0" />}
          {isExpanded ? <FolderOpen size={10} className="text-cyan-500 shrink-0" /> : <Folder size={10} className="text-cyan-600 shrink-0" />}
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected; }}
            onChange={() => {}}
            onClick={toggleGroupSelect}
            disabled={globalRunning || allGroupProfileIds.length === 0}
            className="accent-purple-500 cursor-pointer shrink-0"
          />
          {isRenamingGroup ? (
            <input
              value={groupNameInput}
              onChange={e => setGroupNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { setGroups(prev => prev.map(x => x.id === g.id ? { ...x, name: groupNameInput.trim() || x.name } : x)); setRenamingGroupId(null); }
                if (e.key === 'Escape') setRenamingGroupId(null);
              }}
              autoFocus
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 bg-gray-800 border border-cyan-600 rounded px-1 py-0.5 text-gray-200 text-[9px] outline-none"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate text-[9px] text-cyan-400 font-bold">{g.name}</span>
          )}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => addProfileToGroup(g.id)} disabled={globalRunning} title={t('can.autoNewScenario')} className="p-0.5 text-gray-600 hover:text-purple-400"><Plus size={9} /></button>
            <button onClick={() => addGroup(g.id)} disabled={globalRunning} title={t('can.autoGroupAdd')} className="p-0.5 text-gray-600 hover:text-cyan-400"><FolderPlus size={9} /></button>
            <button onClick={() => { setGroupNameInput(g.name); setRenamingGroupId(g.id); }} disabled={globalRunning} className="p-0.5 text-gray-600 hover:text-gray-300"><Pencil size={9} /></button>
            <button onClick={() => deleteGroup(g.id)} disabled={globalRunning} className="p-0.5 text-gray-700 hover:text-red-400"><XIcon size={9} /></button>
          </div>
        </div>

        {/* Children */}
        {isExpanded && (
          <div>
            {childGroups.map(cg => renderGroup(cg, depth + 1))}
            {groupProfiles.map(p => renderProfile(p, depth + 1))}
            {childGroups.length === 0 && groupProfiles.length === 0 && (
              <div style={{ paddingLeft: 22 + depth * 10 }} className="py-1 text-[9px] text-gray-700 italic">{t('can.autoGroupEmpty')}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-row h-full bg-gray-950 font-mono text-[11px] overflow-hidden">

      {/* ── Left sidebar: scenario list ── */}
      <div className="w-48 shrink-0 flex flex-col border-r border-gray-800 bg-gray-900/30 overflow-hidden">
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-2 py-2 border-b border-gray-800 shrink-0">
          <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">{t('can.autoScenarios')}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => addGroup()} disabled={globalRunning} title={t('can.autoGroupAdd')} className="p-0.5 text-gray-600 hover:text-cyan-400 disabled:opacity-30"><FolderPlus size={11} /></button>
            <button onClick={() => addProfileToGroup(undefined)} disabled={globalRunning} title={t('can.autoNewScenario')} className="p-0.5 text-gray-600 hover:text-purple-400 disabled:opacity-30"><Plus size={11} /></button>
          </div>
        </div>

        {/* Scenario list */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* Top-level groups */}
          {groups.filter(g => !g.parentId).map(g => renderGroup(g))}

          {/* Ungrouped profiles — also a drop target */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOverUngrouped(true); setDragOverGroupId(null); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverUngrouped(false); }}
            onDrop={e => { e.preventDefault(); handleDropOnUngrouped(); }}
            className={`min-h-[32px] transition-colors ${dragOverUngrouped ? 'bg-purple-900/20 border-l-2 border-purple-500' : ''}`}
          >
            {profiles.filter(p => !p.groupId).map(p => renderProfile(p))}
            {dragOverUngrouped && profiles.filter(p => !p.groupId).length === 0 && (
              <div className="py-2 text-center text-[9px] text-gray-700 italic border border-dashed border-gray-700 rounded mx-2 my-1">{t('can.autoUngrouped')}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: controls + editor ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Top control bar ── */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900/60">
          <span className="text-[10px] text-purple-300 font-bold truncate">{editingProfile?.name}</span>
          <div className="ml-auto flex items-center gap-2">
            {allDone && allResults.length > 0 && (
              <button onClick={() => { setReportProfileId(null); setShowReport(true); }} className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-900/40 text-cyan-400 border border-cyan-800/60 hover:bg-cyan-900/60 rounded font-bold text-[10px]">
                <FileText size={11} />{t('can.autoViewReport')}
              </button>
            )}
            {globalRunning ? (
              <button onClick={stopAll} className="flex items-center gap-1.5 px-3 py-1 bg-rose-900/40 text-rose-400 border border-rose-800/60 hover:bg-rose-900/60 rounded font-bold">
                <Square size={11} className="fill-current" />{t('common.stop')}
              </button>
            ) : (
              <button onClick={startAll} disabled={!canStart} className="flex items-center gap-1.5 px-3 py-1 bg-purple-900/40 text-purple-400 border border-purple-800/60 hover:bg-purple-900/60 rounded font-bold disabled:opacity-30">
                <Play size={11} className="fill-current" />
                {t('common.start')} {selectedForRun.size > 1 ? `(${selectedForRun.size})` : ''}
              </button>
            )}
            <button onClick={addStep} disabled={globalRunning} className="flex items-center gap-1.5 px-3 py-1 bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 rounded disabled:opacity-30">
              <Plus size={11} />{t('common.add')}
            </button>
          </div>
        </div>

        {/* ── Running: side-by-side panels ── */}
        {(globalRunning || allDone) && Object.keys(runStates).length > 0 && (
          <div className="shrink-0 flex h-44 border-b border-gray-800 overflow-hidden">
            {profiles.filter(p => runStates[p.id]).map((profile, pIdx) => {
              const rs = runStates[profile.id];
              if (!rs) return null;
              const total = profile.steps.length;
              const done = rs.results.length;
              const passed = rs.results.filter(r => r.passed).length;
              const failed = rs.results.filter(r => !r.passed).length;
              const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
              const group = groups.find(g => g.id === profile.groupId);
              return (
                <div key={profile.id} className={`flex flex-col flex-1 min-w-0 p-2 overflow-hidden ${pIdx > 0 ? 'border-l border-gray-800' : ''}`}>
                  <div className="flex items-center gap-2 mb-1 shrink-0">
                    {group && <span className="text-[8px] text-cyan-600 font-bold">{group.name} /</span>}
                    <span className="text-[10px] font-bold text-purple-300 truncate">{profile.name}</span>
                    {rs.done
                      ? failed === 0 ? <CheckCircle2 size={11} className="text-emerald-500 shrink-0" /> : <XCircle size={11} className="text-rose-500 shrink-0" />
                      : <span className="text-[9px] text-gray-500">{done}/{total}</span>}
                    {rs.done && (
                      <button onClick={() => { setReportProfileId(profile.id); setShowReport(true); }} className="ml-auto p-0.5 text-gray-600 hover:text-cyan-400"><FileText size={10} /></button>
                    )}
                  </div>
                  <div className="h-1 bg-gray-800 rounded mb-1.5 shrink-0">
                    <div className={`h-full rounded transition-all duration-300 ${rs.done && failed > 0 ? 'bg-rose-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="overflow-y-auto space-y-0.5 flex-1 min-h-0">
                    {profile.steps.map((step) => {
                      const result = rs.results.find(r => r.stepId === step.id);
                      const isActive = rs.activeStepId === step.id;
                      return (
                        <div key={step.id} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] ${
                          isActive ? 'bg-purple-900/30 text-purple-300' :
                          result?.passed ? 'text-emerald-500' :
                          result?.passed === false ? 'text-rose-400' :
                          'text-gray-600'
                        }`}>
                          {isActive ? <span className="animate-pulse">⏳</span> : result ? (result.passed ? '✓' : '✗') : '○'}
                          <span className="truncate">{formatStepLabel(step, nodes)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {rs.done && (
                    <div className={`text-[9px] font-bold mt-1 shrink-0 ${failed === 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                      ✓{passed} ✗{failed}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step editor ── */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {!editingProfile || editingProfile.steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
              <Clock size={24} className="text-gray-700" />
              <span>{t('can.noAutomationSteps')}</span>
            </div>
          ) : editingProfile.steps.map((step, idx) => {
            const mode = editingProfile.mode;
            return (
              <div key={step.id} className="p-3 rounded-lg border bg-gray-900/50 border-gray-800">
                <div className="flex items-start gap-3">
                  <div className="text-gray-500 font-bold w-14 shrink-0 pt-1.5 text-center text-[10px]">
                    {mode === 'sequential' ? `#${idx + 1}` : formatTime(step.timeMs)}
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex gap-2 flex-wrap items-center">
                      <select value={step.type} onChange={e => updateStep(step.id, { type: e.target.value as CANAutoStep['type'] })} disabled={globalRunning}
                        className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300 outline-none focus:border-purple-500">
                        <option value="send-frame">{t('can.autoSendFrame')}</option>
                        <option value="expect-frame">{t('can.autoExpectFrame')}</option>
                        <option value="fault">{t('can.injectFault')}</option>
                        <option value="recover">{t('can.recoverNode')}</option>
                      </select>
                      <div className="flex items-center gap-1">
                        <input type="number" value={step.timeMs} min={0} step={mode === 'sequential' ? 100 : 1000}
                          onChange={e => updateStep(step.id, { timeMs: Math.max(0, Number(e.target.value)) })} disabled={globalRunning}
                          className="w-20 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-400 outline-none focus:border-purple-500 tabular-nums" />
                        <span className="text-gray-600 text-[9px]">{mode === 'sequential' ? 'ms gecikme' : 'ms'}</span>
                      </div>
                    </div>

                    {(step.type === 'fault' || step.type === 'recover') && (
                      <div className="flex gap-2 flex-wrap">
                        <select value={step.nodeId} onChange={e => updateStep(step.id, { nodeId: Number(e.target.value) })} disabled={globalRunning}
                          className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300 outline-none focus:border-purple-500">
                          {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                        </select>
                        {step.type === 'fault' ? (
                          <select value={step.faultType} onChange={e => updateStep(step.id, { faultType: e.target.value as CANFaultType })} disabled={globalRunning}
                            className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-rose-400 outline-none focus:border-rose-500">
                            {Object.entries(FAULT_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
                          </select>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-500 bg-emerald-950/30 border border-emerald-900/50 rounded px-2 py-1 text-[10px]">✓ {t('can.normalOperation')}</span>
                        )}
                      </div>
                    )}

                    {step.type === 'send-frame' && (
                      <div className="flex gap-2 flex-wrap items-center">
                        <Send size={11} className="text-cyan-600 shrink-0" />
                        <span className="text-gray-600 text-[9px]">ID:</span>
                        <input value={`0x${(step.sendArbId ?? 0).toString(16).toUpperCase().padStart(3, '0')}`}
                          onChange={e => { const v = parseInt(e.target.value.replace(/^0x/i, ''), 16); if (!isNaN(v)) updateStep(step.id, { sendArbId: v }); }}
                          disabled={globalRunning} className="w-24 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-cyan-400 outline-none focus:border-cyan-600" />
                        <span className="text-gray-600 text-[9px]">Data:</span>
                        <input value={step.sendDataHex ?? ''} onChange={e => updateStep(step.id, { sendDataHex: e.target.value })}
                          disabled={globalRunning} placeholder="01 02 03 04"
                          className="flex-1 min-w-24 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300 outline-none focus:border-cyan-600" />
                      </div>
                    )}

                    {step.type === 'expect-frame' && (
                      <div className="flex gap-2 flex-wrap items-center">
                        <Radio size={11} className="text-amber-500 shrink-0" />
                        <span className="text-gray-600 text-[9px]">ID:</span>
                        <input value={`0x${(step.expectArbId ?? 0).toString(16).toUpperCase().padStart(3, '0')}`}
                          onChange={e => { const v = parseInt(e.target.value.replace(/^0x/i, ''), 16); if (!isNaN(v)) updateStep(step.id, { expectArbId: v }); }}
                          disabled={globalRunning} className="w-24 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-amber-400 outline-none focus:border-amber-600" />
                        <span className="text-gray-600 text-[9px]">Data:</span>
                        <input value={step.expectDataHex ?? ''} onChange={e => updateStep(step.id, { expectDataHex: e.target.value })}
                          disabled={globalRunning} placeholder="01 02 …"
                          className="flex-1 min-w-20 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300 outline-none focus:border-amber-600" />
                        <span className="text-gray-600 text-[9px]">Timeout:</span>
                        <input type="number" value={step.expectTimeoutMs ?? 2000} min={500} step={500}
                          onChange={e => updateStep(step.id, { expectTimeoutMs: Number(e.target.value) })} disabled={globalRunning}
                          className="w-16 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-400 outline-none focus:border-amber-600" />
                        <span className="text-gray-600 text-[9px]">ms</span>
                      </div>
                    )}
                  </div>

                  <button onClick={() => removeStep(step.id)} disabled={globalRunning}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors disabled:opacity-30 shrink-0 mt-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Report modal */}
      {showReport && (() => {
        const targetProfile = reportProfileId ? profiles.find(p => p.id === reportProfileId) : null;
        const reportResults = reportProfileId ? (runStates[reportProfileId]?.results ?? []) : allResults;
        const reportProfiles = targetProfile
          ? [{ id: targetProfile.id, name: targetProfile.name, groupId: targetProfile.groupId }]
          : profiles.filter(p => runStates[p.id]).map(p => ({ id: p.id, name: p.name, groupId: p.groupId }));
        return (
          <CANAutomationReport
            results={reportResults}
            profiles={reportProfiles}
            groups={groups}
            runAt={runAt}
            onClose={() => setShowReport(false)}
          />
        );
      })()}
    </div>
  );
}
