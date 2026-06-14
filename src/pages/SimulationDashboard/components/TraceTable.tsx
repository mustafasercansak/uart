import React, { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Search, Filter, Activity, Terminal, AlertCircle, CheckCircle2, MessageSquare, Table, Send, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import type { Exchange, FrameProfile } from '../../../types';
import { FilterEngine } from '../../../engines/FilterEngine';
import { useTranslation } from '../../../i18n/context';

function isPrintable(b: number) { return b >= 0x20 && b <= 0x7e; }
function toAsciiChar(b: number): string {
  if (b === 0x0a) return '↵';
  if (b === 0x0d) return '␍';
  if (isPrintable(b)) return String.fromCharCode(b);
  return '·';
}

function hexToBytes(hex: string): number[] {
  return hex.split(' ').filter(Boolean).map(h => parseInt(h, 16));
}

function bytesToAsciiString(bytes: number[]): string {
  return bytes.map(toAsciiChar).join('');
}

function formatByteSize(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  const kilobytes = byteLength / 1024;
  return `${Number.isInteger(kilobytes) ? kilobytes : kilobytes.toFixed(1)} KB`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `[${time}.${date.getMilliseconds().toString().padStart(3, '0')}]`;
}

interface TraceTableProps {
  exchanges: Exchange[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  displayFilter: string;
  onFilterChange: (filter: string) => void;
  profile?: FrameProfile | null;
  onSendText?: (text: string) => void;
  onSendRaw?: (hex: string) => void;
  isConnected?: boolean;
}

function framingLabel(profile: FrameProfile | null | undefined): string {
  if (!profile) return '';
  const mode = profile.framing?.mode ?? 'fixed';
  if (mode === 'delimiter') {
    const raw = profile.framing.delimiter ?? 0x0a;
    const bytes = Array.isArray(raw) ? raw : [raw];
    const str = bytes.map(b => {
      if (b === 0x0a) return '\\n';
      if (b === 0x0d) return '\\r';
      return `0x${b.toString(16).padStart(2, '0').toUpperCase()}`;
    }).join('');
    return `${str} DELİMİTER`;
  }
  if (mode === 'fixed') {
    const size = profile.fields.reduce((s, f) => s + f.byteWidth, 0);
    return `${size}B SABİT`;
  }
  return mode.toUpperCase();
}

const TraceTable = memo(({ exchanges, selectedId, onSelect, displayFilter, onFilterChange, profile, onSendText, onSendRaw, isConnected = false }: TraceTableProps) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'chat' | 'table'>('chat');
  const [dataFormat, setDataFormat] = useState<'text' | 'hex'>('text');

  // Message input states
  const [inputVal, setInputVal] = useState('');
  const [sendFormat, setSendFormat] = useState<'text' | 'hex'>('text');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const filterStatus = useMemo(() => FilterEngine.validate(displayFilter), [displayFilter]);

  const filteredExchanges = useMemo(() => {
    if (!displayFilter) return exchanges;
    return exchanges.filter(ex => FilterEngine.evaluate(ex, displayFilter, profile || undefined));
  }, [exchanges, displayFilter, profile]);

  // Filter result navigation
  const [matchIndex, setMatchIndex] = useState(0);
  useEffect(() => { setMatchIndex(0); }, [displayFilter]);

  const matchCount = filteredExchanges.length;
  const currentMatch = displayFilter && matchCount > 0 ? filteredExchanges[matchIndex] : null;

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    const next = (matchIndex + 1) % matchCount;
    setMatchIndex(next);
    onSelect(filteredExchanges[next].id);
  }, [matchIndex, matchCount, filteredExchanges, onSelect]);

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    const prev = (matchIndex - 1 + matchCount) % matchCount;
    setMatchIndex(prev);
    onSelect(filteredExchanges[prev].id);
  }, [matchIndex, matchCount, filteredExchanges, onSelect]);

  // Auto scroll to bottom in chat view when new messages arrive
  useEffect(() => {
    if (viewMode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredExchanges.length, viewMode]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || !isConnected) return;

    if (sendFormat === 'text') {
      onSendText?.(inputVal);
    } else {
      // Validate hex input
      const hexClean = inputVal.replace(/[^0-9A-Fa-f\s]/g, '');
      onSendRaw?.(hexClean);
    }
    setInputVal('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-950/20 border border-gray-800/50 rounded-xl overflow-hidden shadow-2xl backdrop-blur-sm">
      {/* Table Header / Toolbar */}
      <div className="p-3 bg-gray-900/40 border-b border-gray-800 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 shrink-0">
          <Terminal size={14} className="text-blue-400" />
          <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest">{t('trace.title')}</span>
          <div className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-mono">
            {t('trace.packets', { count: filteredExchanges.length })}
          </div>
        </div>

        {/* View mode toggle controls */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-gray-800 shrink-0">
          <button
            onClick={() => setViewMode('chat')}
            className={`px-2 py-1 rounded text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
              viewMode === 'chat' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={t('trace.titleChatMode')}
          >
            <MessageSquare size={10} />
            {t('trace.viewChat')}
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-2 py-1 rounded text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
              viewMode === 'table' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={t('trace.titleTableMode')}
          >
            <Table size={10} />
            {t('trace.viewTable')}
          </button>
        </div>

        {/* Data format toggle controls */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-gray-800 shrink-0">
          <button
            onClick={() => setDataFormat('text')}
            className={`px-2 py-1 rounded text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
              dataFormat === 'text' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={t('trace.titleFormatText')}
          >
            {t('trace.formatText')}
          </button>
          <button
            onClick={() => setDataFormat('hex')}
            className={`px-2 py-1 rounded text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
              dataFormat === 'hex' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={t('trace.titleFormatHex')}
          >
            {t('trace.formatHex')}
          </button>
        </div>

        {/* Filter input + navigation */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xs">
          <div className="relative flex-1 group">
            <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 transition-colors ${
              !displayFilter ? 'text-gray-600' : (filterStatus.isValid ? 'text-emerald-500' : 'text-rose-500')
            }`} />
            <input
              type="text"
              placeholder={t('trace.filterPlaceholder')}
              className={`w-full bg-black/60 border rounded-lg py-1.5 pl-8 pr-8 text-[11px] font-mono transition-all placeholder:text-gray-700 focus:outline-none ${
                !displayFilter
                ? 'border-gray-800 text-gray-300 focus:border-blue-500/50'
                : (filterStatus.isValid
                  ? 'border-emerald-500/30 text-emerald-100 bg-emerald-500/5 focus:border-emerald-500/50'
                  : 'border-rose-500/30 text-rose-100 bg-rose-500/5 focus:border-rose-500/50')
              }`}
              value={displayFilter}
              onChange={(e) => { onFilterChange(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.shiftKey ? goPrev() : goNext(); }
              }}
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              {displayFilter && (
                filterStatus.isValid
                ? <CheckCircle2 size={12} className="text-emerald-500/50" />
                : <AlertCircle size={12} className="text-rose-500/50" />
              )}
            </div>
          </div>

          {/* Match counter + prev/next */}
          {displayFilter && filterStatus.isValid && matchCount > 0 && (
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[9px] text-gray-600 font-mono px-1 whitespace-nowrap">
                {matchIndex + 1}/{matchCount}
              </span>
              <button
                onClick={goPrev}
                className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
                title="Önceki eşleşme (Shift+Enter)"
              >
                <ChevronUp size={12} />
              </button>
              <button
                onClick={goNext}
                className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
                title="Sonraki eşleşme (Enter)"
              >
                <ChevronDown size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {filteredExchanges.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-700 italic py-20">
            <Activity size={32} className="opacity-20 animate-pulse mb-3" />
            <span>{t('trace.noTraffic')}</span>
          </div>
        ) : viewMode === 'chat' ? (
          /* WhatsApp Style Chat View */
          <div className="flex flex-col gap-3 max-w-4xl mx-auto pb-4">
            {(() => {
              const bubbles = filteredExchanges.flatMap((ex) => {
                const list = [];
                if (ex.tx) {
                  const rawBytes = hexToBytes(ex.tx.rawHex);
                  const messageText = dataFormat === 'text' ? bytesToAsciiString(rawBytes) : ex.tx.rawHex;
                  const timestamp = ex.tx.timestamp || ex.startTime;
                  list.push({
                    id: `${ex.id}-tx`,
                    exId: ex.id,
                    isOutgoing: true,
                    timeSort: timestamp,
                    timeStr: formatTimestamp(timestamp),
                    messageText,
                    byteLength: rawBytes.length,
                    isSelected: selectedId === ex.id
                  });
                }
                if (ex.rx) {
                  const rawBytes = hexToBytes(ex.rx.rawHex);
                  const messageText = dataFormat === 'text' ? bytesToAsciiString(rawBytes) : ex.rx.rawHex;
                  const timestamp = ex.rx.timestamp || (ex.startTime + (ex.latencyMs || 0));
                  list.push({
                    id: `${ex.id}-rx`,
                    exId: ex.id,
                    isOutgoing: false,
                    timeSort: timestamp,
                    timeStr: formatTimestamp(timestamp),
                    messageText,
                    byteLength: rawBytes.length,
                    isSelected: selectedId === ex.id
                  });
                }
                return list;
              });

              // Sort bubbles by timestamp
              bubbles.sort((a, b) => a.timeSort - b.timeSort);

              return bubbles.map((bubble) => {
                const isLargePayload = bubble.byteLength > 512;
                const previewText = isLargePayload
                  ? `${bubble.messageText.slice(0, 256)}${bubble.messageText.length > 256 ? '...' : ''}`
                  : bubble.messageText;

                return (
                  <div
                    key={bubble.id}
                    className={`flex w-full ${bubble.isOutgoing ? 'justify-end' : 'justify-start'}`}
                    onClick={() => onSelect(bubble.exId)}
                  >
                    <div
                      className={`max-w-[75%] flex flex-col cursor-pointer ${
                        bubble.isOutgoing ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 shadow-lg transition-all border ${
                          bubble.isOutgoing
                            ? 'bg-blue-600/10 hover:bg-blue-600/20 border-blue-500/30 text-blue-100 rounded-tr-none'
                            : 'bg-emerald-600/10 hover:bg-emerald-600/20 border-emerald-500/20 text-emerald-100 rounded-tl-none'
                        } ${bubble.isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-950 scale-[1.01]' : ''}`}
                      >
                        {isLargePayload ? (
                          <details className="group/payload min-w-64 max-w-xl">
                            <summary className="list-none cursor-pointer">
                              <div className="flex items-center justify-between gap-4 text-[10px] font-mono uppercase tracking-wider text-amber-300">
                                <span>{t('trace.largePayload')}</span>
                                <span>{formatByteSize(bubble.byteLength)}</span>
                              </div>
                              <div className="mt-2 max-h-20 overflow-hidden text-[11px] font-mono break-all whitespace-pre-wrap leading-relaxed text-gray-300">
                                {previewText}
                              </div>
                              <div className="mt-2 text-[9px] font-mono text-blue-400 group-open/payload:hidden">
                                {t('trace.expandPayload')}
                              </div>
                            </summary>
                            <div className="mt-3 max-h-80 overflow-auto custom-scrollbar border-t border-white/10 pt-3 text-[11px] font-mono break-all whitespace-pre-wrap leading-relaxed">
                              {bubble.messageText}
                            </div>
                          </details>
                        ) : (
                          <div className="text-xs font-mono break-all whitespace-pre-wrap leading-relaxed">
                            {bubble.messageText}
                          </div>
                        )}
                      </div>
                      <div
                        className={`mt-1 flex items-center gap-1.5 text-[9px] font-mono text-gray-500 ${
                          bubble.isOutgoing ? 'pr-1' : 'pl-1'
                        }`}
                      >
                        <time dateTime={new Date(bubble.timeSort).toISOString()}>{bubble.timeStr}</time>
                        <span aria-hidden="true">·</span>
                        <span>
                          {formatByteSize(bubble.byteLength)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            <div ref={chatEndRef} />
          </div>
        ) : (
          /* Classic Table View */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[600px]">
              <thead className="sticky top-0 z-20 bg-gray-900 shadow-md">
                <tr className="text-[10px] font-mono text-gray-500 uppercase border-b border-gray-800">
                  <th className="p-3 w-16">{t('trace.headers.no')}</th>
                  <th className="p-3 w-28">{t('trace.headers.time')}</th>
                  <th className="p-3 w-24">{t('trace.headers.source')}</th>
                  <th className="p-3 w-20">{t('trace.headers.size')}</th>
                  <th className="p-3">{t('trace.headers.info')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/50 font-mono text-[11px]">
                {filteredExchanges.map((ex, idx) => {
                  const isSelected = selectedId === ex.id;
                  const time = new Date(ex.startTime).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + (ex.startTime % 1000).toString().padStart(3, '0');
                  const hasError = (ex.tx?.status === 'fail' || ex.rx?.status === 'fail' || (ex.tx && ex.rx && !ex.isLoopbackMatch)) && !ex.isLoopbackMatch;
                  const rawHex = ex.tx?.rawHex || ex.rx?.rawHex || '';
                  const rawBytes = hexToBytes(rawHex);
                  const displayStr = dataFormat === 'text' ? bytesToAsciiString(rawBytes) : rawHex;

                  return (
                    <tr
                      key={ex.id}
                      onClick={() => onSelect(ex.id)}
                      className={`cursor-pointer group transition-all ${
                        isSelected
                          ? 'bg-blue-500/10 border-l-4 border-l-blue-500'
                          : hasError ? 'bg-red-500/5 hover:bg-red-500/10 border-l-4 border-l-red-500/50' : 'hover:bg-white/5 border-l-4 border-l-transparent'
                      }`}
                    >
                      <td className="p-3 text-gray-600 tabular-nums">{idx + 1}</td>
                      <td className="p-3 text-gray-400 tabular-nums">{time}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border ${
                          ex.tx ? 'bg-blue-900/20 border-blue-500/20 text-blue-400' : 'bg-emerald-900/20 border-emerald-500/20 text-emerald-400'
                        }`}>
                          {ex.tx ? t('trace.source.tx') : t('trace.source.rx')}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500">{rawBytes.length}{t('common.byte').charAt(0).toUpperCase()}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <span className="font-mono text-[11px] text-gray-200 truncate group-hover:text-white transition-colors">
                            {displayStr}
                          </span>
                          {dataFormat === 'hex' && (
                            <span className="font-mono text-[10px] text-emerald-400/50 truncate">
                              {bytesToAsciiString(rawBytes)}
                            </span>
                          )}
                          {ex.latencyMs !== undefined && (
                            <span className="text-[10px] text-gray-600 italic">({t('trace.latency', { ms: ex.latencyMs })})</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sending input area at the bottom */}
      <form onSubmit={handleSendMessage} className="p-3 bg-gray-900/50 border-t border-gray-800/80 flex items-center gap-2 shrink-0">
        {/* Toggle send format */}
        <div className="flex items-center bg-black/60 rounded-lg p-0.5 border border-gray-800">
          <button
            type="button"
            disabled={!isConnected}
            onClick={() => setSendFormat('text')}
            className={`px-2 py-1 rounded text-[8px] font-mono font-black uppercase tracking-wider transition-all disabled:opacity-30 ${
              sendFormat === 'text' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t('trace.formatAscii')}
          </button>
          <button
            type="button"
            disabled={!isConnected}
            onClick={() => setSendFormat('hex')}
            className={`px-2 py-1 rounded text-[8px] font-mono font-black uppercase tracking-wider transition-all disabled:opacity-30 ${
              sendFormat === 'hex' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t('trace.formatHex')}
          </button>
        </div>

        {/* Input box */}
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          disabled={!isConnected}
          placeholder={
            !isConnected
              ? t('trace.placeholderConnectFirst')
              : sendFormat === 'text'
                ? t('trace.placeholderSendText')
                : t('trace.placeholderSendHex')
          }
          className="flex-1 bg-black/60 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono placeholder:text-gray-700 text-gray-200 outline-none focus:border-blue-500/50 disabled:opacity-40"
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!isConnected || !inputVal.trim()}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-lg flex items-center gap-1.5 text-xs font-mono font-bold transition-all shadow-lg shadow-blue-500/10"
        >
          <Send size={12} />
          {t('trace.btnSend')}
        </button>
      </form>

      {/* Table Footer */}
      <div className="p-2.5 bg-gray-900/60 border-t border-gray-800 flex justify-between items-center text-[10px] font-mono text-gray-500">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span>{t('trace.source.tx')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{t('trace.source.rx')}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span>{t('trace.bitrate')} <span className="text-gray-300">{profile?.baudRate?.toLocaleString() ?? '–'} BAUD</span></span>
          {profile && (
            <span className="px-2 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400 font-black tracking-wider">
              {profile.name} · {framingLabel(profile)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

TraceTable.displayName = 'TraceTable';

export default TraceTable;
