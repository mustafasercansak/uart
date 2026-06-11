import React, { memo } from 'react';
import { Columns, Zap, Target } from 'lucide-react';
import type { GeneratedFrame, FrameProfile } from '../../../../types';
import { useTranslation } from '../../../../i18n/context';

interface DiffLabProps {
  frameA: GeneratedFrame | null;
  frameB: GeneratedFrame | null;
  profile?: FrameProfile | null;
  onClear: () => void;
}

function isPrintable(b: number) { return b >= 0x20 && b <= 0x7e; }

function toAsciiChar(b: number): string {
  if (b === 0x0a) return '↵';
  if (b === 0x0d) return '␍';
  if (isPrintable(b)) return String.fromCharCode(b);
  return '·';
}

function bytesToAscii(bytes: number[]): string {
  return bytes.map(toAsciiChar).join('');
}

function isAllText(bytes: number[]): boolean {
  return bytes.length > 0 && bytes.every(b => isPrintable(b) || b === 0x0a || b === 0x0d);
}

function readField(bytes: number[], offset: number, width: number, endianness: 'big' | 'little'): number {
  let val = 0;
  if (endianness === 'little') {
    for (let i = 0; i < width; i++) val |= ((bytes[offset + i] ?? 0) << (i * 8));
  } else {
    for (let i = 0; i < width; i++) val = (val << 8) | (bytes[offset + i] ?? 0);
  }
  return val >>> 0;
}

