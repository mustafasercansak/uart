import React from 'react';

interface LedIndicatorProps {
  active: boolean;
  color: string;
  label: string;
}

const LedIndicator: React.FC<LedIndicatorProps> = ({ active, color, label }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-900/40 rounded-lg select-none">
      <div 
        className={`w-12 h-12 rounded-full border-4 border-gray-800 transition-all duration-300 relative ${
          active ? 'shadow-[0_0_20px_rgba(255,255,255,0.2)]' : ''
        }`}
        style={{ 
          backgroundColor: active ? color : '#111827',
          borderColor: active ? `${color}40` : '#1f2937',
          boxShadow: active ? `0 0 30px ${color}80, inset 0 0 10px rgba(255,255,255,0.4)` : 'inset 0 0 10px rgba(0,0,0,0.5)'
        }}
      >
        {/* Shine highlight */}
        <div className="absolute top-1 left-2 w-3 h-2 bg-white/20 rounded-full rotate-[-30deg]" />
      </div>
      
      <div className="mt-3 text-center">
        <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest leading-none mb-1">{label}</div>
        <div className={`text-[9px] font-black font-mono transition-colors ${active ? 'text-white' : 'text-gray-700'}`}>
          {active ? 'ACTIVE' : 'IDLE'}
        </div>
      </div>
    </div>
  );
};

export default LedIndicator;
