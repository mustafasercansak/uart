import React, { memo, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { FrameProfile, RangeConfig } from '../../../types';

interface WaveformChartsProps {
  waveformHistory: Array<Record<string, number>>;
  selectedProfile: FrameProfile | null;
  CustomTooltip: any;
  chartColors: string[];
}

const CHART_COLORS_EXTENDED = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316',
  '#06b6d4', '#ec4899', '#14b8a6', '#a855f7', '#eab308', '#22d3ee',
];

const WaveformCharts = memo(({ waveformHistory, selectedProfile, CustomTooltip, chartColors }: WaveformChartsProps) => {
  // Track which fields are enabled for charting (by field name)
  const [enabledCharts, setEnabledCharts] = useState<Record<string, boolean>>({});

  const toggleChart = useCallback((fieldName: string) => {
    setEnabledCharts(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  }, []);

  if (!selectedProfile || waveformHistory.length <= 1) return null;

  const waveformFields = selectedProfile.fields.filter((f) => f.type === 'waveform');
  const allRangeFields = selectedProfile.fields.filter((f) => f.type === 'range');
  const intensityBarFields = allRangeFields.filter((f) => f.name.toLowerCase().includes('bar') || f.name.toLowerCase().includes('signal'));
  const numericVitalsFields = allRangeFields.filter((f) => !intensityBarFields.find((ib) => ib.id === f.id));

  // All chartable fields (everything except checksum)
  const allChartableFields = selectedProfile.fields.filter(f => f.type !== 'checksum');
  // Non-waveform chartable fields (these need toggle buttons)
  const toggleableFields = allChartableFields.filter(f => f.type !== 'waveform');
  // Which toggleable fields are currently enabled?
  const activeToggleFields = toggleableFields.filter(f => enabledCharts[f.name]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-950/20">
      {/* ─── WAVEFORM LEADS (always visible) ─── */}
      {waveformFields.length > 0 && (
        <div className="flex flex-col gap-4 p-4 border-b border-gray-800 bg-black/40">
          <div className="flex items-center justify-between mb-2">
            <div className="text-gray-500 text-xs font-mono uppercase tracking-wider">Tıbbi Monitör (Canlı İzleme)</div>
            <div className="flex gap-4">
              {numericVitalsFields.map((f, i) => {
                 const currentVal = waveformHistory[waveformHistory.length - 1]?.[f.name] ?? 0;
                 return (
                  <div key={f.id} className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500 font-mono uppercase">{f.name}</span>
                    <span className="text-xl font-bold font-mono" style={{ color: chartColors[(i + 2) % chartColors.length] }}>{currentVal}</span>
                  </div>
                 );
              })}
            </div>
          </div>
          
          <div className="flex gap-4">
            {/* Intensity Bars */}
            {intensityBarFields.length > 0 && (
              <div className="flex gap-1.5 py-4">
                {intensityBarFields.map((f) => {
                  const val = waveformHistory[waveformHistory.length - 1]?.[f.name] ?? 0;
                  const cfg = f.typeConfig as RangeConfig;
                  const percent = Math.min(100, Math.max(0, ((val - cfg.min) / (cfg.max - cfg.min)) * 100));
                  return (
                    <div key={f.id} className="w-5 h-48 bg-gray-950 rounded border border-gray-800 flex flex-col justify-end p-0.5 relative group">
                      <div 
                        className="w-full bg-gradient-to-t from-orange-500 via-yellow-500 to-green-500 rounded-sm transition-all duration-100" 
                        style={{ height: `${percent}%` }}
                      />
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                        {[...Array(10)].map((_, j) => <div key={j} className="h-px bg-white w-full" />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex-1 flex flex-col gap-2">
              {waveformFields.map((f, i) => (
                <div key={f.id} className="h-24 bg-black/20 rounded border border-gray-800/50 p-2 relative">
                  <div className="absolute top-1 left-2 z-10 text-[9px] font-mono uppercase tracking-tighter" style={{ color: chartColors[i % chartColors.length] }}>
                    {f.name} (LIVE)
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={waveformHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#111" vertical={false} />
                      <XAxis dataKey="t" hide />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Line 
                        type="monotone" 
                        dataKey={f.name} 
                        stroke={chartColors[i % chartColors.length]} 
                        dot={false} 
                        isAnimationActive={false} 
                        strokeWidth={2.5} 
                        strokeLinecap="round"
                        style={{ filter: 'drop-shadow(0 0 3px currentColor)' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TOGGLEABLE DATA CHANNELS ─── */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="text-gray-500 text-xs font-mono uppercase tracking-wider">Veri Kanalları (Grafik Aç/Kapat)</div>
          <span className="text-[9px] text-gray-600 font-mono">
            {activeToggleFields.length}/{toggleableFields.length} aktif
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {toggleableFields.map((f, i) => {
            const isActive = !!enabledCharts[f.name];
            const color = CHART_COLORS_EXTENDED[(i + waveformFields.length) % CHART_COLORS_EXTENDED.length];
            const currentVal = waveformHistory[waveformHistory.length - 1]?.[f.name] ?? 0;
            return (
              <button
                key={f.id}
                onClick={() => toggleChart(f.name)}
                className={`
                  px-2.5 py-1.5 rounded text-[10px] font-mono border transition-all duration-200
                  ${isActive 
                    ? 'border-opacity-60 bg-opacity-20 text-white shadow-sm' 
                    : 'bg-gray-900 border-gray-700 text-gray-500 hover:border-gray-500'
                  }
                `}
                style={isActive ? { 
                  borderColor: color, 
                  backgroundColor: `${color}20`,
                  color: color,
                  boxShadow: `0 0 8px ${color}30`
                } : {}}
              >
                <span className="mr-1">{isActive ? '📊' : '📈'}</span>
                {f.name}
                {isActive && <span className="ml-1.5 opacity-70">({currentVal})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── TOGGLED FIELD CHARTS ─── */}
      {activeToggleFields.length > 0 && (
        <div className="flex flex-col gap-2 p-4 border-b border-gray-800 bg-black/20">
          {activeToggleFields.map((f, i) => {
            const colorIdx = toggleableFields.findIndex(tf => tf.id === f.id);
            const color = CHART_COLORS_EXTENDED[(colorIdx + waveformFields.length) % CHART_COLORS_EXTENDED.length];
            const currentVal = waveformHistory[waveformHistory.length - 1]?.[f.name] ?? 0;
            return (
              <div key={f.id} className="h-20 bg-black/30 rounded border border-gray-800/50 p-2 relative">
                <div className="absolute top-1 left-2 z-10 flex items-center gap-2">
                  <span className="text-[9px] font-mono uppercase tracking-tighter" style={{ color }}>{f.name}</span>
                  <span className="text-[9px] font-mono opacity-50" style={{ color }}>({f.type})</span>
                </div>
                <div className="absolute top-1 right-2 z-10 text-sm font-bold font-mono" style={{ color }}>{currentVal}</div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={waveformHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" vertical={false} />
                    <XAxis dataKey="t" hide />
                    <YAxis domain={['auto', 'auto']} hide />
                    <Line 
                      type="monotone" 
                      dataKey={f.name} 
                      stroke={color} 
                      dot={false} 
                      isAnimationActive={false} 
                      strokeWidth={2} 
                      strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 2px ${color})` }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

WaveformCharts.displayName = 'WaveformCharts';

export default WaveformCharts;