const DiffLab = memo(({ frameA, frameB, profile, onClear }: DiffLabProps) => {
  const { t } = useTranslation();

  if (!frameA || !frameB) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-500 font-mono">
        <Columns size={48} className="mb-4 text-gray-800" />
        <h3 className="text-gray-300 font-black uppercase tracking-widest mb-2">{t('diffLab.title')}</h3>
        <p className="max-w-md text-xs leading-relaxed">{t('diffLab.description')}</p>
      </div>
    );
  }

  const sortedFields = profile ? [...profile.fields].sort((a, b) => a.order - b.order) : [];
  const hasFields = sortedFields.length > 0;

  /* ── Flat byte grid (no profile / no fields) ──────────────── */
  const renderFlatGrid = (frame: GeneratedFrame, other: GeneratedFrame) => {
    const isText = isAllText(frame.rawBytes);
    return (
      <div className="space-y-3">
        {/* ASCII banner when data is text */}
        {isText && (
          <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2">
            <span className="text-[8px] font-mono font-black uppercase text-emerald-500/60 mr-2">ASCII</span>
            <span className="text-[11px] font-mono text-emerald-300 break-all">
              {bytesToAscii(frame.rawBytes)}
            </span>
          </div>
        )}
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5 font-mono">
          {frame.rawBytes.map((byte, i) => {
            const hasDiff = byte !== (other.rawBytes[i] ?? -1);
            return (
              <div
                key={i}
                className={`flex flex-col items-center py-2 px-1 rounded-lg border transition-all ${
                  hasDiff
                    ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.12)]'
                    : 'bg-gray-900/60 border-gray-800/60'
                }`}
              >
                <span className={`text-[11px] font-black leading-none ${hasDiff ? 'text-red-400' : 'text-gray-300'}`}>
                  {byte.toString(16).padStart(2, '0').toUpperCase()}
                </span>
                <span className={`text-[9px] mt-1 leading-none ${hasDiff ? 'text-red-300/70' : 'text-gray-500'}`}>
                  {toAsciiChar(byte)}
                </span>
                <span className="text-[7px] text-gray-700 mt-0.5">[{i}]</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── Profile-aware field grid ─────────────────────────────── */
  const renderFieldGrid = (frame: GeneratedFrame, other: GeneratedFrame) => {
    const isText = isAllText(frame.rawBytes);

    return (
      <div className="space-y-3">
        {/* Full-frame ASCII banner */}
        {isText && (
          <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2">
            <span className="text-[8px] font-mono font-black uppercase text-emerald-500/60 mr-2">ASCII</span>
            <span className="text-[11px] font-mono text-emerald-300 break-all">
              {bytesToAscii(frame.rawBytes)}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 font-mono">
          {(() => {
            let offset = 0;
            return sortedFields.map(field => {
              const w = field.byteWidth;
              const fieldBytes = frame.rawBytes.slice(offset, offset + w);
              const otherBytes = other.rawBytes.slice(offset, offset + w);
              const hexStr = fieldBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
              const decimal = readField(frame.rawBytes, offset, w, field.endianness ?? 'big');
              const decimalOther = readField(other.rawBytes, offset, w, field.endianness ?? 'big');
              const hasDiff = fieldBytes.some((b, i) => b !== (otherBytes[i] ?? -1));
              const asciiRepr = isAllText(fieldBytes) ? bytesToAscii(fieldBytes) : null;
              offset += w;

              return (
                <div
                  key={field.id}
                  className={`flex flex-col items-center py-2 px-2.5 rounded-lg border transition-all min-w-[52px] ${
                    hasDiff
                      ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.12)]'
                      : 'bg-gray-900/60 border-gray-800/60'
                  }`}
                >
                  {/* Field name */}
                  <span className={`text-[8px] font-black uppercase tracking-wide mb-1 leading-none ${hasDiff ? 'text-red-400' : 'text-blue-400/80'}`}>
                    {field.name}
                  </span>
                  {/* Hex */}
                  <span className={`text-[10px] font-black leading-none ${hasDiff ? 'text-red-300' : 'text-gray-200'}`}>
                    {hexStr}
                  </span>
                  {/* ASCII repr when printable */}
                  {asciiRepr ? (
                    <span className={`text-[9px] mt-1 leading-none ${hasDiff ? 'text-orange-300' : 'text-emerald-400/80'}`}>
                      {asciiRepr}
                    </span>
                  ) : (
                    <span className={`text-[9px] mt-1 leading-none ${hasDiff ? 'text-red-300/60' : 'text-gray-500'}`}>
                      {decimal}
                    </span>
                  )}
                  {/* Other frame value when differs */}
                  {hasDiff && (
                    <span className="text-[8px] text-orange-400/60 line-through leading-none mt-0.5">
                      {decimalOther}
                    </span>
                  )}
                  <span className="text-[7px] text-gray-700 mt-1">{w}B</span>
                </div>
              );
            });
          })()}
        </div>
      </div>
    );
  };

  /* ── Bit-level diff map ──────────────────────────────────── */
  const renderBitDiff = (bytesA: number[], bytesB: number[]) => {
    const totalBytes = Math.max(bytesA.length, bytesB.length);
    const result: { byteIdx: number; bitIdx: number; valA: number; valB: number; diff: boolean }[] = [];
    for (let i = 0; i < totalBytes; i++) {
      const bA = bytesA[i] ?? 0;
      const bB = bytesB[i] ?? 0;
      for (let bit = 7; bit >= 0; bit--) {
        const valA = (bA >> bit) & 1;
        const valB = (bB >> bit) & 1;
        result.push({ byteIdx: i, bitIdx: bit, valA, valB, diff: valA !== valB });
      }
    }
    return (
      <div className="flex flex-wrap gap-px bg-gray-900 border border-gray-800 p-3 rounded-lg overflow-hidden">
        {result.map((r, i) => (
          <div
            key={i}
            className={`w-3 h-5 flex items-center justify-center text-[8px] font-mono select-none transition-colors border-r border-gray-800/20 ${
              r.diff ? 'bg-red-500/40 text-white font-bold' : 'text-gray-600'
            }`}
            title={t('diffLab.bitTooltip', { byteIdx: r.byteIdx, bitIdx: r.bitIdx })}
          >
            {r.valB}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col p-6 space-y-8 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <Target className="text-blue-500" size={20} />
          <div>
            <h2 className="text-gray-200 text-xs font-black uppercase tracking-widest">{t('diffLab.analysisTitle')}</h2>
            <p className="text-[10px] text-gray-500 font-mono">
              F# {frameA.frameNumber} vs F# {frameB.frameNumber}
              {profile && <span className="ml-2 text-blue-400/60">· {profile.name}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={onClear}
          className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-mono rounded-lg transition-colors border border-gray-700"
        >
          {t('diffLab.reset')}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-mono text-gray-400 uppercase font-black">{t('diffLab.referencePacket')}</span>
          </div>
          {hasFields ? renderFieldGrid(frameA, frameB) : renderFlatGrid(frameA, frameB)}
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-[10px] font-mono text-gray-400 uppercase font-black">{t('diffLab.testPacket')}</span>
          </div>
          {hasFields ? renderFieldGrid(frameB, frameA) : renderFlatGrid(frameB, frameA)}
        </div>
      </div>

      <div className="space-y-3 pt-4">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-yellow-500" />
          <span className="text-[10px] font-mono text-gray-400 uppercase font-black">{t('diffLab.bitChangeMap')}</span>
        </div>
        {renderBitDiff(frameA.rawBytes, frameB.rawBytes)}
      </div>

      <div className="mt-auto p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
        <p className="text-[10px] text-blue-400/80 font-mono italic">{t('diffLab.tip')}</p>
      </div>
    </div>
  );
});

DiffLab.displayName = 'DiffLab';
export default DiffLab;
