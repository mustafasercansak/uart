/* eslint-disable react-hooks/refs */
import { memo, useState, useCallback } from 'react';
import { LayoutGrid, List, GripHorizontal, MousePointer2, Activity, Ruler } from 'lucide-react';
import { useTranslation } from '../../../i18n/context';
import type { FrameProfile, GridPanel } from '../../../types';
import CanvasWaveform from './CanvasWaveform';
import DashboardGrid from './DashboardGrid';
import { useSimulation } from '../../../hooks/useSimulation';

interface WaveformChartsProps {
  selectedProfile: FrameProfile | null;
}

const CHART_COLORS_EXTENDED = [
  '#10b981', // ECG Green
  '#22d3ee', // SpO2 Cyan
  '#eab308', // Resp Yellow
  '#f43f5e', // BP Pink/Red
  '#8b5cf6', // Temp Purple
  '#f97316', // Pulse Orange
  '#06b6d4', '#ec4899', '#14b8a6', '#a855f7', '#3b82f6', '#ef4444',
];

const ERROR_COLORS: Record<string, string> = {
  corrupt_checksum: '#ef4444',
  wrong_sync: '#f97316',
  skip_bytes: '#eab308',
  extra_bytes: '#a855f7',
  delay_frame: '#06b6d4',
};

