import React, { memo, useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  label: string;
}

const Sparkline = memo(({ data, width = 140, height = 40, color = '#10b981', label }: SparklineProps) => {
  const points = useMemo(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    return data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }, [data, width, height]);

  return (
    <div className="flex flex-col p-3 rounded-xl bg-gray-900/40 border border-gray-800/50 backdrop-blur-sm group hover:border-gray-700/50 transition-all">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[9px] font-mono font-black uppercase tracking-widest text-gray-500 group-hover:text-gray-300 transition-colors">{label}</span>
        <span className="text-[10px] font-mono text-gray-200">{data[data.length - 1]?.toFixed(1)}</span>
      </div>
      <svg width={width} height={height} className="overflow-visible">
        <path
          d={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}33)` }}
        />
      </svg>
    </div>
  );
});

Sparkline.displayName = 'Sparkline';
export default Sparkline;
