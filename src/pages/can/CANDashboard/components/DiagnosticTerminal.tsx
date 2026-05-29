import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Plus, Send, Trash2, Wand2 } from 'lucide-react';
import type { CANFrame } from '../../../../can/types/CANFrame';
import type { CANNode } from '../../../../can/types/CANNode';
import type { UDSDiagnosticConfig, UDSDidResponse } from '../../../../can/types/UDS';
import { useTranslation } from '../../../../i18n/context';

interface DiagnosticTerminalProps {
  frames: CANFrame[];
  nodes: CANNode[];
  isRunning: boolean;
  config: UDSDiagnosticConfig;
  onSendRequest: (requestId: number, payload: number[]) => void;
  onSetConfig: (config: UDSDiagnosticConfig) => void;
}

type RequestPreset = 'session' | 'read-did' | 'read-dtc' | 'raw';

export function DiagnosticTerminal({ frames, nodes, isRunning, config, onSendRequest, onSetConfig }: DiagnosticTerminalProps) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<RequestPreset>('read-did');
  const [requestId, setRequestId] = useState(formatId(config.testerRequestId));
  // Keep the input in sync when the parent updates config (e.g. loading a preset).
  const prevTesterIdRef = useRef(config.testerRequestId);
  useEffect(() => {
    if (config.testerRequestId !== prevTesterIdRef.current) {
      prevTesterIdRef.current = config.testerRequestId;
      setRequestId(formatId(config.testerRequestId));
    }
  }, [config.testerRequestId]);
  const [sessionType, setSessionType] = useState('03');
  const [did, setDid] = useState('F190');
  const [dtcMask, setDtcMask] = useState('FF');
  const [rawPayload, setRawPayload] = useState(t('uds.defaultRawPayload'));
  const [error, setError] = useState('');

  const diagnosticFrames = useMemo(
    () => frames
      .filter(frame => frame.arbitrationId === config.testerRequestId || frame.arbitrationId === config.ecuResponseId)
      .slice(0, 80),
    [frames, config.ecuResponseId, config.testerRequestId]
  );

  const updateConfig = (patch: Partial<UDSDiagnosticConfig>) => {
    onSetConfig({ ...config, ...patch });
  };

  const send = () => {
    setError('');
    const parsedRequestId = parseHex(requestId);
    if (parsedRequestId === null || parsedRequestId > 0x7ff) {
      setError(t('uds.errorInvalidId'));
      return;
    }

    const payload = buildPayload(preset, sessionType, did, dtcMask, rawPayload);
    if (!payload) {
      setError(t('uds.errorInvalidPayload'));
      return;
    }

    onSendRequest(parsedRequestId, payload);
  };

  const syncIds = () => {
    const parsedRequestId = parseHex(requestId);
    if (parsedRequestId === null || parsedRequestId > 0x7ff) return;
    updateConfig({
      testerRequestId: parsedRequestId,
      ecuResponseId: parsedRequestId >= 0x7e0 && parsedRequestId <= 0x7e7 ? parsedRequestId + 8 : config.ecuResponseId,
    });
  };

  const updateDidResponse = (id: string, patch: Partial<UDSDidResponse>) => {
    updateConfig({
      didResponses: config.didResponses.map(entry => entry.id === id ? { ...entry, ...patch } : entry),
    });
  };

  const addDidResponse = () => {
    updateConfig({
      didResponses: [
        ...config.didResponses,
        {
          id: Math.random().toString(36).slice(2),
          did: 0xf1a0,
          label: t('uds.customDid'),
          encoding: 'ascii',
          value: 'OK',
          enabled: true,
        },
      ],
    });
  };

  const removeDidResponse = (id: string) => {
    updateConfig({ didResponses: config.didResponses.filter(entry => entry.id !== id) });
  };

  const presets = [
    ['session', '0x10'],
    ['read-did', '0x22'],
    ['read-dtc', '0x19'],
    ['raw', t('uds.presetRaw')],
  ] as const;

  return (
    <div className="h-full min-h-0 bg-gray-950 text-gray-200 font-mono text-[11px] grid grid-cols-[minmax(320px,420px)_1fr] overflow-hidden">
      <div className="min-h-0 overflow-y-auto border-r border-gray-800 bg-gray-900/30">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-gray-100 font-bold uppercase tracking-widest flex items-center gap-2">
              <Activity size={14} className="text-cyan-400" />
              {t('uds.title')}
            </h3>
            <p className="text-gray-500 text-[9px] mt-0.5">{t('uds.transport')}</p>
          </div>
          <button
            onClick={() => updateConfig({ autoRespond: !config.autoRespond })}
            className={`px-2 py-1 rounded border text-[10px] font-bold ${config.autoRespond ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60' : 'bg-gray-950 text-gray-500 border-gray-700'}`}
          >
            {config.autoRespond ? t('uds.symphonyOn') : t('uds.symphonyOff')}
          </button>
        </div>

        <div className="p-4 space-y-4">
          <section className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-gray-500 uppercase text-[9px]">{t('uds.requestId')}</span>
                <input value={requestId} onChange={e => setRequestId(e.target.value)} onBlur={syncIds} className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-yellow-400 outline-none focus:border-cyan-600" />
              </label>
              <label className="space-y-1">
                <span className="text-gray-500 uppercase text-[9px]">{t('uds.responseId')}</span>
                <input
                  value={formatId(config.ecuResponseId)}
                  onChange={e => {
                    const parsed = parseHex(e.target.value);
                    if (parsed !== null && parsed <= 0x1fffffff) updateConfig({ ecuResponseId: parsed });
                  }}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-yellow-400 outline-none focus:border-cyan-600"
                />
              </label>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {presets.map(([id, label]) => (
                <button key={id} onClick={() => setPreset(id)} className={`px-2 py-1.5 rounded border font-bold ${preset === id ? 'bg-cyan-950/40 text-cyan-300 border-cyan-700' : 'bg-gray-950 text-gray-500 border-gray-800 hover:text-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>

            {preset === 'session' && (
              <label className="space-y-1 block">
                <span className="text-gray-500 uppercase text-[9px]">{t('uds.sessionType')}</span>
                <select value={sessionType} onChange={e => setSessionType(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-gray-200 outline-none focus:border-cyan-600">
                  <option value="01">{t('uds.sessionDefault')}</option>
                  <option value="02">{t('uds.sessionProgramming')}</option>
                  <option value="03">{t('uds.sessionExtended')}</option>
                </select>
              </label>
            )}

            {preset === 'read-did' && (
              <label className="space-y-1 block">
                <span className="text-gray-500 uppercase text-[9px]">{t('uds.dataIdentifier')}</span>
                <input value={did} onChange={e => setDid(e.target.value)} placeholder="F190" className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-green-400 outline-none focus:border-cyan-600" />
              </label>
            )}

            {preset === 'read-dtc' && (
              <label className="space-y-1 block">
                <span className="text-gray-500 uppercase text-[9px]">{t('uds.dtcStatusMask')}</span>
                <input value={dtcMask} onChange={e => setDtcMask(e.target.value)} placeholder="FF" className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-green-400 outline-none focus:border-cyan-600" />
              </label>
            )}

            {preset === 'raw' && (
              <label className="space-y-1 block">
                <span className="text-gray-500 uppercase text-[9px]">{t('uds.payload')}</span>
                <input value={rawPayload} onChange={e => setRawPayload(e.target.value)} placeholder={t('uds.defaultRawPayload')} className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-green-400 outline-none focus:border-cyan-600" />
              </label>
            )}

            <button onClick={send} disabled={!isRunning} className="w-full flex items-center justify-center gap-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded px-3 py-2 font-bold">
              <Send size={13} />
              {t('uds.sendRequest')}
            </button>
            {error && <div className="text-red-400 text-[10px]">{error}</div>}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Wand2 size={12} className="text-emerald-400" />
                {t('uds.symphonyResponses')}
              </h4>
              <button onClick={addDidResponse} className="p-1.5 text-gray-500 hover:text-emerald-400 rounded hover:bg-gray-800" title={t('uds.addDid')}>
                <Plus size={13} />
              </button>
            </div>

            <label className="space-y-1 block">
              <span className="text-gray-500 uppercase text-[9px]">{t('uds.targetNode')}</span>
              <select
                value={config.targetNodeId ?? ''}
                onChange={e => updateConfig({ targetNodeId: e.target.value ? Number(e.target.value) : null })}
                className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-gray-200 outline-none focus:border-emerald-600"
              >
                <option value="">{t('uds.autoFromRequestId')}</option>
                {nodes.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>

            <div className="space-y-2">
              {config.didResponses.map(entry => (
                <div key={entry.id} className="border border-gray-800 rounded bg-gray-950/70 p-2 space-y-2">
                  <div className="grid grid-cols-[72px_1fr_28px] gap-2">
                    <input
                      value={entry.did.toString(16).toUpperCase().padStart(4, '0')}
                      onChange={e => {
                        const parsed = parseHex(e.target.value);
                        if (parsed !== null) updateDidResponse(entry.id, { did: parsed });
                      }}
                      className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-yellow-400 outline-none focus:border-emerald-600"
                    />
                    <input value={entry.label} onChange={e => updateDidResponse(entry.id, { label: e.target.value })} className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-gray-300 outline-none focus:border-emerald-600" />
                    <button onClick={() => removeDidResponse(entry.id)} className="text-gray-600 hover:text-red-400 flex items-center justify-center rounded hover:bg-gray-800">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="grid grid-cols-[88px_1fr_56px] gap-2">
                    <select value={entry.encoding} onChange={e => updateDidResponse(entry.id, { encoding: e.target.value as UDSDidResponse['encoding'] })} className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-gray-300 outline-none">
                      <option value="ascii">{t('uds.encodingAscii')}</option>
                      <option value="hex">{t('uds.encodingHex')}</option>
                      <option value="vitals">{t('uds.encodingVitals')}</option>
                    </select>
                    <input value={entry.value} onChange={e => updateDidResponse(entry.id, { value: e.target.value })} className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-green-400 outline-none focus:border-emerald-600" />
                    <label className="flex items-center justify-center gap-1 text-gray-500">
                      <input type="checkbox" checked={entry.enabled} onChange={e => updateDidResponse(entry.id, { enabled: e.target.checked })} />
                      {t('uds.enabledLabel')}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="min-h-0 flex flex-col">
        <div className="grid grid-cols-[84px_82px_58px_1fr] gap-2 px-3 py-2 border-b border-gray-800 bg-gray-950/90 text-gray-600 uppercase tracking-widest text-[10px]">
          <span>{t('uds.colTime')}</span>
          <span>{t('uds.colId')}</span>
          <span>{t('uds.colPci')}</span>
          <span>{t('uds.colData')}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {diagnosticFrames.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-600">{t('uds.noTraffic')}</div>
          ) : diagnosticFrames.map(frame => (
            <div key={frame.uid} className={`grid grid-cols-[84px_82px_58px_1fr] gap-2 px-3 py-1 border-b border-gray-900 ${frame.nodeId === -2 ? 'bg-emerald-950/10' : 'bg-cyan-950/10'}`}>
              <span className="text-gray-600">{new Date(frame.timestamp).toISOString().slice(11, 23)}</span>
              <span className="text-yellow-400">0x{formatId(frame.arbitrationId)}</span>
              <span className={pciClass(frame.data[0])}>{pciLabel(frame.data[0])}</span>
              <span className="text-green-400 tracking-wider break-all">{frame.data.map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildPayload(preset: RequestPreset, sessionType: string, did: string, dtcMask: string, rawPayload: string): number[] | null {
  if (preset === 'session') {
    const sub = parseHex(sessionType);
    return sub === null ? null : [0x10, sub & 0xff];
  }
  if (preset === 'read-did') {
    const parsedDid = parseHex(did);
    return parsedDid === null || parsedDid > 0xffff ? null : [0x22, (parsedDid >> 8) & 0xff, parsedDid & 0xff];
  }
  if (preset === 'read-dtc') {
    const mask = parseHex(dtcMask);
    return mask === null ? null : [0x19, 0x02, mask & 0xff];
  }
  return parseHexBytes(rawPayload);
}

function parseHexBytes(value: string): number[] | null {
  const parts = value.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const bytes = parts.map(parseHex);
  if (bytes.some(byte => byte === null || byte > 0xff)) return null;
  return bytes as number[];
}

function parseHex(value: string): number | null {
  const clean = value.trim().replace(/^0x/i, '');
  if (!/^[\da-f]+$/i.test(clean)) return null;
  return parseInt(clean, 16);
}

function formatId(id: number): string {
  return id.toString(16).toUpperCase().padStart(3, '0');
}

function pciLabel(byte: number): string {
  const type = (byte & 0xf0) >> 4;
  if (type === 0) return 'SF';
  if (type === 1) return 'FF';
  if (type === 2) return 'CF';
  if (type === 3) return 'FC';
  return '?';
}

function pciClass(byte: number): string {
  const type = (byte & 0xf0) >> 4;
  if (type === 3) return 'text-blue-400';
  if (type === 2) return 'text-purple-400';
  if (type === 1) return 'text-orange-400';
  return 'text-cyan-400';
}
