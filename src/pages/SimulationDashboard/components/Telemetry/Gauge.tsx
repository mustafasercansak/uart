import React, { memo } from 'react';

interface GaugeProps {
  value: number;
  min: number;
  max: number;
  unit?: string;
  label: string;
  color?: string;
}

const Gauge = memo(({ value, min, max, unit, label, color = '#10b981' }: GaugeProps) => {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.min(Math.max(value, min), max);
  const percentage = ((clampedValue - min) / (max - min)) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-900/40 border border-gray-800/50 backdrop-blur-sm group hover:border-gray-700/50 transition-all">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90 transform overflow-visible">
          {/* Background Track */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-gray-800/40"
          />
          {/* Progress Path */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={circumference}
            style={{ 
              strokeDashoffset,
              filter: `drop-shadow(0 0 6px ${color}44)`,
              transition: 'stroke-dashoffset 0.5s cubic-bezier(0.4, 0, 0.2, 1)' 
            }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black font-mono tracking-tighter text-gray-100">{Math.round(value)}</span>
          {unit && <span className="text-[8px] font-mono uppercase text-gray-500 font-bold">{unit}</span>}
        </div>
      </div>
      <div className="mt-2 text-[9px] font-mono font-black uppercase tracking-widest text-gray-500 group-hover:text-gray-300 transition-colors">
        {label}
      </div>
    </div>
  );
});

Gauge.displayName = 'Gauge';
export default Gauge;
