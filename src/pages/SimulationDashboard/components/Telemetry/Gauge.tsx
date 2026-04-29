import React, { memo, useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useTranslation } from '../../../../i18n/context';

interface GaugeProps {
  value: number;
  min: number;
  max: number;
  unit?: string;
  label: string;
  color?: string;
}

const Gauge = memo(({ value, min, max, unit, label, color: baseColor = '#10b981' }: GaugeProps) => {
  const { t } = useTranslation();
  const [sessionMin, setSessionMin] = useState(value);
  const [sessionMax, setSessionMax] = useState(value);
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const prevValueRef = useRef(value);
  const sessionMinRef = useRef(value);
  const sessionMaxRef = useRef(value);

  useEffect(() => {
    if (value < sessionMinRef.current) {
      sessionMinRef.current = value;
      setSessionMin(value);
    }
    if (value > sessionMaxRef.current) {
      sessionMaxRef.current = value;
      setSessionMax(value);
    }

    // Trend calculation
    if (value > prevValueRef.current) setTrend('up');
    else if (value < prevValueRef.current) setTrend('down');
    else setTrend('stable');

    prevValueRef.current = value;
  }, [value]);

  // Color logic (Red for extreme values)
  const range = max - min;
  const isExtreme = value > max - (range * 0.1) || value < min + (range * 0.1);
  const color = isExtreme ? '#ef4444' : baseColor;

  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.min(Math.max(value, min), max);
  const percentage = ((clampedValue - min) / (max - min)) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-900/40 border border-gray-800/50 backdrop-blur-sm group hover:border-gray-700/50 transition-all">
      <div className="flex justify-between w-full px-1 mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
        <div className="flex flex-col">
          <span className="text-[7px] uppercase font-black text-gray-500">{t('common.min')}</span>
          <span className="text-[9px] font-mono font-bold text-gray-300">{Math.round(sessionMin)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[7px] uppercase font-black text-gray-500">{t('common.max')}</span>
          <span className="text-[9px] font-mono font-bold text-gray-300">{Math.round(sessionMax)}</span>
        </div>
      </div>

      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90 transform overflow-visible">
          {/* Background Track */}
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-gray-800/40" />
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
              filter: `drop-shadow(0 0 8px ${color}${isExtreme ? '88' : '44'})`,
              transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' 
            }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-center gap-0.5">
            <span className="text-lg font-black font-mono tracking-tighter text-gray-100">{Math.round(value)}</span>
            <div className={`transition-colors duration-300 ${trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-gray-600'}`}>
              {trend === 'up' && <TrendingUp size={10} />}
              {trend === 'down' && <TrendingDown size={10} />}
              {trend === 'stable' && <Minus size={10} />}
            </div>
          </div>
          {unit && <span className="text-[8px] font-mono uppercase text-gray-500 font-bold -mt-1 leading-none">{unit}</span>}
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
