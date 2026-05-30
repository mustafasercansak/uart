import React, { useState } from 'react';
import { Globe, HelpCircle, Plus, Edit3, Circle, Square, FileDown, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { OutputMode } from '../../../../types';
import type { CANBusState } from '../../../../can/types/CANBusState';
import type { CANProfile } from '../../../../can/store/canProfileStorage';
import { useTranslation } from '../../../../i18n/context';
import { translateBackendError } from '../../../../utils/backendError';

interface CANStatBarProps {
  state: CANBusState;
  profiles: CANProfile[];
  selectedProfileId: string | null;
  onSetProfile: (id: string) => void;
  onAddProfile: () => void;
  onEditProfile: (profile: CANProfile) => void;
  onSetOutputMode: (mode: OutputMode) => void;
  onConnectSerial: (portName: string) => void;
  onDisconnectSerial: () => void;
  onConnectNetwork: (url: string) => void;
  onDisconnectNetwork: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function CANStatBar({ 
  state, profiles, selectedProfileId, 
  onSetProfile, onAddProfile, onEditProfile,
  onSetOutputMode, onConnectSerial, onDisconnectSerial, 
  onConnectNetwork, onDisconnectNetwork,
  onStartRecording, onStopRecording
}: CANStatBarProps) {
  const { t, locale, setLocale } = useTranslation();
  const navigate = useNavigate();

  const [selectedPort, setSelectedPort] = useState('COM1');
  const [socketCanInterface, setSocketCanInterface] = useState('vcan0');

  const elapsed = state.elapsedMs;
  const h = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
  const m = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');

  const busLoadColor =
    state.busLoadPercent > 80 ? 'text-red-400' :
    state.busLoadPercent > 50 ? 'text-yellow-400' :
    'text-green-400';

  const activeNodes = state.nodes.filter(n => n.isActive && n.state !== 'bus-off').length;
  const alarmNodes  = state.nodes.filter(n => n.vitals.alarmFlags !== 0).length;

  const statusCls =
    state.status === 'running' ? 'text-green-400' :
    state.status === 'paused'  ? 'text-yellow-400' : 'text-gray-500';

  const handleExport = () => {
    if (state.recordedFrames.length === 0) return;
    const lines = [t('can.timestampID_Hex')];
    state.recordedFrames.forEach(f => {
      const ts = (f.timestamp / 1000).toFixed(6);
      const id = f.arbitrationId.toString(16).toUpperCase();
      const dlc = f.dlc;
      const data = f.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const errs = f.errors.join(';');
      lines.push(`${ts},${id},${dlc},${data},${errs}`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `can_recording_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-950 border-b border-gray-800/60 font-mono text-xs shrink-0">
      <Stat label={t('can.status')} value={state.status.toUpperCase()} cls={statusCls} />
      
      {/* Profile Selector */}
      <div className="flex items-center gap-1 p-0.5 bg-gray-900/50 rounded border border-gray-800">
        <select 
          className="bg-gray-950 border border-transparent hover:border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none focus:border-cyan-700 w-24 transition-all"
          value={selectedProfileId ?? ''} 
          onChange={(e) => onSetProfile(e.target.value)} 
          disabled={state.status !== 'stopped'}
        >
          <option value="">— {t('dashboard.profile')} —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{t(p.name) !== p.name ? t(p.name) : p.name}</option>)}
        </select>
        <div className="flex items-center gap-0.5">
          <button 
            onClick={onAddProfile}
            className="p-0.5 hover:bg-gray-800 text-emerald-500 rounded transition-colors"
            title={t('dashboard.profile')}
          >
            <Plus size={10} />
          </button>
          {selectedProfileId && (
            <button 
              onClick={() => onEditProfile(profiles.find(p => p.id === selectedProfileId)!)}
              className="p-0.5 hover:bg-gray-800 text-blue-400 rounded transition-colors"
            >
              <Edit3 size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-l border-gray-800/50 pl-2">
        <select 
          className="bg-gray-800/50 border border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none focus:border-cyan-700"
          value={state.outputMode} 
          onChange={(e) => onSetOutputMode(e.target.value as OutputMode)} 
          disabled={state.status !== 'stopped'}
        >
          <option value="log">{t('common.log')}</option>
          <option value="serial">{t('can.sLCANSerial')}</option>
          <option value="tcp">{t('can.socketCANTCP')}</option>
        </select>
      </div>

      {state.outputMode === 'serial' && (
        <div className="flex items-center gap-1 border-l border-gray-800/50 pl-2">
          {!state.serialConnected ? (
            <>
              <input 
                type="text"
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none w-20 focus:border-cyan-500"
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={state.status !== 'stopped'}
                placeholder="COM1"
              />
              <button 
                onClick={() => onConnectSerial(selectedPort)} 
                disabled={state.status !== 'stopped' || !selectedPort}
                className="px-1.5 py-0.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-30 text-white text-[8.5px] font-mono rounded font-bold transition-all"
              >
                {t('dashboard.connect')}
              </button>
            </>
          ) : (
            <button 
              onClick={onDisconnectSerial} 
              disabled={state.status !== 'stopped'}
              className="px-1.5 py-0.5 bg-rose-700 hover:bg-rose-600 text-white text-[8.5px] font-mono rounded font-bold"
            >
              {t('dashboard.disconnect')}
            </button>
          )}
        </div>
      )}

      {state.outputMode === 'tcp' && (
        <div className="flex items-center gap-1 border-l border-gray-800/50 pl-2">
          {!state.networkConnected ? (
            <>
              <input 
                type="text" 
                value={socketCanInterface}
                onChange={(e) => setSocketCanInterface(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[8.5px] font-mono text-gray-200 outline-none w-20 focus:border-cyan-500"
                placeholder="vcan0"
                disabled={state.status !== 'stopped'}
              />
              <button
                onClick={() => onConnectNetwork(socketCanInterface)}
                disabled={state.status !== 'stopped' || !socketCanInterface}
                className="px-1.5 py-0.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-30 text-white text-[8.5px] font-mono rounded font-bold transition-all"
              >
                {t('dashboard.connect')}
              </button>
              {state.networkError && (
                <span className="text-[8px] text-rose-400 font-mono max-w-32 truncate" title={translateBackendError(t, state.networkError)}>
                  ✗ {translateBackendError(t, state.networkError)}
                </span>
              )}
            </>
          ) : (
            <button 
              onClick={onDisconnectNetwork} 
              disabled={state.status !== 'stopped'}
              className="px-1.5 py-0.5 bg-rose-700 hover:bg-rose-600 text-white text-[8.5px] font-mono rounded font-bold"
            >
              {t('dashboard.disconnect')}
            </button>
          )}
        </div>
      )}

      <Stat label={t('can.baudRate')} value={`${state.baudRate}k`} cls="text-cyan-400 ml-2" />
      <Stat label={t('can.frames')} value={state.frameCount.toLocaleString()} />
      <Stat label={t('can.fps')} value={state.framesPerSecond.toString()} />
      <Stat label={t('can.errors')} value={state.errorCount.toString()} cls={state.errorCount > 0 ? 'text-red-400' : undefined} />
      <Stat label={t('can.busLoad')} value={`${state.busLoadPercent.toFixed(1)}%`} cls={busLoadColor} />
      <Stat label={t('can.nodesLabel')} value={`${activeNodes}/${state.nodes.length}`} />
      {alarmNodes > 0 && (
        <Stat label={t('can.alarms')} value={alarmNodes.toString()} cls="text-red-400 animate-pulse" />
      )}
      <div className="ml-auto flex items-center gap-1">
        {/* Recording Controls */}
        <button 
          onClick={state.isRecording ? onStopRecording : onStartRecording}
          disabled={state.status !== 'running'}
          className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1 border ${
            state.isRecording 
              ? 'bg-rose-900/20 border-rose-500/40 text-rose-500' 
              : 'bg-gray-900/40 border-gray-800 text-gray-500 hover:text-white hover:border-gray-600'
          } disabled:opacity-30`}
        >
          {state.isRecording ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <Square size={6} className="fill-current" />
            </>
          ) : (
            <>
              <Circle size={6} className="text-gray-600 fill-current" />
              {t('dashboard.rec')}
            </>
          )}
        </button>

        {state.recordedFrames.length > 0 && !state.isRecording && (
          <button 
            onClick={handleExport}
            className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1 border bg-cyan-900/20 border-cyan-800/40 text-cyan-400 hover:bg-cyan-800/40"
            title={`Export ${state.recordedFrames.length} frames`}
          >
            <FileDown size={10} />
            CSV
          </button>
        )}

        <div className="w-px h-3 bg-gray-800 mx-1" />

        {/* Labels / Translations */}
        <button
          onClick={() => navigate('/translations')}
          className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-cyan-400 transition-all border border-transparent hover:border-cyan-800/50"
          title={t('nav.translations')}
        >
          <Tag size={11} />
        </button>

        {/* Help */}
        <button
          onClick={() => navigate('/help')}
          className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-orange-400 transition-all border border-transparent hover:border-orange-800/50"
          title={t('nav.help') ?? 'Help'}
        >
          <HelpCircle size={11} />
        </button>

        <div className="w-px h-3 bg-gray-800 mx-0.5" />

        {/* Language switcher — same as UART StatBar */}
        <button
          onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-all border border-transparent hover:border-gray-700"
          title={locale.toUpperCase()}
        >
          <Globe size={11} className={locale === 'en' ? 'text-blue-400' : 'text-emerald-400'} />
        </button>

        <div className="w-px h-3 bg-gray-800 mx-0.5" />

        <span className="text-gray-600 tabular-nums">{h}:{m}:{s}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-600">{label}:</span>
      <span className={cls ?? 'text-white'}>{value}</span>
    </div>
  );
}
