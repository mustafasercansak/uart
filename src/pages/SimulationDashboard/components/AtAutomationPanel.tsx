import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Square, CheckCircle2, XCircle, Clock, Loader2,
  TerminalSquare, ChevronDown, ChevronRight, Globe, Trash2, MapPin,
  Phone, PhoneOff, Signal, BookUser, MessageSquare, Zap,
} from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import { useTranslation } from '../../../i18n/context';
import type { ConversationEntry } from '../../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PresetStep {
  type: 'send' | 'expect' | 'wait';
  payload: string;
  label?: string;
}

interface PresetGroup {
  id: string;
  labelKey: string;
  color: string;
  steps: PresetStep[];
}

// ─── Non-HTTP preset sequences ─────────────────────────────────────────────────

const PRESETS: PresetGroup[] = [
  {
    id: 'init',
    labelKey: 'atAuto.groups.init',
    color: 'emerald',
    steps: [
      { type: 'send',   payload: 'ATE0',       label: 'Echo off' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CMEE=2',  label: 'Verbose errors' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CFUN?',   label: 'Phone functionality' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
  {
    id: 'network',
    labelKey: 'atAuto.groups.network',
    color: 'blue',
    steps: [
      { type: 'send',   payload: 'AT+CREG?',   label: 'Registration' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+COPS?',   label: 'Operator' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CSQ',     label: 'Signal quality' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CGATT?',  label: 'GPRS attach' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
  {
    id: 'sms',
    labelKey: 'atAuto.groups.sms',
    color: 'violet',
    steps: [
      { type: 'send',   payload: 'AT+CMGF=1',       label: 'Text mode' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CMGL="ALL"',   label: 'List all SMS' },
      { type: 'expect', payload: 'OK | 3000' },
      { type: 'send',   payload: 'AT+CMGR=1',       label: 'Read #1' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
  {
    id: 'data',
    labelKey: 'atAuto.groups.data',
    color: 'amber',
    steps: [
      { type: 'send',   payload: 'AT+CGATT=1',                     label: 'Attach GPRS' },
      { type: 'expect', payload: 'OK | 2000' },
      { type: 'send',   payload: 'AT+CGDCONT=1,"IP","internet"',   label: 'Set APN' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+SAPBR=3,1,"CONTYPE","GPRS"', label: 'Bearer type' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+SAPBR=3,1,"APN","internet"', label: 'Bearer APN' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+SAPBR=1,1',                   label: 'Open bearer' },
      { type: 'expect', payload: 'OK | 3000' },
      { type: 'send',   payload: 'AT+SAPBR=2,1',                   label: 'Query IP' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
  {
    id: 'info',
    labelKey: 'atAuto.groups.info',
    color: 'rose',
    steps: [
      { type: 'send',   payload: 'ATI',       label: 'Model info' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+GMI',    label: 'Manufacturer' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CGSN',   label: 'IMEI' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CIMI',   label: 'IMSI' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CNUM',   label: 'Phone number' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CCLK?',  label: 'Clock' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
  {
    id: 'pin',
    labelKey: 'atAuto.groups.pin',
    color: 'amber',
    steps: [
      { type: 'send',   payload: 'AT+CPIN?',       label: 'PIN durumu' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CLCK="SC",1,"1234"', label: 'SIM kilitle' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CPIN?',       label: 'PIN gerekli?' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CPIN=1234',   label: 'PIN gir' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CLCK="SC",0,"1234"', label: 'SIM kilidi kaldır' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
  {
    id: 'psm',
    labelKey: 'atAuto.groups.psm',
    color: 'blue',
    steps: [
      { type: 'send',   payload: 'AT+CPSMS?',                      label: 'PSM sorgula' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CPSMS=1,,,"00001010","00000101"', label: 'PSM aç (TAU=5dk, Active=10s)' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CEDRXS=2,4,"0010"',           label: 'eDRX aç (LTE-M)' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CEDRXS?',                     label: 'eDRX sorgula' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CEDRXRDP',                    label: 'eDRX dinamik' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
  {
    id: 'phonebook',
    labelKey: 'atAuto.groups.phonebook',
    color: 'violet',
    steps: [
      { type: 'send',   payload: 'AT+CPBS="SM"',        label: 'SIM depolama seç' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CPBS?',            label: 'Depolama bilgisi' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CPBR=1,5',         label: 'Kayıtları listele' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CPBW=4,"+905551111",145,"Test"', label: 'Yeni kayıt yaz' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CPBR=4',           label: 'Yeni kaydı oku' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CPBW=4',           label: 'Kaydı sil' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
  {
    id: 'cell',
    labelKey: 'atAuto.groups.cell',
    color: 'emerald',
    steps: [
      { type: 'send',   payload: 'AT+CREG=2',   label: 'Konum bilgisi etkin' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CREG?',    label: 'LAC/CI ile sorgula' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CGREG?',   label: 'GPRS kayıt' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CEREG?',   label: 'LTE kayıt' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+COPS=?',   label: 'Operatör tara' },
      { type: 'expect', payload: 'OK | 2000' },
    ],
  },
  {
    id: 'pdu',
    labelKey: 'atAuto.groups.pdu',
    color: 'rose',
    steps: [
      { type: 'send',   payload: 'AT+CMGF=0',   label: 'PDU moduna geç' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CMGL=4',   label: 'Tüm SMS (PDU)' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CMGR=1',   label: '#1 SMS PDU oku' },
      { type: 'expect', payload: 'OK | 1000' },
      { type: 'send',   payload: 'AT+CMGF=1',   label: 'Text moduna dön' },
      { type: 'expect', payload: 'OK | 1000' },
    ],
  },
];

const COLOR_MAP: Record<string, { btn: string; badge: string; step: string }> = {
  emerald: {
    btn: 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/60',
    badge: 'bg-emerald-900/50 text-emerald-400',
    step: 'text-emerald-400',
  },
  blue: {
    btn: 'bg-blue-900/30 border-blue-700/40 text-blue-300 hover:bg-blue-900/60',
    badge: 'bg-blue-900/50 text-blue-400',
    step: 'text-blue-400',
  },
  violet: {
    btn: 'bg-violet-900/30 border-violet-700/40 text-violet-300 hover:bg-violet-900/60',
    badge: 'bg-violet-900/50 text-violet-400',
    step: 'text-violet-400',
  },
  amber: {
    btn: 'bg-amber-900/30 border-amber-700/40 text-amber-300 hover:bg-amber-900/60',
    badge: 'bg-amber-900/50 text-amber-400',
    step: 'text-amber-400',
  },
  rose: {
    btn: 'bg-rose-900/30 border-rose-700/40 text-rose-300 hover:bg-rose-900/60',
    badge: 'bg-rose-900/50 text-rose-400',
    step: 'text-rose-400',
  },
  orange: {
    btn: 'bg-orange-900/30 border-orange-700/40 text-orange-300 hover:bg-orange-900/60',
    badge: 'bg-orange-900/50 text-orange-400',
    step: 'text-orange-400',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'success' | 'fail';

/**
 * Decode hex bytes to printable ASCII for pattern matching.
 * rawHex is space-separated like "0D 0A 4F 4B 0D 0A".
 */
function hexToText(rawHex: string): string {
  return rawHex
    .trim()
    .split(/\s+/)
    .map(h => {
      const n = parseInt(h, 16);
      return n >= 0x20 && n < 0x7f ? String.fromCharCode(n) : ' ';
    })
    .join('');
}

/**
 * waitForPattern scans only entries added AFTER baseCount to avoid
 * matching stale OK/ERROR responses from previous commands.
 * Matching is done against decoded ASCII, NOT raw hex.
 */
async function waitForPattern(
  pattern: string,
  timeoutMs: number,
  getConvLogs: () => ConversationEntry[],
  cancelRef: { current: boolean },
  baseCount: number,
): Promise<void> {
  const p = pattern.trim().toUpperCase();
  const deadline = Date.now() + Math.max(300, timeoutMs);
  while (Date.now() < deadline) {
    if (cancelRef.current) return;
    const logs = getConvLogs();
    // logs is newest-first; new entries are at the front
    const newEntries = logs.slice(0, Math.max(0, logs.length - baseCount));
    if (newEntries.some(l => l.type === 'rx' && hexToText(l.rawHex).toUpperCase().includes(p))) return;
    await new Promise(r => setTimeout(r, 40));
  }
  if (!cancelRef.current) throw new Error(`Timeout: ${pattern}`);
}

async function executePreset(
  steps: PresetStep[],
  sendFn: (text: string) => void,
  getConvLogs: () => ConversationEntry[],
  onStep: (idx: number, status: StepStatus, error?: string) => void,
  cancelRef: { current: boolean },
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    if (cancelRef.current) break;
    onStep(i, 'running');
    const step = steps[i];
    try {
      if (step.type === 'send') {
        sendFn(step.payload + '\r\n');
        await new Promise(r => setTimeout(r, 150));
      } else if (step.type === 'wait') {
        await new Promise(r => setTimeout(r, parseInt(step.payload) || 500));
      } else if (step.type === 'expect') {
        const [pat, ms] = step.payload.split('|').map(p => p.trim());
        const base = getConvLogs().length;
        await waitForPattern(pat, parseInt(ms || '2000', 10), getConvLogs, cancelRef, base);
      }
      onStep(i, 'success');
    } catch (err) {
      onStep(i, 'fail', err instanceof Error ? err.message : String(err));
      return;
    }
  }
}

// ─── HTTP steps used in the transcript display ───────────────────────────────

interface HttpStep { label: string; status: StepStatus; error?: string }

const EMPTY_HTTP_STEPS: HttpStep[] = [];

// ─── Transcript ───────────────────────────────────────────────────────────────

function hexToReadable(hex: string): string {
  return hex
    .trim()
    .split(/\s+/)
    .map(h => {
      const n = parseInt(h, 16);
      if (n === 0x0d || n === 0x0a) return '';
      return n >= 0x20 && n < 0x7f ? String.fromCharCode(n) : '';
    })
    .join('')
    .trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RunState { groupId: string; statuses: StepStatus[]; errors: (string | undefined)[] }

export default function AtAutomationPanel() {
  const { t } = useTranslation();
  const { state, sendTextData, automation, clearConversation, setGpsPosition, setGpsWalkMode, simulateIncomingCall, setRoaming } = useSimulation();
  const { conversationLogs, sequences, serialConnected, networkConnected } = state;
  const isConnected = serialConnected || networkConnected;

  // Preset runner
  const [runState, setRunState] = useState<RunState | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const anyRunning = runState !== null;

  // HTTP builder state
  const [httpExpanded, setHttpExpanded] = useState(false);
  const [httpMethod, setHttpMethod] = useState<'GET' | 'POST'>('GET');
  const [httpUrl, setHttpUrl] = useState('http://example.com/api');
  const [httpBody, setHttpBody] = useState('{"key":"value"}');
  const [httpContentType, setHttpContentType] = useState('application/json');
  const [httpSteps, setHttpSteps] = useState<HttpStep[]>(EMPTY_HTTP_STEPS);
  const [httpRunning, setHttpRunning] = useState(false);
  const cancelHttpRef = useRef(false);

  // GPS panel state
  const [gpsExpanded, setGpsExpanded] = useState(false);
  const [gpsLat, setGpsLat] = useState('41.0082376');
  const [gpsLon, setGpsLon] = useState('28.9783589');
  const [gpsAlt, setGpsAlt] = useState('34.2');
  const [gpsWalk, setGpsWalk] = useState(false);

  // PIN panel state
  const [pinExpanded, setPinExpanded] = useState(false);
  const [pinCode, setPinCode] = useState('1234');
  const [pinLocked, setPinLocked] = useState(false);

  // Voice call panel state
  const [callExpanded, setCallExpanded] = useState(false);
  const [callNumber, setCallNumber] = useState('+905559998877');

  // Roaming panel state
  const [roamingExpanded, setRoamingExpanded] = useState(false);
  const [roamingEnabled, setRoamingEnabled] = useState(false);
  const [roamingOperator, setRoamingOperator] = useState('Vodafone DE');

  // USSD panel state
  const [ussdExpanded, setUssdExpanded] = useState(false);
  const [ussdCode, setUssdCode] = useState('*100#');

  // Custom sequence runner
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [customRunning, setCustomRunning] = useState(false);
  const cancelCustomRef = useRef(false);

  // ── Preset run ──────────────────────────────────────────────────────────────
  const runPreset = useCallback(async (group: PresetGroup) => {
    if (anyRunning || httpRunning || customRunning || !isConnected) return;
    cancelRef.current = false;
    setExpandedGroup(group.id);
    setRunState({ groupId: group.id, statuses: group.steps.map(() => 'idle'), errors: group.steps.map(() => undefined) });
    automation.setActiveSequence(group.id);
    await executePreset(group.steps, sendTextData, () => stateRef.current.conversationLogs,
      (idx, status, error) => setRunState(prev => {
        if (!prev) return prev;
        const s = [...prev.statuses]; s[idx] = status;
        const e = [...prev.errors]; e[idx] = error;
        return { ...prev, statuses: s, errors: e };
      }), cancelRef);
    automation.setActiveSequence(null);
    setTimeout(() => setRunState(null), 1500);
  }, [anyRunning, httpRunning, customRunning, isConnected, sendTextData, automation]);

  const stopPreset = useCallback(() => {
    cancelRef.current = true;
    automation.setActiveSequence(null);
    setRunState(null);
  }, [automation]);

  // ── HTTP run ────────────────────────────────────────────────────────────────
  const runHttp = useCallback(async () => {
    if (anyRunning || httpRunning || customRunning || !isConnected) return;
    cancelHttpRef.current = false;
    setHttpRunning(true);
    setHttpExpanded(true);

    const url = httpUrl.trim();
    const method = httpMethod;
    const body = httpBody;
    const ct = httpContentType.trim();

    const steps: HttpStep[] = method === 'GET'
      ? [
          { label: 'AT+HTTPINIT',                       status: 'idle' },
          { label: `AT+HTTPPARA="URL","${url}"`,         status: 'idle' },
          { label: 'AT+HTTPACTION=0  (GET)',             status: 'idle' },
          { label: 'Wait +HTTPACTION',                   status: 'idle' },
          { label: 'AT+HTTPREAD',                        status: 'idle' },
          { label: 'AT+HTTPTERM',                        status: 'idle' },
        ]
      : [
          { label: 'AT+HTTPINIT',                       status: 'idle' },
          { label: `AT+HTTPPARA="URL","${url}"`,         status: 'idle' },
          { label: `AT+HTTPPARA="CONTENT","${ct}"`,     status: 'idle' },
          { label: `AT+HTTPDATA=${body.length},10000`,  status: 'idle' },
          { label: 'Send body',                          status: 'idle' },
          { label: 'AT+HTTPACTION=1  (POST)',            status: 'idle' },
          { label: 'Wait +HTTPACTION',                   status: 'idle' },
          { label: 'AT+HTTPREAD',                        status: 'idle' },
          { label: 'AT+HTTPTERM',                        status: 'idle' },
        ];

    setHttpSteps(steps.map(s => ({ ...s, status: 'idle' })));

    const upd = (idx: number, status: StepStatus, error?: string) =>
      setHttpSteps(prev => { const n = [...prev]; n[idx] = { ...n[idx], status, error }; return n; });

    const getLogs = () => stateRef.current.conversationLogs;
    const send = (txt: string) => sendTextData(txt);
    const cr = cancelHttpRef;
    const wp = (pat: string, ms: number) => {
      const base = getLogs().length;
      return waitForPattern(pat, ms, getLogs, cr, base);
    };

    try {
      let i = 0;

      // Reset any leftover HTTP session before starting (ignore errors)
      send('AT+HTTPTERM\r\n');
      await new Promise(r => setTimeout(r, 300));

      upd(i, 'running'); send('AT+HTTPINIT\r\n');
      await wp('OK', 1500); upd(i++, 'success');

      upd(i, 'running'); send(`AT+HTTPPARA="URL","${url}"\r\n`);
      await wp('OK', 1500); upd(i++, 'success');

      if (method === 'POST') {
        upd(i, 'running'); send(`AT+HTTPPARA="CONTENT","${ct}"\r\n`);
        await wp('OK', 1500); upd(i++, 'success');

        upd(i, 'running'); send(`AT+HTTPDATA=${body.length},10000\r\n`);
        await wp('DOWNLOAD', 3000); upd(i++, 'success');

        upd(i, 'running'); send(body);
        await wp('OK', 6000); upd(i++, 'success');

        upd(i, 'running'); send('AT+HTTPACTION=1\r\n');
        await wp('OK', 2000); upd(i++, 'success');
      } else {
        upd(i, 'running'); send('AT+HTTPACTION=0\r\n');
        await wp('OK', 2000); upd(i++, 'success');
      }

      upd(i, 'running');
      await wp('+HTTPACTION', 10000); upd(i++, 'success');

      upd(i, 'running'); send('AT+HTTPREAD\r\n');
      await wp('OK', 3000); upd(i++, 'success');

      upd(i, 'running'); send('AT+HTTPTERM\r\n');
      await wp('OK', 1500); upd(i++, 'success');
    } catch (err) {
      setHttpSteps(prev => {
        const runIdx = prev.findIndex(s => s.status === 'running');
        if (runIdx < 0) return prev;
        const n = [...prev];
        n[runIdx] = { ...n[runIdx], status: 'fail', error: err instanceof Error ? err.message : String(err) };
        return n;
      });
    }

    setHttpRunning(false);
  }, [anyRunning, httpRunning, customRunning, isConnected, httpMethod, httpUrl, httpBody, httpContentType, sendTextData]);

  const stopHttp = useCallback(() => {
    cancelHttpRef.current = true;
    setHttpRunning(false);
  }, []);

  const applyGps = useCallback(() => {
    const lat = parseFloat(gpsLat);
    const lon = parseFloat(gpsLon);
    const alt = parseFloat(gpsAlt);
    if (!isNaN(lat) && !isNaN(lon) && !isNaN(alt)) {
      setGpsPosition(lat, lon, alt);
    }
  }, [gpsLat, gpsLon, gpsAlt, setGpsPosition]);

  const toggleGpsWalk = useCallback((enabled: boolean) => {
    setGpsWalk(enabled);
    setGpsWalkMode(enabled);
  }, [setGpsWalkMode]);

  const runCustom = useCallback(async () => {
    const seq = sequences.find(s => s.id === selectedCustomId) ?? sequences[0];
    if (!seq || customRunning || anyRunning || httpRunning || !isConnected) return;
    cancelCustomRef.current = false;
    setCustomRunning(true);
    await executePreset(
      seq.steps.map(s => ({ type: s.type as 'send' | 'expect' | 'wait', payload: s.payload })),
      sendTextData, () => stateRef.current.conversationLogs,
      () => {},
      cancelCustomRef,
    );
    setCustomRunning(false);
  }, [sequences, selectedCustomId, customRunning, anyRunning, httpRunning, isConnected, sendTextData]);

  const stopCustom = useCallback(() => { cancelCustomRef.current = true; setCustomRunning(false); }, []);

  // ── Transcript scroll ───────────────────────────────────────────────────────
  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [conversationLogs.length]);

  const txRxLines = conversationLogs
    .slice(0, 80).reverse()
    .filter(e => e.type === 'tx' || e.type === 'rx')
    .map(e => ({ ...e, text: hexToReadable(e.rawHex) }))
    .filter(e => e.text.length > 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-gray-950/70 border-l border-gray-800/50 font-mono overflow-hidden">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2">
          <TerminalSquare size={13} className="text-emerald-400" />
          <span className="text-gray-200 font-bold text-[9px] uppercase tracking-widest">{t('atAuto.title')}</span>
        </div>
        <span className={`text-[8px] uppercase tracking-widest flex items-center gap-1 ${isConnected ? 'text-emerald-400' : 'text-gray-600'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-700'}`} />
          {isConnected ? t('atAuto.connected') : t('atAuto.offline')}
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">

        {/* ── HTTP Builder ───────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-800/50">
          {/* HTTP header / toggle */}
          <button
            onClick={() => setHttpExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-cyan-900/20 hover:bg-cyan-900/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Globe size={11} className="text-cyan-400" />
              <span className="text-cyan-300 text-[10px] font-bold uppercase tracking-wide">HTTP İsteği</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${httpMethod === 'GET' ? 'bg-emerald-900/60 text-emerald-400' : 'bg-orange-900/60 text-orange-400'}`}>
                {httpMethod}
              </span>
              {httpExpanded ? <ChevronDown size={11} className="text-gray-500" /> : <ChevronRight size={11} className="text-gray-500" />}
            </div>
          </button>

          {httpExpanded && (
            <div className="px-3 pb-3 pt-2 space-y-2 bg-gray-950/30">
              {/* Method toggle */}
              <div className="flex gap-1">
                {(['GET', 'POST'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => !httpRunning && setHttpMethod(m)}
                    disabled={httpRunning}
                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${
                      httpMethod === m
                        ? m === 'GET' ? 'bg-emerald-700 text-white' : 'bg-orange-700 text-white'
                        : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* URL */}
              <div>
                <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">URL</label>
                <input
                  value={httpUrl}
                  onChange={e => setHttpUrl(e.target.value)}
                  disabled={httpRunning}
                  placeholder="http://example.com/api"
                  className="w-full bg-gray-900 border border-gray-700/60 text-gray-200 placeholder-gray-700 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-cyan-600/60 disabled:opacity-50"
                />
              </div>

              {/* POST body */}
              {httpMethod === 'POST' && (
                <>
                  <div>
                    <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Content-Type</label>
                    <select
                      value={httpContentType}
                      onChange={e => setHttpContentType(e.target.value)}
                      disabled={httpRunning}
                      className="w-full bg-gray-900 border border-gray-700/60 text-gray-300 rounded px-2 py-1.5 text-[10px] focus:outline-none disabled:opacity-50"
                    >
                      <option value="application/json">application/json</option>
                      <option value="text/plain">text/plain</option>
                      <option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</option>
                      <option value="application/octet-stream">application/octet-stream</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">
                      BODY <span className="text-gray-700 normal-case">{httpBody.length} bytes</span>
                    </label>
                    <textarea
                      value={httpBody}
                      onChange={e => setHttpBody(e.target.value)}
                      disabled={httpRunning}
                      rows={3}
                      className="w-full bg-gray-900 border border-gray-700/60 text-gray-200 placeholder-gray-700 rounded px-2 py-1.5 text-[10px] resize-none focus:outline-none focus:border-orange-600/60 disabled:opacity-50"
                      placeholder='{"key":"value"}'
                    />
                  </div>
                </>
              )}

              {/* Send / Stop */}
              <div className="flex gap-1.5">
                {!httpRunning ? (
                  <button
                    onClick={runHttp}
                    disabled={anyRunning || customRunning || !isConnected || !httpUrl.trim()}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      httpMethod === 'GET'
                        ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                        : 'bg-orange-700 hover:bg-orange-600 text-white'
                    }`}
                  >
                    <Play size={10} />
                    {httpMethod} Gönder
                  </button>
                ) : (
                  <button
                    onClick={stopHttp}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                  >
                    <Square size={10} />
                    {t('atAuto.stop')}
                  </button>
                )}
              </div>

              {/* HTTP step status */}
              {httpSteps.length > 0 && (
                <div className="space-y-0.5 pt-1">
                  {httpSteps.map((step, i) => (
                    <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] ${step.status === 'running' ? 'bg-cyan-900/20' : step.status === 'fail' ? 'bg-red-900/20' : ''}`}>
                      <span className="shrink-0 w-3">
                        {step.status === 'running' && <Loader2 size={9} className="text-cyan-400 animate-spin" />}
                        {step.status === 'success' && <CheckCircle2 size={9} className="text-emerald-500" />}
                        {step.status === 'fail' && <XCircle size={9} className="text-red-500" />}
                        {step.status === 'idle' && <Clock size={9} className="text-gray-700" />}
                      </span>
                      <span className={`truncate ${step.status === 'fail' ? 'text-red-400' : step.status === 'success' ? 'text-gray-500' : 'text-gray-400'}`}>
                        {step.label}
                      </span>
                      {step.error && <span className="text-red-500 text-[8px] shrink-0">{step.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── GPS Panel ──────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-800/50">
          <button
            onClick={() => setGpsExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-emerald-900/10 hover:bg-emerald-900/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MapPin size={11} className="text-emerald-400" />
              <span className="text-emerald-300 text-[10px] font-bold uppercase tracking-wide">GPS Konumu</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] text-gray-500 font-mono">{parseFloat(gpsLat).toFixed(4)}, {parseFloat(gpsLon).toFixed(4)}</span>
              {gpsExpanded ? <ChevronDown size={11} className="text-gray-500" /> : <ChevronRight size={11} className="text-gray-500" />}
            </div>
          </button>

          {gpsExpanded && (
            <div className="px-3 pb-3 pt-2 space-y-2 bg-gray-950/30">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Lat</label>
                  <input
                    value={gpsLat}
                    onChange={e => setGpsLat(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700/60 text-gray-200 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-emerald-600/60"
                    placeholder="41.0082"
                  />
                </div>
                <div>
                  <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Lon</label>
                  <input
                    value={gpsLon}
                    onChange={e => setGpsLon(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700/60 text-gray-200 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-emerald-600/60"
                    placeholder="28.9784"
                  />
                </div>
                <div>
                  <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Alt (m)</label>
                  <input
                    value={gpsAlt}
                    onChange={e => setGpsAlt(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700/60 text-gray-200 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-emerald-600/60"
                    placeholder="34.2"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-gray-500 uppercase tracking-widest">Random Walk</span>
                  <button
                    onClick={() => toggleGpsWalk(!gpsWalk)}
                    className={`w-8 h-4 rounded-full relative transition-colors ${gpsWalk ? 'bg-emerald-600' : 'bg-gray-800'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${gpsWalk ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                  {gpsWalk && <span className="text-[8px] text-emerald-500 animate-pulse">hareket ediyor</span>}
                </div>
                <button
                  onClick={applyGps}
                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] font-bold uppercase tracking-widest transition-colors"
                >
                  Uygula
                </button>
              </div>

              {/* Quick location presets */}
              <div>
                <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Hızlı Konum</label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: 'İstanbul', lat: '41.0082376', lon: '28.9783589', alt: '34.2' },
                    { label: 'New York', lat: '40.7128', lon: '-74.0060', alt: '10' },
                    { label: 'Sydney', lat: '-33.8688', lon: '151.2093', alt: '58' },
                    { label: 'São Paulo', lat: '-23.5505', lon: '-46.6333', alt: '760' },
                  ].map(loc => (
                    <button
                      key={loc.label}
                      onClick={() => { setGpsLat(loc.lat); setGpsLon(loc.lon); setGpsAlt(loc.alt); }}
                      className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-[8px] transition-colors border border-gray-700/50"
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── PIN Panel ──────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-800/50">
          <button
            onClick={() => setPinExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-amber-900/10 hover:bg-amber-900/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap size={11} className="text-amber-400" />
              <span className="text-amber-300 text-[10px] font-bold uppercase tracking-wide">SIM PIN</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${pinLocked ? 'bg-red-900/60 text-red-400' : 'bg-emerald-900/60 text-emerald-400'}`}>
                {pinLocked ? 'KİLİTLİ' : 'READY'}
              </span>
              {pinExpanded ? <ChevronDown size={11} className="text-gray-500" /> : <ChevronRight size={11} className="text-gray-500" />}
            </div>
          </button>
          {pinExpanded && (
            <div className="px-3 pb-3 pt-2 space-y-2 bg-gray-950/30">
              <div>
                <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">PIN Kodu</label>
                <input
                  value={pinCode}
                  onChange={e => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="1234"
                  maxLength={8}
                  className="w-full bg-gray-900 border border-gray-700/60 text-gray-200 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-amber-600/60 tracking-widest"
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => { sendTextData(`AT+CLCK="SC",1,"${pinCode}"\r\n`); setPinLocked(true); }}
                  disabled={!isConnected}
                  className="py-1.5 rounded bg-red-900/40 border border-red-700/50 text-red-300 text-[9px] font-bold uppercase hover:bg-red-900/60 transition-colors disabled:opacity-30"
                >
                  SIM Kilitle
                </button>
                <button
                  onClick={() => { sendTextData(`AT+CPIN=${pinCode}\r\n`); setPinLocked(false); }}
                  disabled={!isConnected}
                  className="py-1.5 rounded bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 text-[9px] font-bold uppercase hover:bg-emerald-900/60 transition-colors disabled:opacity-30"
                >
                  PIN Gir
                </button>
                <button
                  onClick={() => sendTextData('AT+CPIN?\r\n')}
                  disabled={!isConnected}
                  className="py-1.5 rounded bg-gray-800 border border-gray-700/50 text-gray-300 text-[9px] font-bold uppercase hover:bg-gray-700 transition-colors disabled:opacity-30 col-span-2"
                >
                  AT+CPIN? Sorgula
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Voice Call Panel ─────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-800/50">
          <button
            onClick={() => setCallExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-green-900/10 hover:bg-green-900/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Phone size={11} className="text-green-400" />
              <span className="text-green-300 text-[10px] font-bold uppercase tracking-wide">Ses Çağrısı</span>
            </div>
            {callExpanded ? <ChevronDown size={11} className="text-gray-500" /> : <ChevronRight size={11} className="text-gray-500" />}
          </button>
          {callExpanded && (
            <div className="px-3 pb-3 pt-2 space-y-2 bg-gray-950/30">
              <div>
                <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Numara</label>
                <input
                  value={callNumber}
                  onChange={e => setCallNumber(e.target.value)}
                  placeholder="+905559998877"
                  className="w-full bg-gray-900 border border-gray-700/60 text-gray-200 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-green-600/60"
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => simulateIncomingCall(callNumber || undefined)}
                  disabled={!isConnected}
                  className="py-1.5 rounded bg-green-900/40 border border-green-700/50 text-green-300 text-[9px] font-bold uppercase hover:bg-green-900/60 transition-colors disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  <Phone size={9} /> Gelen Çağrı
                </button>
                <button
                  onClick={() => sendTextData(`ATD${callNumber};\r\n`)}
                  disabled={!isConnected}
                  className="py-1.5 rounded bg-blue-900/40 border border-blue-700/50 text-blue-300 text-[9px] font-bold uppercase hover:bg-blue-900/60 transition-colors disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  <Phone size={9} /> Ara (ATD)
                </button>
                <button
                  onClick={() => sendTextData('ATA\r\n')}
                  disabled={!isConnected}
                  className="py-1.5 rounded bg-gray-800 border border-gray-700/50 text-gray-300 text-[9px] font-bold uppercase hover:bg-gray-700 transition-colors disabled:opacity-30"
                >
                  ATA (Cevapla)
                </button>
                <button
                  onClick={() => sendTextData('ATH\r\n')}
                  disabled={!isConnected}
                  className="py-1.5 rounded bg-red-900/40 border border-red-700/50 text-red-300 text-[9px] font-bold uppercase hover:bg-red-900/60 transition-colors disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  <PhoneOff size={9} /> ATH (Kapat)
                </button>
                <button
                  onClick={() => sendTextData('AT+CLCC\r\n')}
                  disabled={!isConnected}
                  className="py-1.5 rounded bg-gray-800 border border-gray-700/50 text-gray-300 text-[9px] font-bold uppercase hover:bg-gray-700 transition-colors disabled:opacity-30 col-span-2"
                >
                  AT+CLCC (Çağrı Listesi)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Roaming Panel ─────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-800/50">
          <button
            onClick={() => setRoamingExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-indigo-900/10 hover:bg-indigo-900/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Signal size={11} className="text-indigo-400" />
              <span className="text-indigo-300 text-[10px] font-bold uppercase tracking-wide">Roaming / Hücre</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${roamingEnabled ? 'bg-orange-900/60 text-orange-400' : 'bg-gray-800 text-gray-600'}`}>
                {roamingEnabled ? 'ROAMING' : 'HOME'}
              </span>
              {roamingExpanded ? <ChevronDown size={11} className="text-gray-500" /> : <ChevronRight size={11} className="text-gray-500" />}
            </div>
          </button>
          {roamingExpanded && (
            <div className="px-3 pb-3 pt-2 space-y-2 bg-gray-950/30">
              <div>
                <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Roaming Operatör</label>
                <div className="flex gap-1.5">
                  <input
                    value={roamingOperator}
                    onChange={e => setRoamingOperator(e.target.value)}
                    placeholder="Vodafone DE"
                    className="flex-1 bg-gray-900 border border-gray-700/60 text-gray-200 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-indigo-600/60"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setRoaming(true, roamingOperator); setRoamingEnabled(true); }}
                  disabled={!isConnected}
                  className="flex-1 py-1.5 rounded bg-orange-900/40 border border-orange-700/50 text-orange-300 text-[9px] font-bold uppercase hover:bg-orange-900/60 transition-colors disabled:opacity-30"
                >
                  Roaming Aç
                </button>
                <button
                  onClick={() => { setRoaming(false); setRoamingEnabled(false); }}
                  disabled={!isConnected}
                  className="flex-1 py-1.5 rounded bg-gray-800 border border-gray-700/50 text-gray-300 text-[9px] font-bold uppercase hover:bg-gray-700 transition-colors disabled:opacity-30"
                >
                  Home'a Dön
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'Vodafone DE', op: 'Vodafone DE' },
                  { label: 'T-Mobile US', op: 'T-Mobile US' },
                  { label: 'Orange FR', op: 'Orange FR' },
                  { label: 'NTT Docomo', op: 'NTT Docomo' },
                ].map(p => (
                  <button key={p.label} onClick={() => setRoamingOperator(p.op)}
                    className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-[8px] border border-gray-700/50 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => sendTextData('AT+CREG=2\r\n')} disabled={!isConnected}
                  className="py-1 rounded bg-gray-800 border border-gray-700/50 text-gray-400 text-[9px] uppercase hover:bg-gray-700 transition-colors disabled:opacity-30"
                >
                  CREG=2
                </button>
                <button onClick={() => sendTextData('AT+CREG?\r\n')} disabled={!isConnected}
                  className="py-1 rounded bg-gray-800 border border-gray-700/50 text-gray-400 text-[9px] uppercase hover:bg-gray-700 transition-colors disabled:opacity-30"
                >
                  CREG?
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── USSD Panel ────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-800/50">
          <button
            onClick={() => setUssdExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-purple-900/10 hover:bg-purple-900/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={11} className="text-purple-400" />
              <span className="text-purple-300 text-[10px] font-bold uppercase tracking-wide">USSD</span>
            </div>
            {ussdExpanded ? <ChevronDown size={11} className="text-gray-500" /> : <ChevronRight size={11} className="text-gray-500" />}
          </button>
          {ussdExpanded && (
            <div className="px-3 pb-3 pt-2 space-y-2 bg-gray-950/30">
              <div>
                <label className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">USSD Kodu</label>
                <input
                  value={ussdCode}
                  onChange={e => setUssdCode(e.target.value)}
                  placeholder="*100#"
                  className="w-full bg-gray-900 border border-gray-700/60 text-gray-200 rounded px-2 py-1.5 text-[10px] focus:outline-none focus:border-purple-600/60"
                />
              </div>
              <div className="flex flex-wrap gap-1 mb-1">
                {['*100#', '*101#', '*102#', '*123#'].map(code => (
                  <button key={code} onClick={() => setUssdCode(code)}
                    className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-[8px] border border-gray-700/50 transition-colors"
                  >
                    {code}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => sendTextData(`AT+CUSD=1,"${ussdCode}",15\r\n`)}
                  disabled={!isConnected || !ussdCode.trim()}
                  className="flex-1 py-1.5 rounded bg-purple-900/40 border border-purple-700/50 text-purple-300 text-[9px] font-bold uppercase hover:bg-purple-900/60 transition-colors disabled:opacity-30"
                >
                  USSD Gönder
                </button>
                <button
                  onClick={() => sendTextData('AT+CUSD=2\r\n')}
                  disabled={!isConnected}
                  className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700/50 text-gray-400 text-[9px] font-bold uppercase hover:bg-gray-700 transition-colors disabled:opacity-30"
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Preset sequences ──────────────────────────────────────────── */}
        <div className="shrink-0">
          <div className="px-3 pt-2 pb-1 text-[8px] text-gray-600 uppercase tracking-widest">{t('atAuto.presets')}</div>
          {PRESETS.map(group => {
            const colors = COLOR_MAP[group.color];
            const isRunning = runState?.groupId === group.id;
            const isExpanded = expandedGroup === group.id;
            const sendCount = group.steps.filter(s => s.type === 'send').length;

            return (
              <div key={group.id} className="px-2 mb-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => !anyRunning && !httpRunning && !customRunning && runPreset(group)}
                    disabled={anyRunning || httpRunning || customRunning || !isConnected}
                    className={`flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-md border text-[10px] transition-all
                      ${isRunning ? 'bg-emerald-900/50 border-emerald-600/60 text-emerald-300' : colors.btn}
                      disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <span className="font-bold tracking-wide">{t(group.labelKey)}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded ${colors.badge}`}>{sendCount} cmd</span>
                      {isRunning ? <Loader2 size={10} className="animate-spin" /> : <Play size={9} />}
                    </div>
                  </button>
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                    className="p-1.5 text-gray-700 hover:text-gray-400 transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-0.5 mb-1 pl-2 space-y-0.5">
                    {group.steps.map((step, i) => {
                      const status = isRunning ? (runState?.statuses[i] ?? 'idle') : 'idle';
                      const error = isRunning ? runState?.errors[i] : undefined;
                      return (
                        <div key={i} className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] ${status === 'running' ? 'bg-emerald-900/20' : status === 'fail' ? 'bg-red-900/20' : ''}`}>
                          <span className="shrink-0 w-3">
                            {status === 'running' && <Loader2 size={9} className="text-emerald-400 animate-spin" />}
                            {status === 'success' && <CheckCircle2 size={9} className="text-emerald-500" />}
                            {status === 'fail' && <XCircle size={9} className="text-red-500" />}
                            {status === 'idle' && <Clock size={9} className="text-gray-700" />}
                          </span>
                          {step.type === 'send' ? (
                            <>
                              <span className={`shrink-0 text-[7px] uppercase ${colors.step}`}>send</span>
                              <span className="text-gray-300 truncate">{step.payload}</span>
                              {step.label && <span className="ml-auto text-gray-700 shrink-0 text-[8px]">{step.label}</span>}
                            </>
                          ) : step.type === 'expect' ? (
                            <>
                              <span className="shrink-0 text-[7px] uppercase text-blue-500">wait</span>
                              <span className="text-gray-600 truncate">{step.payload.split('|')[0].trim()}</span>
                            </>
                          ) : null}
                          {error && <span className="text-red-400 text-[8px] truncate">{error}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {anyRunning && (
            <div className="px-2 pb-2">
              <button onClick={stopPreset} className="w-full flex items-center justify-center gap-2 py-1.5 rounded-md bg-red-900/40 border border-red-700/50 text-red-400 text-[9px] uppercase tracking-widest font-bold hover:bg-red-900/60 transition-colors">
                <Square size={10} />
                {t('atAuto.stop')}
              </button>
            </div>
          )}
        </div>

        {/* ── Custom sequences ──────────────────────────────────────────── */}
        {sequences.length > 0 && (
          <div className="shrink-0 p-2 border-t border-gray-800/50 bg-gray-900/10">
            <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-1.5">{t('atAuto.customSequences')}</div>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <select
                  value={selectedCustomId ?? sequences[0]?.id ?? ''}
                  onChange={e => { setSelectedCustomId(e.target.value); }}
                  disabled={customRunning || anyRunning || httpRunning}
                  className="w-full appearance-none bg-gray-900 border border-gray-700/60 text-gray-300 rounded px-2 py-1 pr-6 text-[10px] focus:outline-none disabled:opacity-50"
                >
                  {sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown size={9} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
              </div>
              {!customRunning ? (
                <button onClick={runCustom} disabled={anyRunning || httpRunning || !isConnected} className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-[9px] uppercase font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 shrink-0">
                  <Play size={9} />{t('atAuto.run')}
                </button>
              ) : (
                <button onClick={stopCustom} className="px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-[9px] uppercase font-bold transition-colors flex items-center gap-1 shrink-0">
                  <Square size={9} />{t('atAuto.stop')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Transcript ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col border-t border-gray-800/30" style={{ minHeight: 120 }}>
          <div className="shrink-0 px-3 py-1.5 flex items-center justify-between">
            <span className="text-[8px] text-gray-600 uppercase tracking-widest">{t('atAuto.transcript')}</span>
            {txRxLines.length > 0 && (
              <button
                onClick={clearConversation}
                className="text-gray-700 hover:text-red-400 transition-colors"
                title="Transcript'i temizle"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
          <div ref={transcriptRef} className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
            {txRxLines.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-gray-700 text-[9px] text-center px-4">
                {t('atAuto.noTraffic')}
              </div>
            ) : (
              <div className="space-y-0.5">
                {txRxLines.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2">
                    <span className={`shrink-0 text-[9px] w-4 text-right mt-0.5 ${entry.type === 'tx' ? 'text-emerald-500' : 'text-blue-400'}`}>
                      {entry.type === 'tx' ? '→' : '←'}
                    </span>
                    <span className={`text-[10px] break-all leading-snug ${entry.type === 'tx' ? 'text-emerald-300' : 'text-blue-200'}`}>
                      {entry.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
