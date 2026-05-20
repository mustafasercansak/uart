import type { CANFrame } from '../../../../can/types/CANFrame';
import type { CANNode } from '../../../../can/types/CANNode';
import { MEDICAL_PROFILE_LABELS } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';
import { parseJ1939Id, j1939PgnName } from '../../../../can/engines/CANFrameParser';

interface FrameInspectorProps {
  frame: CANFrame | null;
  node: CANNode | undefined;
}

export function FrameInspector({ frame, node }: FrameInspectorProps) {
  const { t } = useTranslation();
  const CAN_FRAME_FIELDS = [
    { name: 'SOF',   bits: 1,  cls: 'bg-gray-800/60 text-gray-400' },
    { name: 'ID',    bits: 11, cls: 'bg-yellow-900/60 text-yellow-400' },
    { name: 'RTR',   bits: 1,  cls: 'bg-gray-800/60 text-gray-400' },
    { name: 'IDE',   bits: 1,  cls: 'bg-gray-800/60 text-gray-400' },
    { name: 'r0',    bits: 1,  cls: 'bg-gray-800/60 text-gray-400' },
    { name: 'DLC',   bits: 4,  cls: 'bg-blue-900/60 text-blue-400' },
    { name: 'DATA',  bits: 64, cls: 'bg-green-900/60 text-green-400' },
    { name: 'CRC',   bits: 15, cls: 'bg-purple-900/60 text-purple-400' },
    { name: t('can.cRCD'), bits: 1,  cls: 'bg-gray-800/60 text-gray-400' },
    { name: 'ACK',   bits: 1,  cls: 'bg-cyan-900/60 text-cyan-400' },
    { name: t('can.aCKD'), bits: 1,  cls: 'bg-gray-800/60 text-gray-400' },
    { name: 'EOF',   bits: 7,  cls: 'bg-gray-800/60 text-gray-400' },
  ];

  if (!frame) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 font-mono text-xs">
        {t('can.selectFrame')}
      </div>
    );
  }

  return (
    <div className="p-3 font-mono text-xs space-y-3 overflow-auto h-full">
      <div className="text-gray-400 font-bold text-[10px] uppercase tracking-widest">{t('can.frameInspector')}</div>

      {/* Frame structure visualization */}
      <div className="glass-panel rounded-lg p-3 border border-white/5">
        <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">{t('can.frameAnatomyTitle')}</div>
        <div className="flex flex-wrap gap-1 mb-2">
          {CAN_FRAME_FIELDS.map(f => (
            <div key={f.name} className={`px-1.5 py-1 rounded text-center ${f.cls}`}>
              <div className="text-[8px] text-gray-500">{f.name}</div>
              <div className="text-[9px] font-bold">{f.bits}b</div>
            </div>
          ))}
        </div>
        <div className="text-[9px] text-gray-600">
          {frame.idFormat === 'standard' ? t('can.standard11BitID') : t('can.extended29BitID')} — {frame.dlc * 8 + 47} bits total
        </div>
      </div>

      {/* Decoded fields */}
      <div className="glass-panel rounded-lg p-3 border border-white/5 space-y-1">
        {buildFrameFields(frame, t).map(({ label, value, cls }) => (
          <div key={label} className="flex justify-between items-center py-0.5 border-b border-gray-800/40">
            <span className="text-gray-500 text-[10px]">{label}</span>
            <span className={`font-bold text-[10px] ${cls ?? 'text-white'}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Byte breakdown */}
      {frame.data.length > 0 && (
        <div>
          <div className="text-[9px] text-gray-600 mb-1 uppercase tracking-widest">{t('can.dataBytes')}</div>
          <div className="grid grid-cols-8 gap-1">
            {frame.data.map((byte, i) => (
              <div key={i} className="rounded bg-gray-800/60 px-1 py-1.5 text-center border border-white/5">
                <div className="text-[8px] text-gray-600">B{i}</div>
                <div className="text-[10px] text-green-400 font-bold">{byte.toString(16).padStart(2, '0').toUpperCase()}</div>
                <div className="text-[8px] text-gray-600">{byte}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signal Decoder (DBC) */}
      {node && frame.data.length > 0 && (
        <div className="glass-panel rounded-lg p-3 border border-white/5 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold">{t('can.signalDecoder')}</span>
            <span className="text-[8px] text-gray-500 bg-gray-800/60 px-1.5 py-0.5 rounded">{t(MEDICAL_PROFILE_LABELS[node.profile])}</span>
          </div>
          {decodeCANDataToSignals(frame.data, node.profile, t).map((sig, i) => (
            <div key={i} className="flex justify-between items-center py-0.5 border-b border-gray-800/40">
              <span className="text-gray-400 text-[10px]">{sig.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-gray-600">{sig.raw}</span>
                <span className={`font-bold text-[10px] text-white`}>{sig.value} <span className="text-gray-500 font-normal">{sig.unit}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Node context */}
      {node && (
        <div className="glass-panel rounded-lg p-3 border border-white/5 space-y-1">
          <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">{t('can.sourceNode')}</div>
          <Row label={t('can.name')} value={node.name} />
          <Row label={t('can.profile')} value={t(MEDICAL_PROFILE_LABELS[node.profile])} />
          <Row label={t('can.nMTState')} value={node.nmtState} />
          <Row label={t('can.tECREC')} value={`${node.txErrorCounter} / ${node.rxErrorCounter}`} />
          <Row label={t('can.totalTX')} value={node.framesSent.toString()} />
        </div>
      )}

      {/* Errors */}
      {frame.errors.length > 0 && (
        <div className="bg-red-950/30 border border-red-800/60 rounded-lg p-3">
          <div className="text-[9px] text-red-400 uppercase tracking-widest mb-1">{t('can.errorsAlarms')}</div>
          {frame.errors.map((err, i) => (
            <div key={i} className="text-[10px] text-red-300">{err}</div>
          ))}
        </div>
      )}

      {/* J1939 Decoded Fields */}
      {frame.idFormat === 'extended' && (() => {
        const j = frame.j1939 ?? parseJ1939Id(frame.arbitrationId);
        return (
          <div className="glass-panel rounded-lg p-3 border border-orange-800/30 space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] text-orange-400 uppercase tracking-widest font-bold">J1939</span>
              <span className="text-[8px] text-gray-500 bg-orange-900/20 px-1.5 py-0.5 rounded border border-orange-800/30">
                {j1939PgnName(j.pgn)}
              </span>
            </div>
            <Row label="PGN"              value={`0x${j.pgn.toString(16).toUpperCase().padStart(4, '0')} (${j.pgn})`} />
            <Row label="Priority"         value={`${j.priority} ${j.priority <= 2 ? '⚡' : ''}`} />
            <Row label="PF (PDU Format)"  value={`0x${j.pf.toString(16).toUpperCase().padStart(2, '0')}`} />
            <Row label="PS (PDU Specific)" value={`0x${j.ps.toString(16).toUpperCase().padStart(2, '0')}`} />
            <Row label="Source Address"   value={`0x${j.sourceAddress.toString(16).toUpperCase().padStart(2, '0')} (${j.sourceAddress})`} />
            {j.isPeer2Peer && j.destinationAddress !== undefined && (
              <Row label="Destination"    value={`0x${j.destinationAddress.toString(16).toUpperCase().padStart(2, '0')} (${j.destinationAddress})`} />
            )}
            <Row label="PDU Type"         value={j.isPeer2Peer ? 'PDU1 (Peer-to-Peer)' : 'PDU2 (Broadcast)'} />
            <Row label="Data Page"        value={j.dataPage.toString()} />
          </div>
        );
      })()}

      {/* Physical Layer Scope */}
      <div className="glass-panel rounded-lg p-3 border border-white/5 overflow-hidden">
        <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 flex items-center justify-between">
          <span>{t('can.logicAnalyzer')}</span>
          <span className="text-[10px] text-gray-500 font-mono tracking-wider">{t('can.diffScope')}</span>
        </div>
        <div className="overflow-x-auto no-scrollbar py-2 border-y border-gray-800/40">
          <PhysicalScope frame={frame} />
        </div>
        <div className="flex justify-between mt-2 text-[8px] text-gray-600 font-bold">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500 rounded-sm"></div>{t('can.cANH')}</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-sm"></div>{t('can.cANL')}</span>
          <span className="flex items-center gap-1"><div className="w-2 h-0.5 bg-gray-400"></div> {t('can.dominant')}</span>
          <span className="flex items-center gap-1"><div className="w-2 h-0.5 bg-gray-700"></div> {t('can.recessive')}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-gray-500">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function buildFrameFields(frame: CANFrame, t: (key: string, params?: Record<string, unknown>) => string) {
  return [
    { label: 'Arbitration ID', value: `0x${frame.arbitrationId.toString(16).toUpperCase().padStart(frame.idFormat === 'standard' ? 3 : 8, '0')}`, cls: 'text-yellow-400' },
    { label: t('can.iDFormat'), value: frame.idFormat === 'standard' ? t('can.standard11Bit') : t('can.extended29Bit') },
    { label: t('can.frameType'), value: frame.frameType },
    { label: 'RTR', value: frame.isRTR ? t('can.remote') : t('can.data') },
    { label: 'DLC', value: frame.dlc.toString() },
    { label: 'CRC', value: `0x${frame.crc.toString(16).toUpperCase().padStart(4, '0')}` },
    { label: 'COB-ID', value: frame.cobId ? `0x${frame.cobId.toString(16).toUpperCase().padStart(3, '0')}` : '—' },
    { label: t('can.functionCode'), value: frame.functionCode ? `0x${frame.functionCode.toString(16).toUpperCase()}` : '—' },
    { label: t('can.busLoad'), value: `${frame.busLoadPercent.toFixed(1)}%`, cls: frame.busLoadPercent > 75 ? 'text-red-400' : 'text-green-400' },
    { label: t('can.timestamp'), value: new Date(frame.timestamp).toISOString().slice(11, 23) },
  ];
}

// Moved CAN_FRAME_FIELDS inside the FrameInspector component

function decodeCANDataToSignals(data: number[], profile: CANNode['profile'], t: (key: string, params?: Record<string, unknown>) => string) {
  const buf = new Uint8Array(8);
  for (let i = 0; i < Math.min(data.length, 8); i++) buf[i] = data[i];
  const view = new DataView(buf.buffer);
  
  const signals: Array<{ name: string; value: string; unit: string; raw: string }> = [];

  try {
    switch (profile) {
      case 'vital-monitor':
      case 'ecg-monitor':
      case 'pulse-oximeter':
        if (data.length >= 2) signals.push({ name: t('can.heartRate'), value: (view.getUint16(0, true) / 10).toFixed(1), unit: 'BPM', raw: `0x${view.getUint16(0, true).toString(16)}` });
        if (data.length >= 4) signals.push({ name: 'SpO2', value: (view.getUint16(2, true) / 100).toFixed(1), unit: '%', raw: `0x${view.getUint16(2, true).toString(16)}` });
        if (data.length >= 6) signals.push({ name: t('can.systolicBP'), value: (view.getUint16(4, true) / 10).toFixed(1), unit: 'mmHg', raw: `0x${view.getUint16(4, true).toString(16)}` });
        if (data.length >= 7) signals.push({ name: t('can.diastolicBP'), value: buf[6].toString(), unit: 'mmHg', raw: `0x${buf[6].toString(16)}` });
        if (data.length >= 8) signals.push({ name: 'Alarm Flags', value: `0x${buf[7].toString(16).padStart(2, '0')}`, unit: '', raw: `B7` });
        break;

      case 'iv-pump':
      case 'infusion-pump':
        if (data.length >= 2) signals.push({ name: t('can.flowRate'), value: view.getUint16(0, true).toString(), unit: 'mL/hr', raw: `0x${view.getUint16(0, true).toString(16)}` });
        if (data.length >= 4) signals.push({ name: t('can.pressure'), value: view.getUint16(2, true).toString(), unit: 'mmHg', raw: `0x${view.getUint16(2, true).toString(16)}` });
        if (data.length >= 6) signals.push({ name: t('can.volumeInfused'), value: view.getUint16(4, true).toString(), unit: 'mL', raw: `0x${view.getUint16(4, true).toString(16)}` });
        if (data.length >= 8) signals.push({ name: 'Alarm Flags', value: `0x${view.getUint16(6, true).toString(16).padStart(4, '0')}`, unit: '', raw: `0x${view.getUint16(6, true).toString(16)}` });
        break;

      case 'ventilator':
        if (data.length >= 2) signals.push({ name: t('can.tidalVolume'), value: view.getUint16(0, true).toString(), unit: 'mL', raw: `0x${view.getUint16(0, true).toString(16)}` });
        if (data.length >= 3) signals.push({ name: 'PEEP', value: (buf[2] / 10).toFixed(1), unit: 'cmH2O', raw: `0x${buf[2].toString(16)}` });
        if (data.length >= 4) signals.push({ name: 'FiO2', value: buf[3].toString(), unit: '%', raw: `0x${buf[3].toString(16)}` });
        if (data.length >= 5) signals.push({ name: t('can.respRate'), value: buf[4].toString(), unit: 'BPM', raw: `0x${buf[4].toString(16)}` });
        if (data.length >= 6) signals.push({ name: t('can.peakPressure'), value: (buf[5] / 10).toFixed(1), unit: 'cmH2O', raw: `0x${buf[5].toString(16)}` });
        if (data.length >= 8) signals.push({ name: 'Alarm Flags', value: `0x${view.getUint16(6, true).toString(16).padStart(4, '0')}`, unit: '', raw: `0x${view.getUint16(6, true).toString(16)}` });
        break;

      case 'defibrillator':
        if (data.length >= 2) signals.push({ name: t('can.heartRate'), value: (view.getUint16(0, true) / 10).toFixed(1), unit: 'BPM', raw: `0x${view.getUint16(0, true).toString(16)}` });
        if (data.length >= 3) {
          const status = buf[2] === 0 ? t('can.standby') : buf[2] === 1 ? t('can.charging') : t('can.ready');
          signals.push({ name: t('can.deviceStatus'), value: status, unit: '', raw: `0x${buf[2].toString(16)}` });
        }
        break;
        
      default:
        signals.push({ name: 'Raw Payload', value: data.map(b => b.toString(16).padStart(2, '0')).join(' '), unit: '', raw: '' });
    }
  } catch {
    signals.push({ name: t('can.decodeError'), value: t('can.malformedPayloa'), unit: '', raw: '' });
  }
  
  return signals;
}

function PhysicalScope({ frame }: { frame: CANFrame }) {
  // Generate the bitstream for the frame
  const bits: { val: number, label: string, color: string }[] = [];
  
  const addBits = (val: number, len: number, label: string, color: string) => {
    for (let i = len - 1; i >= 0; i--) bits.push({ val: (val >> i) & 1, label, color });
  };
  
  bits.push({ val: 0, label: 'SOF', color: '#4b5563' }); // Dominant
  
  if (frame.idFormat === 'standard') {
    addBits(frame.arbitrationId, 11, 'ID', '#ca8a04');
    bits.push({ val: frame.isRTR ? 1 : 0, label: 'RTR', color: '#4b5563' });
    bits.push({ val: 0, label: 'IDE', color: '#4b5563' });
    bits.push({ val: 0, label: 'r0', color: '#4b5563' });
  } else {
    addBits(frame.arbitrationId, 29, 'ID', '#ca8a04');
    bits.push({ val: frame.isRTR ? 1 : 0, label: 'RTR', color: '#4b5563' });
    bits.push({ val: 1, label: 'IDE', color: '#4b5563' });
    bits.push({ val: 0, label: 'r1', color: '#4b5563' });
    bits.push({ val: 0, label: 'r0', color: '#4b5563' });
  }
  
  addBits(frame.dlc, 4, 'DLC', '#2563eb');
  
  frame.data.forEach((byte, i) => {
    addBits(byte, 8, `D${i}`, '#16a34a');
  });
  
  addBits(frame.crc, 15, 'CRC', '#9333ea');
  bits.push({ val: 1, label: 'CRCD', color: '#4b5563' });
  bits.push({ val: 0, label: 'ACK', color: '#0891b2' }); // Assume ACK'd (dominant)
  bits.push({ val: 1, label: 'ACKD', color: '#4b5563' });
  for (let i=0; i<7; i++) bits.push({ val: 1, label: 'EOF', color: '#4b5563' });

  // Bit stuffing simulation (optional but visually accurate):
  // For CAN, 5 consecutive identical bits add an opposite bit
  const stuffed: typeof bits = [];
  let count = 0;
  let lastVal = -1;
  // Stuffing applies from SOF to CRC
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i];
    if (b.label === 'CRCD' || b.label === 'ACK' || b.label === 'ACKD' || b.label === 'EOF') {
      stuffed.push(b);
      continue;
    }
    stuffed.push(b);
    if (b.val === lastVal) {
      count++;
      if (count === 5) {
        stuffed.push({ val: 1 - b.val, label: 'STF', color: '#ef4444' });
        lastVal = 1 - b.val;
        count = 1;
      }
    } else {
      count = 1;
      lastVal = b.val;
    }
  }

  const bitWidth = 8;
  const W = stuffed.length * bitWidth;
  const H = 60;
  
  // Voltages: 
  // Recessive (1) -> CAN-H = 2.5V, CAN-L = 2.5V
  // Dominant (0)  -> CAN-H = 3.5V, CAN-L = 1.5V
  const drawLine = (isH: boolean) => {
    let d = `M 0 ${H/2}`;
    stuffed.forEach((b, i) => {
      const x1 = i * bitWidth;
      const x2 = x1 + bitWidth;
      const y = b.val === 1 
        ? H/2 // Recessive
        : (isH ? H/4 : 3*H/4); // Dominant H vs L
      
      d += ` L ${x1} ${y} L ${x2} ${y}`;
    });
    return d;
  };

  return (
    <svg width={W} height={H} className="min-w-max">
      {/* Background grid */}
      <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="#374151" strokeWidth={1} strokeDasharray="2 2" />
      <line x1={0} y1={H/4} x2={W} y2={H/4} stroke="#374151" strokeWidth={0.5} strokeDasharray="2 2" />
      <line x1={0} y1={3*H/4} x2={W} y2={3*H/4} stroke="#374151" strokeWidth={0.5} strokeDasharray="2 2" />

      {/* Bit boundaries and regions */}
      {stuffed.map((b, i) => {
        if (i === 0 || b.label !== stuffed[i-1].label) {
          return <line key={i} x1={i*bitWidth} y1={0} x2={i*bitWidth} y2={H} stroke={b.color} strokeOpacity={0.4} strokeWidth={1} />;
        }
        return null;
      })}

      {/* Signals */}
      <path d={drawLine(true)} fill="none" stroke="#f43f5e" strokeWidth={1.5} strokeLinejoin="round" />
      <path d={drawLine(false)} fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Labels */}
      {stuffed.map((b, i) => {
        if (i === 0 || b.label !== stuffed[i-1].label) {
          return (
            <text key={i} x={i*bitWidth + 2} y={10} fill={b.color} fontSize="8" fontFamily="monospace" fontWeight="bold">
              {b.label}
            </text>
          );
        }
        return null;
      })}
    </svg>
  );
}
