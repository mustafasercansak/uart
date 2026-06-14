import React, { memo, useState } from 'react';
import { X, ArrowUp, ArrowDown, Clock, Copy, Check } from 'lucide-react';
import type { Exchange } from '../../../types';

interface Props {
  exchange: Exchange;
  onClose: () => void;
}

function hexToAscii(rawHex: string): string {
  return rawHex
    .trim()
    .split(/\s+/)
    .map(h => {
      const n = parseInt(h, 16);
      if (n === 0x0d || n === 0x0a) return '\n';
      return n >= 0x20 && n < 0x7f ? String.fromCharCode(n) : '·';
    })
    .join('')
    .trim();
}

function formatBytes(rawHex: string): string {
  const count = rawHex.trim().split(/\s+/).filter(Boolean).length;
  return `${count} B`;
}

function ts(ms: number): string {
  const d = new Date(ms);
  const hms = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${hms}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="p-1 text-gray-600 hover:text-gray-300 transition-colors">
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  );
}

const ExchangeDetail = memo(({ exchange, onClose }: Props) => {
  const [showHex, setShowHex] = useState(false);

  const tx = exchange.tx;
  const rx = exchange.rx;
  const latency = exchange.latencyMs;

  const txText = tx ? hexToAscii(tx.rawHex) : null;
  const rxText = rx ? hexToAscii(rx.rawHex) : null;

  return (
    <div className="h-full flex flex-col bg-gray-950/80 border-l border-white/5 font-mono text-[11px] overflow-hidden">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[8px] uppercase tracking-widest text-gray-500">Exchange</span>
            {latency !== undefined && (
              <span className="ml-2 flex items-center gap-1 text-[8px] text-gray-600">
                <Clock size={8} />
                {latency.toFixed(1)} ms
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHex(v => !v)}
            className={`text-[8px] px-1.5 py-0.5 rounded border transition-colors uppercase tracking-widest ${
              showHex
                ? 'bg-gray-700 border-gray-600 text-gray-300'
                : 'border-gray-800 text-gray-600 hover:text-gray-400'
            }`}
          >
            HEX
          </button>
          <button onClick={onClose} className="p-1 text-gray-600 hover:text-gray-300 transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">

        {/* TX */}
        {tx && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-widest text-emerald-500">
                <ArrowUp size={9} />
                TX
                <span className="text-gray-700">{formatBytes(tx.rawHex)}</span>
                <span className="text-gray-700 normal-case">{ts(tx.timestamp)}</span>
              </div>
              <CopyButton text={txText ?? tx.rawHex} />
            </div>
            <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2">
              {showHex ? (
                <div className="text-emerald-700 text-[9px] break-all leading-relaxed">{tx.rawHex}</div>
              ) : (
                <pre className="text-emerald-300 text-[11px] whitespace-pre-wrap break-all leading-relaxed">{txText}</pre>
              )}
            </div>
          </div>
        )}

        {/* Latency divider */}
        {tx && rx && latency !== undefined && (
          <div className="flex items-center gap-2 text-[8px] text-gray-700">
            <div className="flex-1 border-t border-gray-800/60" />
            <span className="flex items-center gap-1"><Clock size={8} />{latency.toFixed(1)} ms</span>
            <div className="flex-1 border-t border-gray-800/60" />
          </div>
        )}

        {/* RX */}
        {rx && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-widest text-blue-400">
                <ArrowDown size={9} />
                RX
                <span className="text-gray-700">{formatBytes(rx.rawHex)}</span>
                <span className="text-gray-700 normal-case">{ts(rx.timestamp)}</span>
              </div>
              <CopyButton text={rxText ?? rx.rawHex} />
            </div>
            <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg px-3 py-2">
              {showHex ? (
                <div className="text-blue-700 text-[9px] break-all leading-relaxed">{rx.rawHex}</div>
              ) : (
                <pre className="text-blue-200 text-[11px] whitespace-pre-wrap break-all leading-relaxed">{rxText}</pre>
              )}
            </div>
          </div>
        )}

        {!tx && !rx && (
          <div className="text-gray-700 text-[10px] text-center py-8">No data</div>
        )}
      </div>
    </div>
  );
});

ExchangeDetail.displayName = 'ExchangeDetail';
export default ExchangeDetail;