function WaveformCharts({ selectedProfile }: WaveformChartsProps) {
  const { waveformHistoryRef, state } = useSimulation();
  const waveformHistory = waveformHistoryRef.current;
  const errorInjectionHistory = state.errorInjectionHistory ?? [];
  const { t } = useTranslation();
  const [enabledCharts, setEnabledCharts] = useState<Record<string, boolean>>({});
  const [gridMode, setGridMode] = useState(false);
  const [gridPanels, setGridPanels] = useState<GridPanel[]>([]);
  
  // Enhanced Lab Tools State
  const [showCursors, setShowCursors] = useState(false);
  const [cursorA, setCursorA] = useState<number | null>(null); // Time index
  const [cursorB, setCursorB] = useState<number | null>(null); // Time index

  const toggleChart = useCallback((fieldName: string, fieldType: string, colorIdx: number) => {
    setEnabledCharts(prev => {
      const newState = { ...prev, [fieldName]: !prev[fieldName] };
      if (!prev[fieldName]) {
        // Adding: also add to grid panels
        const color = CHART_COLORS_EXTENDED[colorIdx % CHART_COLORS_EXTENDED.length];
        setGridPanels(gp => [
          ...gp,
          { id: `${fieldName}-${Date.now()}`, fieldName, fieldType, color, widgetType: 'chart' }
        ]);
      } else {
        // Removing: remove from grid panels
        setGridPanels(gp => gp.filter(p => p.fieldName !== fieldName));
      }
      return newState;
    });
  }, []);

  const removeGridPanel = useCallback((panelId: string) => {
    setGridPanels(prev => {
      const removed = prev.find(p => p.id === panelId);
      if (removed) {
        setEnabledCharts(ec => ({ ...ec, [removed.fieldName]: false }));
      }
      return prev.filter(p => p.id !== panelId);
    });
  }, []);

  const updateGridPanel = useCallback((id: string, updates: Partial<GridPanel>) => {
    setGridPanels(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  if (!selectedProfile) return null;

  const waveformFields = selectedProfile.fields.filter(f => f.type === 'waveform');
  const toggleableFields = selectedProfile.fields.filter(f => f.type !== 'waveform' && f.type !== 'checksum');
  const activeToggleFields = toggleableFields.filter(f => enabledCharts[f.name]);
  const lastPoint = waveformHistory[waveformHistory.length - 1] ?? {};
  const deltaT = (showCursors && cursorA !== null && cursorB !== null) 
    ? Math.abs((waveformHistory[cursorB]?.t || 0) - (waveformHistory[cursorA]?.t || 0))
    : 0;
  
  const frequency = deltaT > 0 ? (1000 / deltaT) : 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-950/20 overflow-y-auto custom-scrollbar">

      {/* ─── PINNED WAVEFORM SECTION ─── */}
      {waveformFields.length > 0 && (
        <div className="flex flex-col shrink-0 border-b border-gray-800/60 bg-black/50">
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px #10b981' }} />
            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-[0.2em]">{t('waveformCharts.signalMonitor')}</span>
          </div>
          <div className="flex flex-col divide-y divide-gray-800/40">
            {waveformFields.map((f, i) => {
              // Clinical color mapping
              const name = f.name.toLowerCase();
              let color = CHART_COLORS_EXTENDED[i % CHART_COLORS_EXTENDED.length];
              if (name.includes('lead') || name.includes('ecg')) color = '#10b981';
              else if (name.includes('spo2')) color = '#06b6d4';
              else if (name.includes('resp') || name.includes('rr')) color = '#eab308';
              
              const cv = (lastPoint[f.name] ?? 0).toFixed(0);
              return (
                <div key={f.id} className="relative group px-3 pb-2 pt-1" style={{ height: 100 }}>
                  <div className="absolute top-2 left-4 z-10 flex items-center gap-2 pointer-events-none">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: color }} />
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider" style={{ color, textShadow: `0 0 8px ${color}80` }}>
                      {f.name}
                    </span>
                    <span className="text-[8px] font-mono text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">{t('waveformCharts.live')}</span>
                  </div>
                  <div className="absolute top-2 right-4 z-10 text-base font-bold font-mono tabular-nums pointer-events-none" style={{ color, textShadow: `0 0 10px ${color}60` }}>
                    {cv}
                  </div>
                  <div className="absolute inset-0 pt-6 px-0">
                    <CanvasWaveform
                      dataKey={f.name}
                      waveformHistoryRef={waveformHistoryRef}
                      color={color}
                      showCursors={showCursors}
                      cursorA={cursorA}
                      cursorB={cursorB}
                      onCursorMove={(type, idx) => type === 'A' ? setCursorA(idx) : setCursorB(idx)}
                    />
                    {/* Error injection markers */}
                    {errorInjectionHistory.length > 0 && waveformHistory.length > 1 && (() => {
                      const minT = waveformHistory[0].t;
                      const maxT = waveformHistory[waveformHistory.length - 1].t;
                      const range = maxT - minT;
                      if (range <= 0) return null;
                      return errorInjectionHistory
                        .filter(e => e.timestamp >= minT && e.timestamp <= maxT)
                        .map((e, idx) => {
                          const pct = ((e.timestamp - minT) / range) * 100;
                          const markerColor = ERROR_COLORS[e.type] ?? '#ffffff';
                          return (
                            <div
                              key={idx}
                              className="absolute top-0 bottom-0 w-px pointer-events-none group/marker z-10"
                              style={{ left: `${pct}%`, backgroundColor: markerColor, opacity: 0.7 }}
                            >
                              <div
                                className="absolute bottom-full mb-0.5 left-1/2 -translate-x-1/2 text-[7px] font-mono px-1 py-px rounded whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none"
                                style={{ backgroundColor: markerColor, color: '#000' }}
                              >
                                {e.type.replace(/_/g, ' ')}
                              </div>
                            </div>
                          );
                        });
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TOGGLE BAR (sticky) ─── */}
      <div className="shrink-0 sticky top-0 z-20 bg-gray-900/95 backdrop-blur-md border-b border-gray-800/60 shadow-lg">
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-[0.2em]">{t('waveformCharts.dataChannels')}</span>
            <span className="text-[9px] text-gray-600 font-mono bg-gray-800 px-1.5 py-0.5 rounded ml-1">
              {activeToggleFields.length}/{toggleableFields.length}
            </span>
          </div>
          {/* Grid / List toggle */}
          <div className="flex items-center gap-1 bg-gray-800/60 rounded p-1">
            <button
              onClick={() => setGridMode(false)}
              className={`p-1 rounded transition-all ${!gridMode ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title={t('waveformCharts.listView')}
            >
              <List size={12} />
            </button>
            <button
              onClick={() => setGridMode(true)}
              className={`p-1 rounded transition-all ${gridMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title={t('waveformCharts.gridView')}
            >
              <LayoutGrid size={12} />
            </button>
            <div className="w-[1px] h-4 bg-gray-700 mx-1" />
            <button
              onClick={() => setShowCursors(!showCursors)}
              className={`p-1.5 rounded transition-all flex items-center gap-1.5 px-2 ${showCursors ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-gray-500 hover:text-gray-300'}`}
              title={t('waveformCharts.cursorsToggle')}
            >
              <MousePointer2 size={12} />
              <span className="text-[9px] font-bold font-mono">{t('waveformCharts.labCursors')}</span>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {toggleableFields.map((f, i) => {
            const isActive = !!enabledCharts[f.name];
            const colorIdx = i + waveformFields.length;
            const color = CHART_COLORS_EXTENDED[colorIdx % CHART_COLORS_EXTENDED.length];
            const currentVal = lastPoint[f.name] ?? 0;
            return (
              <button
                key={f.id}
                onClick={() => toggleChart(f.name, f.type, colorIdx)}
                className={`
                  px-2.5 py-1 rounded text-[10px] font-mono border transition-all duration-200 select-none
                  ${isActive ? 'text-white shadow-sm' : 'bg-gray-900 border-gray-700/60 text-gray-500 hover:border-gray-500 hover:text-gray-300'}
                `}
                style={isActive ? {
                  borderColor: `${color}80`,
                  backgroundColor: `${color}18`,
                  color,
                  boxShadow: `0 0 10px ${color}30`
                } : {}}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: isActive ? color : '#4b5563' }} />
                {f.name}
                {isActive && <span className="ml-1.5 opacity-60 tabular-nums">{currentVal}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── LAB MEASUREMENT STATS ─── */}
      {showCursors && cursorA !== null && cursorB !== null && (
        <div className="mx-4 mt-2 px-4 py-3 bg-blue-900/10 border border-blue-500/20 rounded-xl flex items-center justify-between animate-in zoom-in-95 duration-200">
           <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-blue-400 uppercase font-black tracking-widest">{t('waveformCharts.measurement')}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Ruler size={14} className="text-blue-500" />
                  <span className="text-sm font-mono font-bold text-white">Δt: {deltaT.toFixed(2)}{t('time.ms')}</span>
                </div>
              </div>
              <div className="w-[1px] h-8 bg-blue-500/20" />
              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-gray-500 uppercase">{t('waveformCharts.frequency')}</span>
                <span className="text-xs font-mono font-bold text-gray-300">
                  {frequency > 0 ? frequency.toFixed(1) + ' ' + t('common.hz') : '---'}
                </span>
              </div>
           </div>
           
           <div className="flex items-center gap-2">
              <button 
                onClick={() => { setCursorA(null); setCursorB(null); }}
                className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-[10px] font-mono rounded-lg border border-blue-500/30 transition-all"
              >
                {t('waveformCharts.resetCursors')}
              </button>
           </div>
        </div>
      )}

      {/* ─── ACTIVE CHARTS: LIST MODE ─── */}
      {!gridMode && activeToggleFields.length > 0 && (
        <div className="flex flex-col divide-y divide-gray-800/40 shrink-0 pb-6">
          {activeToggleFields.map((f) => {
            const colorIdx = toggleableFields.findIndex(tf => tf.id === f.id) + waveformFields.length;
            const color = CHART_COLORS_EXTENDED[colorIdx % CHART_COLORS_EXTENDED.length];
            const cv = lastPoint[f.name] ?? 0;
            return (
              <div key={f.id} className="relative group px-3 pb-2 pt-1" style={{ height: 88 }}>
                <div className="absolute top-2 left-4 z-10 flex items-center gap-2 pointer-events-none">
                  <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color, textShadow: `0 0 6px ${color}60` }}>{f.name}</span>
                  <span className="text-[8px] font-mono opacity-30" style={{ color }}>{f.type}</span>
                </div>
                <div className="absolute top-2 right-4 z-10 text-sm font-bold font-mono tabular-nums pointer-events-none" style={{ color }}>{cv}</div>
                <div className="absolute inset-0 pt-6 px-0">
                  <CanvasWaveform 
                    dataKey={f.name} 
                    waveformHistoryRef={waveformHistoryRef}
                    color={color} 
                    showCursors={showCursors}
                    cursorA={cursorA}
                    cursorB={cursorB}
                    onCursorMove={(type, idx) => type === 'A' ? setCursorA(idx) : setCursorB(idx)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── ACTIVE CHARTS: GRID MODE (Drag & Drop) ─── */}
      {gridMode && gridPanels.length > 0 && (
        <div className="flex-1 min-h-0 shrink-0" style={{ minHeight: 300 }}>
          <DashboardGrid
            panels={gridPanels}
            waveformHistoryRef={waveformHistoryRef}
            onRemovePanel={removeGridPanel}
            onUpdatePanel={updateGridPanel}
          />
        </div>
      )}

      {gridMode && gridPanels.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-700 font-mono text-xs gap-2 py-8">
          <GripHorizontal size={16} />
          <span>{t('waveformCharts.openChannels')}</span>
        </div>
      )}
    </div>
  );
}

WaveformCharts.displayName = 'WaveformCharts';
export default memo(WaveformCharts);
