import React, { memo, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { Activity, Zap, AlertCircle, CheckCircle2, Timer } from 'lucide-react';
import type { TimingStats } from '../../../types';

interface DiagnosticsProps {
  timingStats: TimingStats;
  exchanges: any[];
  errorCount: number;
  frameCount: number;
}

const Diagnostics = memo(({ timingStats, exchanges, errorCount, frameCount }: DiagnosticsProps) => {
  // Prepare Histogram Data (Inter-packet arrivals)
  const histogramData = useMemo(() => {
    const bins: Record<number, number> = {};
    timingStats.interPacketArrivals.forEach(val => {
      const bin = Math.floor(val / 5) * 5; // 5ms bins
      bins[bin] = (bins[bin] || 0) + 1;
    });
    
    return Object.entries(bins)
      .map(([bin, count]) => ({ bin: Number(bin), count }))
      .sort((a, b) => a.bin - b.bin)
      .slice(0, 20); // Show most common ranges
  }, [timingStats.interPacketArrivals]);

  // Jitter History (derived from last 50 inter-arrivals)
  const jitterHistory = useMemo(() => {
    return timingStats.interPacketArrivals.map((val, idx) => ({
      idx,
      ms: val,
      threshold: 100 // Example threshold
    }));
  }, [timingStats.interPacketArrivals]);

  const successRate = frameCount > 0 ? (((frameCount - errorCount) / frameCount) * 100).toFixed(1) : '100';

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 overflow-y-auto custom-scrollbar bg-gray-950/20">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/40 border border-gray-800/50 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-black text-gray-500 uppercase tracking-widest">Başarı Oranı</span>
            <div className="p-1.5 bg-emerald-500/10 rounded-lg"><CheckCircle2 size={14} className="text-emerald-500" /></div>
          </div>
          <div className="text-2xl font-black font-mono text-gray-100">%{successRate}</div>
          <div className="text-[9px] font-mono text-gray-600 mt-1">{frameCount} Toplam Paket</div>
        </div>

        <div className="bg-gray-900/40 border border-gray-800/50 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-black text-gray-500 uppercase tracking-widest">Ort. Gecikme</span>
            <div className="p-1.5 bg-blue-500/10 rounded-lg"><Timer size={14} className="text-blue-500" /></div>
          </div>
          <div className="text-2xl font-black font-mono text-gray-100">{timingStats.averageLatencyMs.toFixed(1)}<span className="text-xs ml-1 opacity-40">ms</span></div>
          <div className="text-[9px] font-mono text-gray-600 mt-1">Min: {timingStats.minLatencyMs}ms / Max: {timingStats.maxLatencyMs}ms</div>
        </div>

        <div className="bg-gray-900/40 border border-gray-800/50 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-black text-gray-500 uppercase tracking-widest">Jitter (Sapma)</span>
            <div className="p-1.5 bg-purple-500/10 rounded-lg"><Activity size={14} className="text-purple-500" /></div>
          </div>
          <div className="text-2xl font-black font-mono text-gray-100">{timingStats.jitterMs.toFixed(1)}<span className="text-xs ml-1 opacity-40">ms</span></div>
          <div className="text-[9px] font-mono text-gray-600 mt-1">Timing Stability</div>
        </div>

        <div className="bg-gray-900/40 border border-gray-800/50 p-4 rounded-2xl backdrop-blur-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-mono font-black text-gray-500 uppercase tracking-widest">Yanıt Hataları</span>
            <div className="p-1.5 bg-red-500/10 rounded-lg"><AlertCircle size={14} className="text-red-500" /></div>
          </div>
          <div className="text-2xl font-black font-mono text-gray-100">{errorCount}</div>
          <div className="text-[9px] font-mono text-gray-600 mt-1">Simulated/Real Errors</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Latency / Jitter Chart */}
        <div className="bg-gray-900/40 border border-gray-800/50 p-6 rounded-2xl flex flex-col min-h-[300px]">
          <div className="flex items-center gap-2 mb-6">
             <Zap size={14} className="text-orange-500" />
             <span className="text-[10px] font-mono font-black text-gray-300 uppercase tracking-[0.2em]">Varış Süresi Kararlılığı (Last 50)</span>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={jitterHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="idx" hide />
                <YAxis stroke="#6b7280" fontSize={10} fontFamily="monospace" unit="ms" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '10px' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="ms" 
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  dot={false}
                  animationDuration={300}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Arrival Distribution Histogram */}
        <div className="bg-gray-900/40 border border-gray-800/50 p-6 rounded-2xl flex flex-col min-h-[300px]">
          <div className="flex items-center gap-2 mb-6">
             <Activity size={14} className="text-emerald-500" />
             <span className="text-[10px] font-mono font-black text-gray-300 uppercase tracking-[0.2em]">Paket Aralığı Dağılımı (Histogram)</span>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="bin" stroke="#6b7280" fontSize={10} fontFamily="monospace" unit="ms" />
                <YAxis stroke="#6b7280" fontSize={10} fontFamily="monospace" />
                <Tooltip 
                  cursor={{ fill: '#ffffff10' }}
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '10px' }}
                />
                <Bar dataKey="count" animationDuration={500}>
                  {histogramData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.bin > 150 ? '#ef4444' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
});

Diagnostics.displayName = 'Diagnostics';
export default Diagnostics;
