import React, { memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { FrameProfile, RangeConfig } from '../../../types';

interface WaveformChartsProps {
  waveformHistory: Array<Record<string, number>>;
  selectedProfile: FrameProfile | null;
  CustomTooltip: any;
  chartColors: string[];
}

const WaveformCharts = memo(({ waveformHistory, selectedProfile, CustomTooltip, chartColors }: WaveformChartsProps) => {
  if (!selectedProfile || waveformHistory.length <= 1) return null;

  const waveformFields = selectedProfile.fields.filter((f) => f.type === 'waveform');
  const allRangeFields = selectedProfile.fields.filter((f) => f.type === 'range');
  const intensityBarFields = allRangeFields.filter((f) => f.name.toLowerCase().includes('bar') || f.name.toLowerCase().includes('signal'));
  const numericVitalsFields = allRangeFields.filter((f) => !intensityBarFields.find((ib) => ib.id === f.id));

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-950/20">
      {/* Medical Stack View: One chart per waveform lead */}
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
                    <span className={`text-xl font-bold font-mono ${chartColors[(i + 2) % chartColors.length]}`}>{currentVal}</span>
                  </div>
                 );
              })}
            </div>
          </div>
          
          <div className="flex gap-4">
            {/* Intensity Bars (Pulse / Quality) */}
            {intensityBarFields.length > 0 && (
              <div className="flex gap-1.5 py-4">
                {intensityBarFields.map((f) => {
                  const val = waveformHistory[waveformHistory.length - 1]?.[f.name] ?? 0;
                  const cfg = f.typeConfig as RangeConfig;
                  const percent = Math.min(100, Math.max(0, ((val - cfg.min) / (cfg.max - cfg.min)) * 100));
                  return (
                    <div key={f.id} className="w-5 h-64 bg-gray-950 rounded border border-gray-800 flex flex-col justify-end p-0.5 relative group">
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
                <div key={f.id} className="h-32 bg-black/20 rounded border border-gray-800/50 p-2 relative">
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

      {/* Numeric info fallback if no waveforms */}
      {waveformFields.length === 0 && numericVitalsFields.length > 0 && (
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
           {numericVitalsFields.map((f, i) => {
              const currentVal = waveformHistory[waveformHistory.length - 1]?.[f.name] ?? 0;
              return (
                <div key={f.id} className="bg-gray-950 p-3 rounded border border-gray-800">
                  <div className="text-[10px] text-gray-500 font-mono uppercase">{f.name}</div>
                  <div className={`text-2xl font-bold font-mono ${chartColors[(i + 2) % chartColors.length]}`}>{currentVal}</div>
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
