import React from 'react';

interface SevenSegmentProps {
  value: number;
  color: string;
  label: string;
  digits?: number;
}

const SevenSegment: React.FC<SevenSegmentProps> = ({ value, color, label, digits = 4 }) => {
  // Simple representation for now, focusing on the aesthetic
  const formattedValue = Math.floor(value).toString().padStart(digits, '0').slice(-digits);
  
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 bg-gray-950/60 rounded-lg border border-gray-900 border-inner">
      <div className="flex gap-1.5 p-3 bg-black/40 rounded-md border border-gray-800 shadow-inner">
        {formattedValue.split('').map((char, i) => (
          <div 
            key={i}
            className="w-10 h-16 bg-gray-900/20 rounded-sm relative flex items-center justify-center font-black text-4xl opacity-90 italic"
            style={{ 
              color, 
              textShadow: `0 0 15px ${color}80, 0 0 5px ${color}`,
              fontFamily: "'Courier New', Courier, monospace" // Fallback for 7-segment font feel
            }}
          >
            {char}
            {/* Ambient segment background for extra realism */}
            <div className="absolute inset-0 flex items-center justify-center text-gray-900/10 pointer-events-none">8</div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-center">
        <div className="text-[10px] font-mono text-gray-600 uppercase tracking-[0.3em] font-bold">{label}</div>
      </div>
    </div>
  );
};

export default SevenSegment;
