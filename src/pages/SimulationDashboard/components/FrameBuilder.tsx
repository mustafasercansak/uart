import React, { useState, useCallback, useMemo } from 'react';
import {
  Hammer,
  Send,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  ChevronDown,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import type { FrameProfile } from '../../../types';
import { useTranslation } from '../../../i18n/LanguageContext';

// ─────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────

interface ByteCell {
  id: string;
  hex: string; // "00" – "FF"
  label?: string;
  locked?: boolean; // kilitli byte'lar (örn. header) silinemez
}

interface BuiltFrame {
  bytes: number[];
  hex: string;
  timestamp: number;
  note?: string;
}

// ─────────────────────────────────────────────
// YARDIMCILAR
// ─────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function isValidHex(s: string): boolean {
  return /^[0-9A-Fa-f]{1,2}$/.test(s.trim());
}

function padHex(s: string): string {
  return s.toUpperCase().padStart(2, '0');
}

function computeXOR(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc ^ b, 0);
}

function computeSum256(bytes: number[]): number {
  return bytes.reduce((acc, b) => (acc + b) & 0xff, 0);
}

function computeCRC16Modbus(bytes: number[]): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if (crc & 1) crc = (crc >> 1) ^ 0xa001;
      else crc >>= 1;
    }
  }
  return crc;
}

// ─────────────────────────────────────────────
// BYTE HÜCRESİ
// ─────────────────────────────────────────────

function ByteInput({
  cell,
  onChange,
  onDelete,
  onInsertAfter,
  selected,
  onSelect,
}: {
  cell: ByteCell;
  onChange: (id: string, val: string) => void;
  onDelete: (id: string) => void;
  onInsertAfter: (id: string) => void;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const valid = isValidHex(cell.hex) && cell.hex.length > 0;
  const decimal = valid ? parseInt(cell.hex, 16) : null;

  return (
    <div
      className={`flex flex-col items-center gap-0.5 group cursor-pointer select-none ${selected ? 'scale-110' : ''} transition-transform`}
      onClick={() => onSelect(cell.id)}
    >
      {/* Label above */}
      {cell.label && (
        <span className="text-[8px] font-mono text-gray-500 truncate max-w-[40px] text-center">
          {cell.label}
        </span>
      )}

      {/* Hex input */}
      <input
        className={`w-10 h-10 text-center font-mono text-sm font-bold uppercase rounded-lg border-2 outline-none transition-all ${
          cell.locked
            ? 'bg-gray-800 border-gray-600 text-gray-400 cursor-default'
            : valid
            ? selected
              ? 'bg-blue-900/60 border-blue-500 text-blue-200'
              : 'bg-gray-800/80 border-gray-600 hover:border-gray-400 text-gray-100 focus:border-blue-500 focus:bg-gray-800'
            : 'bg-red-950/40 border-red-700 text-red-300'
        }`}
        value={cell.hex}
        maxLength={2}
        readOnly={cell.locked}
        onChange={(e) => onChange(cell.id, e.target.value)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(cell.id);
        }}
        onFocus={(e) => e.target.select()}
        placeholder="00"
      />

      {/* Decimal below */}
      <span className="text-[9px] font-mono text-gray-600">
        {decimal !== null ? decimal : '??'}
      </span>

      {/* Action buttons on hover */}
      {!cell.locked && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInsertAfter(cell.id);
            }}
            className="p-0.5 text-gray-600 hover:text-blue-400 transition-colors"
            title={t('builder.insertAfter')}
          >
            <Plus size={9} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(cell.id);
            }}
            className="p-0.5 text-gray-600 hover:text-red-400 transition-colors"
            title={t('builder.delete')}
          >
            <Trash2 size={9} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// CHECKSUM HESAPLAYICI
// ─────────────────────────────────────────────

type CSAlgo = 'xor' | 'sum256' | 'crc16_modbus' | 'none';

