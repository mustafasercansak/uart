import React from 'react';

interface AnalogGaugeProps {
  value: number;
  min?: number;
  max?: number;
  color: string;
  label: string;
}

const AnalogGauge: React.FC<AnalogGaugeProps> = ({ 
  value, 
  min = 0, 
  max = 255, 
  color,
  label 
}) => {
  const range = max - min;
  const percentage = range === 0 ? 0 : Math.min(100, Math.max(0, ((value - min) / range) * 100));
  const rotation = (percentage * 1.8) - 90; // -90 to 90 degrees

  return (
    <div className="flex flex-col items-center justify-center h-full p-2 bg-gray-900/40 rounded-lg group select-none overflow-hidden">
      <div className="relative w-32 h-16 mb-2 overflow-hidden">
        {/* Background Arc */}
        <div className="absolute inset-0 border-[6px] border-gray-800 rounded-t-full" />
        
        {/* Fill Arc (CSS Gradient masking or stroke-dasharray is complex in pure CSS, using SVG for better results) */}
        <svg viewBox="0 0 100 50" className="absolute inset-0 w-full h-full">
           <path 
             d="M 5 50 A 45 45 0 0 1 95 50" 
             fill="none" 
             stroke="#1f2937" 
             strokeWidth="8" 
             strokeLinecap="round"
           />
           <path 
             d="M 5 50 A 45 45 0 0 1 95 50" 
             fill="none" 
             stroke={color} 
             strokeWidth="8" 
             strokeLinecap="round"
             strokeDasharray="141.37"
             strokeDashoffset={141.37 - (percentage / 100) * 141.37}
             className="transition-all duration-500 ease-out opacity-20"
             style={{ filter: `blur(4px)` }}
           />
           <path 
             d="M 5 50 A 45 45 0 0 1 95 50" 
             fill="none" 
             stroke={color} 
             strokeWidth="6" 
             strokeLinecap="round"
             strokeDasharray="141.37"
             strokeDashoffset={141.37 - (percentage / 100) * 141.37}
             className="transition-all duration-500 ease-out"
           />
        </svg>

        {/* Needle */}
        <div 
          className="absolute bottom-0 left-1/2 w-0.5 h-12 bg-white origin-bottom transition-transform duration-500 ease-out shadow-[0_0_8px_rgba(255,255,255,0.8)]"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        >
           <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full" />
        </div>
      </div>

      <div className="text-center">
        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1">{label}</div>
        <div 
          className="text-xl font-black font-mono tracking-tighter"
          style={{ color, textShadow: `0 0 10px ${color}40` }}
        >
          {value.toFixed(1)}
        </div>
      </div>

      {/* Ticks */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between text-[8px] font-mono text-gray-700">
         <span>{min}</span>
         <span>{max}</span>
      </div>
    </div>
  );
};

export default AnalogGauge;
