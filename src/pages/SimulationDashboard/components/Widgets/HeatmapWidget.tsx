/* eslint-disable react-hooks/refs */
import React, { useMemo } from 'react';

interface HeatmapWidgetProps {
  dataKey: string;
  waveformHistoryRef: React.MutableRefObject<Array<Record<string, number>>>;
  color: string;
  label: string;
}

const HeatmapWidget: React.FC<HeatmapWidgetProps> = ({
  dataKey,
  waveformHistoryRef,
  color,
  label
}) => {
  const history = waveformHistoryRef.current;

  const gridData = useMemo(() => {
    // Get last 64 points of dataKey
    const points = history.slice(-64).map(pt => pt[dataKey] ?? 0);
    // Fill up with zeros if less than 64 points
    while (points.length < 64) {
      points.unshift(0);
    }
    return points;
  }, [history, dataKey]);

  return (
    <div className="flex flex-col h-full p-2 bg-gray-900/40 rounded-lg overflow-hidden select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">{label} (Heatmap)</span>
        <span className="text-[8px] font-mono text-gray-600">8x8 Matrix</span>
      </div>
      
      <div className="flex-1 grid grid-cols-8 gap-0.5 p-1 bg-gray-950 rounded border border-gray-800/50">
        {gridData.map((val, idx) => {
          // Normalize value (0 to 255)
          const pct = Math.min(1, Math.max(0, val / 255));
          return (
            <div
              key={idx}
              className="rounded-sm transition-all duration-300 relative group/cell"
              style={{
                backgroundColor: color,
                opacity: 0.08 + pct * 0.92,
                boxShadow: pct > 0.7 ? `0 0 6px ${color}80` : 'none'
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover/cell:opacity-100 bg-black/80 rounded-sm flex items-center justify-center text-[7px] font-mono text-white transition-opacity select-none z-10">
                {val.toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HeatmapWidget;