function ChecksumBar({ bytes }: { bytes: number[] }) {
  const { t } = useTranslation();
  const [algo, setAlgo] = useState<CSAlgo>('xor');

  const result = useMemo(() => {
    if (bytes.length === 0) return null;
    switch (algo) {
      case 'xor':         return computeXOR(bytes);
      case 'sum256':      return computeSum256(bytes);
      case 'crc16_modbus': return computeCRC16Modbus(bytes);
      default:            return null;
    }
  }, [bytes, algo]);

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/50 rounded-lg border border-gray-800/50 text-[10px] font-mono">
      <span className="text-gray-500">Checksum:</span>
      <select
        value={algo}
        onChange={(e) => setAlgo(e.target.value as CSAlgo)}
        className="bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-1.5 py-0.5"
      >
        <option value="xor">XOR</option>
        <option value="sum256">SUM MOD 256</option>
        <option value="crc16_modbus">CRC-16 Modbus</option>
        <option value="none">{t('builder.noCalculation')}</option>
      </select>
      {result !== null && (
        <span className="text-emerald-400 font-bold">
          = 0x{result.toString(16).toUpperCase().padStart(algo === 'crc16_modbus' ? 4 : 2, '0')}
          <span className="text-gray-500 ml-1">({result})</span>
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SON GÖNDERILEN FRAME'LER
// ─────────────────────────────────────────────

function SentFrameRow({
  frame,
  onResend,
}: {
  frame: BuiltFrame;
  onResend: (bytes: number[]) => void;
}) {
  const { t, language } = useTranslation();
  const [copied, setCopied] = useState(false);
  const locale = language === 'tr' ? 'tr-TR' : 'en-US';

  const copy = useCallback(() => {
    navigator.clipboard.writeText(frame.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [frame.hex]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800/40 rounded font-mono text-[10px] group">
      <span className="text-gray-600 w-20 shrink-0 text-[9px]">
        {new Date(frame.timestamp).toLocaleTimeString(locale, { hour12: false })}
      </span>
      <span className="flex-1 text-gray-300 truncate">{frame.hex}</span>
      <span className="text-gray-600 shrink-0">{frame.bytes.length}B</span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={copy}
          className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
          title={t('builder.copy')}
        >
          {copied ? <CheckCircle size={11} className="text-emerald-400" /> : <Copy size={11} />}
        </button>
        <button
          onClick={() => onResend(frame.bytes)}
          className="p-1 text-gray-600 hover:text-emerald-400 transition-colors"
          title={t('builder.resend')}
        >
          <Send size={11} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ANA BİLEŞEN
// ─────────────────────────────────────────────

interface Props {
  profile: FrameProfile | null;
  onSendFrame: (bytes: number[]) => void; // callback: simülasyona inject et
}

export default function FrameBuilder({ profile, onSendFrame }: Props) {
  const { t } = useTranslation();
  const [cells, setCells] = useState<ByteCell[]>([
    { id: makeId(), hex: 'AA', label: 'Sync' },
    { id: makeId(), hex: '01', label: 'Addr' },
    { id: makeId(), hex: '03', label: 'FC' },
    { id: makeId(), hex: '00', label: 'Hi' },
    { id: makeId(), hex: '00', label: 'Lo' },
  ]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hexInput, setHexInput] = useState('');
  const [sentFrames, setSentFrames] = useState<BuiltFrame[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [note, setNote] = useState('');

  // Build byte array from cells
  const bytes = useMemo(
    () =>
      cells
        .filter((c) => isValidHex(c.hex) && c.hex.length > 0)
        .map((c) => parseInt(c.hex, 16)),
    [cells]
  );

  const hexString = useMemo(
    () => bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
    [bytes]
  );

  const hasInvalidCells = useMemo(
    () => cells.some((c) => !isValidHex(c.hex) || c.hex.length === 0),
    [cells]
  );

  // ── Cell mutations ───────────────────────────
  const updateCell = useCallback((id: string, val: string) => {
    setCells((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, hex: val.replace(/[^0-9A-Fa-f]/g, '').slice(0, 2) } : c
      )
    );
  }, []);

  const deleteCell = useCallback((id: string) => {
    setCells((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.id !== id);
    });
    setSelectedId(null);
  }, []);

  const insertAfter = useCallback((id: string) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const newCell: ByteCell = { id: makeId(), hex: '00' };
      return [...prev.slice(0, idx + 1), newCell, ...prev.slice(idx + 1)];
    });
  }, []);

  const addCell = useCallback(() => {
    setCells((prev) => [...prev, { id: makeId(), hex: '00' }]);
  }, []);

  const clearAll = useCallback(() => {
    setCells([{ id: makeId(), hex: '00' }]);
    setSelectedId(null);
  }, []);

  // ── Bulk hex input ───────────────────────────
  const loadFromHex = useCallback(() => {
    const raw = hexInput.trim().replace(/\s+/g, ' ');
    const parts = raw.split(/[\s,]+/);
    const newCells: ByteCell[] = parts
      .filter((p) => isValidHex(p))
      .map((p) => ({ id: makeId(), hex: padHex(p) }));
    if (newCells.length > 0) {
      setCells(newCells);
      setHexInput('');
    }
  }, [hexInput]);

  // ── Profil başlığından yükle ─────────────────
  const loadFromProfile = useCallback(() => {
    if (!profile?.framing?.header) return;
    const headerCells: ByteCell[] = profile.framing.header.map((b, i) => ({
      id: makeId(),
      hex: b.toString(16).padStart(2, '0').toUpperCase(),
      label: i === 0 ? 'Header' : '',
      locked: true,
    }));
    const remaining = cells.filter((c) => !c.locked);
    setCells([...headerCells, ...remaining]);
  }, [profile, cells]);

  // ── Gönder ───────────────────────────────────
  const send = useCallback(() => {
    if (bytes.length === 0 || hasInvalidCells) return;
    const frame: BuiltFrame = {
      bytes,
      hex: hexString,
      timestamp: Date.now(),
      note: note.trim() || undefined,
    };
    setSentFrames((prev) => [frame, ...prev].slice(0, 50));
    onSendFrame(bytes);
  }, [bytes, hexString, hasInvalidCells, note, onSendFrame]);

  const resend = useCallback(
    (b: number[]) => {
      const hex = b.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const frame: BuiltFrame = {
        bytes: b,
        hex,
        timestamp: Date.now(),
        note: t('builder.resendNote'),
      };
      setSentFrames((prev) => [frame, ...prev].slice(0, 50));
      onSendFrame(b);
    },
    [onSendFrame]
  );

  return (
    <div className="h-full flex flex-col font-mono text-xs text-gray-300">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 bg-gray-900/40">
        <Hammer size={14} className="text-amber-400" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-300">
          {t('builder.title')}
        </span>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={addCell}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 transition-all"
          >
            <Plus size={11} /> {t('builder.addByte')}
          </button>
          {profile?.framing?.header && profile.framing.header.length > 0 && (
            <button
              onClick={loadFromProfile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-indigo-900/40 hover:bg-indigo-800/50 text-indigo-300 border border-indigo-800/40 transition-all"
            >
              {t('builder.addHeader')}
            </button>
          )}
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] text-gray-500 hover:text-gray-300 transition-all"
          >
            <RotateCcw size={11} />
          </button>
        </div>

        <button
          onClick={send}
          disabled={bytes.length === 0 || hasInvalidCells}
          className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-emerald-900/30"
        >
          <Send size={13} /> {t('builder.send')} ({bytes.length}B)
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar space-y-4">

        {/* Byte grid */}
        <div className="flex flex-wrap gap-3 p-4 bg-gray-900/30 rounded-xl border border-gray-800/50 min-h-[96px] items-start">
          {cells.map((cell) => (
            <ByteInput
              key={cell.id}
              cell={cell}
              onChange={updateCell}
              onDelete={deleteCell}
              onInsertAfter={insertAfter}
              selected={selectedId === cell.id}
              onSelect={setSelectedId}
            />
          ))}
          <button
            onClick={addCell}
            className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-700 text-gray-600 hover:border-blue-600 hover:text-blue-400 transition-all self-start mt-4"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Invalid warning */}
        {hasInvalidCells && (
          <div className="flex items-center gap-2 text-[10px] text-yellow-400 bg-yellow-950/30 border border-yellow-900/40 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />
            {t('builder.invalidWarning')}
          </div>
        )}

        {/* Hex preview */}
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-950/60 rounded-lg border border-gray-800/40 text-[11px]">
          <span className="text-gray-500 shrink-0">Hex:</span>
          <span className="flex-1 text-emerald-300 font-bold break-all">{hexString || '—'}</span>
          <span className="text-gray-600 shrink-0">{bytes.length} byte</span>
        </div>

        {/* Checksum calculator */}
        <ChecksumBar bytes={bytes} />

        {/* Note field */}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('builder.notePlaceholder')}
          className="w-full bg-gray-900/50 border border-gray-700/50 text-gray-300 text-[10px] rounded-lg px-3 py-2 outline-none focus:border-gray-500 transition-all"
        />

        {/* Bulk hex import */}
        <div className="flex gap-2">
          <input
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            placeholder={t('builder.hexPlaceholder')}
            className="flex-1 bg-gray-900/50 border border-gray-700/50 text-gray-300 text-[10px] rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-all"
            onKeyDown={(e) => e.key === 'Enter' && loadFromHex()}
          />
          <button
            onClick={loadFromHex}
            disabled={!hexInput.trim()}
            className="px-3 py-2 rounded-lg text-[10px] font-bold bg-indigo-900/50 hover:bg-indigo-800/60 disabled:opacity-40 text-indigo-300 border border-indigo-800/50 transition-all"
          >
            {t('builder.load')}
          </button>
        </div>

        {/* Sent history */}
        {sentFrames.length > 0 && (
          <div className="border border-gray-800/50 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-900/50 text-[10px] text-gray-400 hover:bg-gray-800/50 transition-all"
              onClick={() => setShowHistory((h) => !h)}
            >
              <ChevronDown
                size={11}
                className={`transition-transform ${showHistory ? '' : '-rotate-90'}`}
              />
              <span className="font-bold uppercase tracking-wider">
                {t('builder.history')}
              </span>
              <span className="ml-auto text-gray-600">{sentFrames.length} frame</span>
            </button>
            {showHistory && (
              <div className="divide-y divide-gray-800/40 max-h-48 overflow-y-auto">
                {sentFrames.map((f, i) => (
                  <SentFrameRow key={i} frame={f} onResend={resend} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
