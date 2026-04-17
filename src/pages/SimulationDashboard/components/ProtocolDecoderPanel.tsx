import React, { useMemo, useState } from 'react';
import { Cpu, AlertTriangle, CheckCircle, HelpCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { GeneratedFrame, FrameProfile } from '../../../types';
import {
  decodeModbusRTU,
  decodeNMEA,
  detectProtocol,
  type DecodedField,
} from '../../../engines/HighLevelDecoders';
import { parseFrame } from '../../../engines/FrameParser';

interface Props {
  frames: GeneratedFrame[];
  profile: FrameProfile | null;
}

type Protocol = 'auto' | 'modbus_rtu' | 'nmea';

function FieldRow({ field }: { field: DecodedField }) {
  const highlightClass =
    field.highlight === 'ok'
      ? 'text-emerald-400'
      : field.highlight === 'error'
      ? 'text-red-400'
      : field.highlight === 'warn'
      ? 'text-yellow-400'
      : 'text-gray-200';

  return (
    <div className="flex items-center gap-2 py-1 px-2 hover:bg-white/5 rounded font-mono text-[11px]">
      <span className="text-gray-500 w-40 shrink-0 truncate">{field.name}</span>
      <span className={`flex-1 ${highlightClass}`}>{String(field.value)}</span>
      <span className="text-gray-600 text-[10px] ml-auto">{field.hex}</span>
    </div>
  );
}

function FrameDecodeCard({
  frame,
  protocol,
  index,
  profile,
}: {
  frame: GeneratedFrame;
  protocol: Protocol;
  index: number;
  profile: FrameProfile | null;
}) {
  const [expanded, setExpanded] = useState(index === 0);

  const detected = useMemo(() => {
    if (protocol !== 'auto') return protocol;
    if (!frame.rawBytes || !Array.isArray(frame.rawBytes)) return 'unknown';
    return detectProtocol(frame.rawBytes);
  }, [frame.rawBytes, protocol]);

  const decoded = useMemo(() => {
    if (!frame.rawBytes || !Array.isArray(frame.rawBytes)) return null;

    try {
      if (detected === 'modbus_rtu') return decodeModbusRTU(frame.rawBytes);
      if (detected === 'nmea') return decodeNMEA(frame.rawBytes);
      
      // Fallback: Aktif Profil Tanımı
      if (profile) {
        const parsed = parseFrame(profile, frame.rawBytes);
        if (parsed) {
          return {
            valid: true,
            fields: parsed.map(f => ({
              name: f.name,
              value: f.decimal,
              hex: f.hex,
              highlight: 'ok' as const
            }))
          };
        }
      }
    } catch (err) {
      console.error('Decode error for frame', frame.frameNumber, err);
    }
    return null;
  }, [detected, frame.rawBytes, profile, frame.frameNumber]);

  const isValid = decoded?.valid ?? false;
  const isCRCOk =
    decoded && 'crcValid' in decoded
      ? (decoded as any).crcValid
      : decoded && 'checksumValid' in decoded
      ? (decoded as any).checksumValid
      : null;

  const protocolLabel =
    detected === 'modbus_rtu'
      ? 'Modbus RTU'
      : detected === 'nmea'
      ? 'NMEA 0183'
      : profile ? profile.name : 'Bilinmeyen';

  return (
    <div className="border border-gray-800/60 rounded-lg overflow-hidden mb-2">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 bg-gray-900/60 hover:bg-gray-800/60 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? (
          <ChevronDown size={12} className="text-gray-500 shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-gray-500 shrink-0" />
        )}
        <span className="font-mono text-[10px] text-gray-400">F#{frame.frameNumber}</span>
        <span className="font-mono text-[10px] text-gray-600">
          {(frame.rawHex || '').slice(0, 30)}{(frame.rawHex || '').length > 30 ? '…' : ''}
        </span>

        <span className="ml-auto flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-900/40 text-indigo-300 border border-indigo-800/40">
            {protocolLabel}
          </span>
          {isCRCOk === true && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <CheckCircle size={11} /> CRC OK
            </span>
          )}
          {isCRCOk === false && (
            <span className="flex items-center gap-1 text-[10px] text-red-400">
              <AlertTriangle size={11} /> CRC HATA
            </span>
          )}
          {!isValid && (
            <span className="flex items-center gap-1 text-[10px] text-yellow-400">
              <HelpCircle size={11} /> Decode Hatası
            </span>
          )}
        </span>
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-2 py-1 bg-gray-950/60">
          {!decoded || !isValid ? (
            <p className="text-gray-500 text-[11px] font-mono py-2 text-center">
              Bu frame {protocolLabel} protokolüne uymuyor
            </p>
          ) : (
            <div>
              {(decoded as any).fields?.map((field: DecodedField, i: number) => (
                <FieldRow key={i} field={field} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProtocolDecoderPanel({ frames, profile: _profile }: Props) {
  const [protocol, setProtocol] = useState<Protocol>('auto');
  const [maxFrames, setMaxFrames] = useState(20);

  const visibleFrames = useMemo(
    () => frames.slice(-maxFrames).reverse(),
    [frames, maxFrames]
  );

  const autoDetected = useMemo(() => {
    if (frames.length === 0) return 'unknown';
    const last = frames[frames.length - 1];
    if (!last || !last.rawBytes) return 'unknown';
    return detectProtocol(last.rawBytes);
  }, [frames]);

  return (
    <div className="h-full flex flex-col font-mono text-xs text-gray-300">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 bg-gray-900/40">
        <Cpu size={14} className="text-indigo-400" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-300">
          Protokol Çözücü
        </span>

        {/* Protocol selector */}
        <div className="flex items-center gap-1 ml-4">
          {(['auto', 'modbus_rtu', 'nmea'] as Protocol[]).map((p) => (
            <button
              key={p}
              onClick={() => setProtocol(p)}
              className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
                protocol === p
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
              }`}
            >
              {p === 'auto'
                ? `Otomatik${autoDetected !== 'unknown' ? ` (${autoDetected === 'nmea' ? 'NMEA' : 'Modbus RTU'})` : ''}`
                : p === 'modbus_rtu'
                ? 'Modbus RTU'
                : 'NMEA 0183'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-gray-500">
          <span className="text-[10px]">Son</span>
          <select
            value={maxFrames}
            onChange={(e) => setMaxFrames(Number(e.target.value))}
            className="bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-0.5"
          >
            {[5, 10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} frame
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Frame list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 custom-scrollbar">
        {visibleFrames.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <Cpu size={32} className="opacity-30" />
            <p className="text-[11px]">Henüz frame yok — simülasyonu başlatın</p>
          </div>
        ) : (
          visibleFrames.map((f, i) => (
            <FrameDecodeCard key={f.uId} frame={f} protocol={protocol} index={i} profile={_profile} />
          ))
        )}
      </div>
    </div>
  );
}
