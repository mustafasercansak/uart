import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Network, Send, RefreshCw, Cpu, ToggleLeft, ToggleRight, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Play, Square } from 'lucide-react';
import type { ModbusFrame, ModbusSlaveState, ModbusRegister, ModbusCoil } from '../../../types/protocols/modbus';
import { MODBUS_FC_LABELS } from '../../../types/protocols/modbus';
import {
  buildModbusRequest,
  buildModbusWriteMultiple,
  buildModbusResponse,
  makeDefaultSlaveState,
  frameToHexString,
  crc16Modbus,
} from '../../../utils/modbus';
import { useTranslation } from '../../../i18n/context';

const FC_OPTIONS = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x10] as const;

interface LogEntry {
  id: number;
  frame: ModbusFrame;
  response?: ModbusFrame;
}

let logCounter = 0;

export default function ModbusPanel() {
  const { t } = useTranslation();
  const [slaveState, setSlaveState] = useState<ModbusSlaveState>(() => makeDefaultSlaveState(1));
  const [deviceAddress, setDeviceAddress] = useState(1);
  const [functionCode, setFunctionCode] = useState<number>(0x03);
  const [startAddress, setStartAddress] = useState(0);
  const [quantity, setQuantity] = useState(4);
  const [writeValue, setWriteValue] = useState(0);
  const [writeValues, setWriteValues] = useState('100 200 300 400');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'builder' | 'slave' | 'raw'>('builder');

  const slaveRef = useRef(slaveState);
  slaveRef.current = slaveState;

  const [polling, setPolling] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(1000);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendRequestRef = useRef<(() => void) | null>(null);

  const isWrite = [0x05, 0x06, 0x0f, 0x10].includes(functionCode);
  const isMultiWrite = functionCode === 0x10 || functionCode === 0x0f;

  const sendRequest = useCallback(() => {
    let request: ModbusFrame;

    if (isMultiWrite) {
      const vals = writeValues.split(/[\s,]+/).map(v => parseInt(v)).filter(v => !isNaN(v));
      request = buildModbusWriteMultiple(deviceAddress, startAddress, vals);
    } else {
      request = buildModbusRequest(deviceAddress, functionCode, startAddress, isWrite ? writeValue : quantity);
    }

    const slaveCopy: ModbusSlaveState = JSON.parse(JSON.stringify(slaveRef.current));
    const response = buildModbusResponse(request, slaveCopy);
    setSlaveState(slaveCopy);

    const entry: LogEntry = { id: ++logCounter, frame: request, response };
    setLog(prev => [entry, ...prev].slice(0, 100));
    setExpandedId(prev => prev === null ? entry.id : prev);
  }, [deviceAddress, functionCode, startAddress, quantity, writeValue, writeValues, isWrite, isMultiWrite]);

  sendRequestRef.current = sendRequest;

  const startPolling = useCallback(() => {
    setPolling(true);
    pollRef.current = setInterval(() => sendRequestRef.current?.(), pollIntervalMs);
  }, [pollIntervalMs]);

  const stopPolling = () => {
    setPolling(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const sendRaw = () => {
    setRawError(null);
    setRawResult(null);
    try {
      const bytes = rawInput.trim().split(/\s+/).map(s => {
        const v = parseInt(s, 16);
        if (isNaN(v) || v < 0 || v > 255) throw new Error(t('modbus.invalidByte', { byte: s }));
        return v;
      });
      if (bytes.length < 4) throw new Error(t('modbus.minBytesRequired'));
      const bodyWithoutCrc = bytes.slice(0, -2);
      const givenCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
      const calcCrc = crc16Modbus(bodyWithoutCrc);
      if (givenCrc !== calcCrc) {
        setRawError(t('modbus.crcMismatch', {
          given: '0x' + givenCrc.toString(16).toUpperCase().padStart(4,'0'),
          calc: '0x' + calcCrc.toString(16).toUpperCase().padStart(4,'0'),
        }));
        return;
      }
      setRawResult(`CRC ✓  |  ${bytes.length} byte  |  ${t('modbus.deviceAddress')}: ${bytes[0]}  |  FC: 0x${bytes[1].toString(16).toUpperCase()} (${MODBUS_FC_LABELS[bytes[1]] ?? '?'})`);
    } catch (e) {
      setRawError((e as Error).message);
    }
  };

  const TAB_LABELS: Record<'builder' | 'slave' | 'raw', string> = {
    builder: t('modbus.tabBuilder'),
    slave: t('modbus.tabSlave'),
    raw: t('modbus.tabRaw'),
  };

  return (
    <div className="h-full flex flex-col font-mono text-xs overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 bg-gray-900/40">
        <div className="p-1.5 bg-amber-500/10 rounded-lg">
          <Network size={14} className="text-amber-400" />
        </div>
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-200">{t('modbus.title')}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <select
              value={pollIntervalMs}
              onChange={e => { stopPolling(); setPollIntervalMs(+e.target.value); }}
              className="bg-gray-900/60 border border-gray-800/50 rounded px-2 py-1 text-gray-400 text-[9px] outline-none"
            >
              <option value={500}>500ms</option>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
            <button
              onClick={polling ? stopPolling : startPolling}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${polling ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-amber-700 hover:bg-amber-600 text-white'}`}
            >
              {polling ? <><Square size={10} /> Stop</> : <><Play size={10} /> Auto Poll</>}
            </button>
          </div>
          <div className="flex items-center gap-1 bg-gray-900/60 border border-gray-800/50 rounded-lg p-1">
            {(['builder', 'slave', 'raw'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-[9px] uppercase tracking-widest font-bold rounded-md transition-all ${activeTab === tab ? 'bg-amber-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">

        {/* Left panel */}
        <div className="w-72 shrink-0 border-r border-gray-800/50 flex flex-col overflow-y-auto custom-scrollbar">
          {activeTab === 'builder' && (
            <div className="p-4 space-y-4">
              <h3 className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">{t('modbus.tabBuilder')}</h3>

              <div className="space-y-3">
                <div>
                  <label className="text-[8px] text-gray-600 uppercase tracking-widest block mb-1">{t('modbus.deviceAddress')}</label>
                  <input
                    type="number" min={1} max={247} value={deviceAddress}
                    onChange={e => setDeviceAddress(Math.max(1, Math.min(247, +e.target.value)))}
                    className="w-full bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1.5 text-gray-200 text-[11px] outline-none focus:border-amber-500/50"
                  />
                </div>

                <div>
                  <label className="text-[8px] text-gray-600 uppercase tracking-widest block mb-1">{t('modbus.functionCode')}</label>
                  <select
                    value={functionCode}
                    onChange={e => setFunctionCode(+e.target.value)}
                    className="w-full bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1.5 text-gray-200 text-[10px] outline-none focus:border-amber-500/50"
                  >
                    {FC_OPTIONS.map(fc => (
                      <option key={fc} value={fc}>
                        0x{fc.toString(16).toUpperCase().padStart(2,'0')} — {MODBUS_FC_LABELS[fc]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[8px] text-gray-600 uppercase tracking-widest block mb-1">{t('modbus.startAddress')}</label>
                  <input
                    type="number" min={0} max={65535} value={startAddress}
                    onChange={e => setStartAddress(Math.max(0, +e.target.value))}
                    className="w-full bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1.5 text-gray-200 text-[11px] outline-none focus:border-amber-500/50"
                  />
                </div>

                {!isWrite && (
                  <div>
                    <label className="text-[8px] text-gray-600 uppercase tracking-widest block mb-1">{t('modbus.quantity')}</label>
                    <input
                      type="number" min={1} max={125} value={quantity}
                      onChange={e => setQuantity(Math.max(1, Math.min(125, +e.target.value)))}
                      className="w-full bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1.5 text-gray-200 text-[11px] outline-none focus:border-amber-500/50"
                    />
                  </div>
                )}

                {isWrite && !isMultiWrite && (
                  <div>
                    <label className="text-[8px] text-gray-600 uppercase tracking-widest block mb-1">
                      {functionCode === 0x05 ? t('modbus.coilValue') : t('modbus.registerValue')}
                    </label>
                    <input
                      type="number" min={0} max={functionCode === 0x05 ? 1 : 65535} value={writeValue}
                      onChange={e => setWriteValue(+e.target.value)}
                      className="w-full bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1.5 text-gray-200 text-[11px] outline-none focus:border-amber-500/50"
                    />
                  </div>
                )}

                {isMultiWrite && (
                  <div>
                    <label className="text-[8px] text-gray-600 uppercase tracking-widest block mb-1">{t('modbus.multipleValues')}</label>
                    <textarea
                      value={writeValues}
                      onChange={e => setWriteValues(e.target.value)}
                      rows={3}
                      className="w-full bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1.5 text-gray-200 text-[10px] outline-none focus:border-amber-500/50 resize-none"
                    />
                  </div>
                )}

                <button
                  onClick={sendRequest}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-900/20"
                >
                  <Send size={12} /> {t('modbus.send')}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="p-4 space-y-3">
              <h3 className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">{t('modbus.tabRaw')}</h3>
              <textarea
                value={rawInput}
                onChange={e => setRawInput(e.target.value)}
                placeholder="01 03 00 00 00 04 44 09"
                rows={4}
                className="w-full bg-gray-900/60 border border-gray-700/50 rounded px-2 py-1.5 text-gray-200 text-[10px] outline-none focus:border-amber-500/50 resize-none font-mono"
              />
              <button
                onClick={sendRaw}
                className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                {t('modbus.validateCRC')}
              </button>
              {rawError && (
                <div className="flex items-start gap-2 p-2 bg-red-950/30 border border-red-800/40 rounded-lg">
                  <AlertTriangle size={10} className="text-red-400 mt-0.5 shrink-0" />
                  <span className="text-[9px] text-red-300">{rawError}</span>
                </div>
              )}
              {rawResult && (
                <div className="flex items-start gap-2 p-2 bg-green-950/30 border border-green-800/40 rounded-lg">
                  <CheckCircle2 size={10} className="text-green-400 mt-0.5 shrink-0" />
                  <span className="text-[9px] text-green-300">{rawResult}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'slave' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[9px] uppercase tracking-widest text-gray-500 font-bold">
                  {t('modbus.slaveTitle', { addr: slaveState.deviceAddress })}
                </h3>
                <button
                  onClick={() => setSlaveState(makeDefaultSlaveState(deviceAddress))}
                  className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
                  title={t('modbus.reset')}
                >
                  <RefreshCw size={11} />
                </button>
              </div>

              <div>
                <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-2">{t('modbus.holdingRegisters')}</div>
                <div className="space-y-1">
                  {slaveState.holdingRegisters.map((r: ModbusRegister) => (
                    <div key={r.address} className="flex items-center gap-2">
                      <span className="text-[8px] text-gray-600 w-8 shrink-0">{r.label}</span>
                      <input
                        type="number" min={0} max={65535} value={r.value}
                        onChange={e => setSlaveState(prev => ({
                          ...prev,
                          holdingRegisters: prev.holdingRegisters.map(reg => reg.address === r.address ? { ...reg, value: +e.target.value } : reg)
                        }))}
                        className="flex-1 bg-gray-900/40 border border-gray-800/50 rounded px-1.5 py-0.5 text-amber-300 text-[10px] outline-none focus:border-amber-500/50"
                      />
                      <span className="text-[8px] text-gray-700 w-12 text-right">0x{r.value.toString(16).toUpperCase().padStart(4,'0')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-2">{t('modbus.coils')}</div>
                <div className="grid grid-cols-4 gap-1">
                  {slaveState.coils.map((c: ModbusCoil) => (
                    <button
                      key={c.address}
                      onClick={() => setSlaveState(prev => ({
                        ...prev,
                        coils: prev.coils.map(coil => coil.address === c.address ? { ...coil, value: !coil.value } : coil)
                      }))}
                      className={`flex flex-col items-center px-1 py-1 rounded border transition-all ${c.value ? 'border-amber-600/50 bg-amber-900/20 text-amber-300' : 'border-gray-800/50 bg-gray-900/20 text-gray-600'}`}
                    >
                      {c.value ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                      <span className="text-[7px]">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — log */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-800/30 bg-gray-950/30">
            <span className="text-[9px] uppercase tracking-widest text-gray-600 font-bold">{t('modbus.transactionLog')} ({log.length})</span>
            <button onClick={() => setLog([])} className="text-[8px] text-gray-700 hover:text-red-400 transition-colors uppercase tracking-widest">{t('modbus.clear')}</button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {log.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-700">
                <Cpu size={32} className="mb-2 opacity-30" />
                <p className="text-[9px] uppercase tracking-widest">{t('modbus.noTransactions')}</p>
              </div>
            )}

            {log.map(entry => (
              <div key={entry.id} className="border border-gray-800/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-gray-900/40 hover:bg-gray-900/70 transition-colors text-left"
                >
                  <Send size={10} className="text-amber-400 shrink-0" />
                  <span className="text-[9px] text-gray-400 font-mono flex-1 truncate">
                    [{entry.frame.deviceAddress}] FC 0x{entry.frame.functionCode.toString(16).toUpperCase().padStart(2,'0')} — {MODBUS_FC_LABELS[entry.frame.functionCode] ?? '?'}
                  </span>
                  {entry.response?.error ? (
                    <span className="text-[8px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded">{t('common.error').toUpperCase()}</span>
                  ) : (
                    <span className="text-[8px] text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded">OK</span>
                  )}
                  {expandedId === entry.id ? <ChevronUp size={10} className="text-gray-600 shrink-0" /> : <ChevronDown size={10} className="text-gray-600 shrink-0" />}
                </button>

                {expandedId === entry.id && (
                  <div className="px-3 py-2 bg-gray-950/40 space-y-2">
                    <div>
                      <div className="text-[8px] text-amber-500 uppercase tracking-widest mb-0.5">{t('modbus.request')}</div>
                      <div className="font-mono text-[10px] text-gray-300 bg-gray-900/60 px-2 py-1 rounded">
                        {frameToHexString(entry.frame)}
                      </div>
                      <div className="text-[8px] text-gray-600 mt-0.5">
                        CRC: 0x{entry.frame.crc.toString(16).toUpperCase().padStart(4,'0')}  |  {entry.frame.raw.length} byte
                      </div>
                    </div>
                    {entry.response && (
                      <div>
                        <div className={`text-[8px] uppercase tracking-widest mb-0.5 ${entry.response.error ? 'text-red-400' : 'text-green-500'}`}>
                          {t('modbus.response')}{entry.response.error ? ` — ${entry.response.error}` : ''}
                        </div>
                        <div className="font-mono text-[10px] text-gray-300 bg-gray-900/60 px-2 py-1 rounded">
                          {frameToHexString(entry.response)}
                        </div>
                        {!entry.response.error && entry.response.functionCode === 0x03 && entry.response.data.length > 1 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(() => {
                              const byteCount = entry.response.data[0];
                              const regs: number[] = [];
                              for (let i = 1; i + 1 <= byteCount; i += 2) {
                                regs.push((entry.response.data[i] << 8) | entry.response.data[i + 1]);
                              }
                              return regs.map((v, i) => (
                                <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-800/60 text-amber-300">
                                  R{startAddress + i}: {v}
                                </span>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
