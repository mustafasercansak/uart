import React, { useRef, useEffect, useState } from 'react';
import { Settings, BarChart3, Maximize2, Zap } from 'lucide-react';
import { DSPEngine, type WindowType } from '../../../engines/DSPEngine';
import { useTranslation } from '../../../i18n/context';

interface SpectrumAnalyzerProps {
  waveformHistory: Array<Record<string, number>>;
  dataKey: string | null;
}

const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({ waveformHistory, dataKey }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [windowType, setWindowType] = useState<WindowType>('Hanning');

  const lastCalcTime = useRef(0);
  const cachedDataRef = useRef<Float32Array | null>(null);

  const [fftData, setFftData] = useState<Float32Array | null>(null);

  useEffect(() => {
    if (!dataKey || waveformHistory.length < 256) {
      setTimeout(() => {
        setFftData(null);
      }, 0);
      return;
    }
    
    // Throttled calculation logic
    const now = Date.now();
    if (now - lastCalcTime.current < 50 && cachedDataRef.current) {
      return;
    }

    const size = waveformHistory.length >= 512 ? 512 : 256;
    const raw = waveformHistory.slice(-size).map(p => p[dataKey] || 0);
    
    const real = new Float32Array(size);
    const imag = new Float32Array(size);
    for (let i = 0; i < size; i++) real[i] = raw[i];

    DSPEngine.applyWindow(real, windowType);
    DSPEngine.fft(real, imag);
    const mag = DSPEngine.calculateMagnitude(real, imag);
    
    cachedDataRef.current = mag;
    lastCalcTime.current = now;
    
    // Schedule async to avoid 'sync setState in effect' warning
    const timeout = setTimeout(() => setFftData(mag), 0);
    return () => clearTimeout(timeout);
  }, [waveformHistory, dataKey, windowType]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fftData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / fftData.length;
    
    // Draw Spectrum Bars
    for (let i = 0; i < fftData.length; i++) {
        const val = fftData[i]; // Value in dB (-100 to 0)
        
        // Normalize for display (height is 0 at -100dB, max at 0dB)
        const h = Math.max(0, (val + 100) / 100) * height * 0.8;
        const x = i * barWidth;
        const y = height - h;

        // Gradient based on magnitude
        const hue = 220 - (h / height) * 160; // Blue to Red/Orange
        ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.9)`;
        
        ctx.fillRect(x, y, barWidth - 1, h);
        
        // Dynamic Glow for active peaks
        if (h > height * 0.5) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = `hsla(${hue}, 80%, 50%, 0.5)`;
        } else {
            ctx.shadowBlur = 0;
        }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    for (let i = 1; i < 5; i++) {
        const y = (i / 5) * height;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();

  }, [fftData]);

  return (
    <div className="flex-1 flex flex-col bg-gray-900/40 rounded-2xl border border-gray-800/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/40">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-500/20 rounded-lg">
             <BarChart3 size={16} className="text-indigo-400" />
          </div>
          <div className="flex flex-col">
             <span className="text-[10px] font-mono font-black text-indigo-400 uppercase tracking-widest">{t('spectrum.title')}</span>
             <span className="text-[9px] text-gray-500 font-mono uppercase tracking-tighter">
               {dataKey ? t('spectrum.source', { key: dataKey }) : t('spectrum.selectSignal')}
             </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-950/60 rounded-md border border-gray-800/50">
               <span className="text-[8px] font-mono text-gray-500 uppercase">{t('spectrum.window')}</span>
               <select 
                 value={windowType}
                 onChange={(e) => setWindowType(e.target.value as WindowType)}
                 className="bg-transparent text-[9px] font-mono text-indigo-400 outline-none cursor-pointer"
               >
                 <option value="Rectangular">{t('spectrum.rectangular')}</option>
                 <option value="Hanning">{t('spectrum.hanning')}</option>
                 <option value="Hamming">{t('spectrum.hamming')}</option>
               </select>
            </div>
            <button className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors">
               <Settings size={14} />
            </button>
        </div>
      </div>

      <div className="flex-1 relative p-4 flex items-center justify-center">
        {(!dataKey || (fftData && fftData.length === 0)) ? (
           <div className="flex flex-col items-center gap-4 opacity-30 select-none">
              <Zap size={48} className="text-gray-600 animate-pulse" />
              <div className="flex flex-col items-center text-center">
                <span className="text-xs font-mono font-bold text-gray-400 uppercase">{t('spectrum.insufficientData')}</span>
                <span className="text-[10px] font-mono text-gray-600 mt-1 max-w-[200px]">{t('spectrum.waitSignal')}</span>
              </div>
           </div>
        ) : (
           <canvas 
             ref={canvasRef} 
             width={800} 
             height={400} 
             className="w-full h-full object-contain"
           />
        )}
        
        {/* Floating Axis Labels */}
        {fftData && (
          <>
            <div className="absolute left-6 top-6 bottom-6 flex flex-col justify-between text-[8px] font-mono text-indigo-500/50 pointer-events-none">
                <span>{t('spectrum.db', { value: 0 })}</span>
                <span>{t('spectrum.db', { value: -20 })}</span>
                <span>{t('spectrum.db', { value: -40 })}</span>
                <span>{t('spectrum.db', { value: -60 })}</span>
                <span>{t('spectrum.db', { value: -80 })}</span>
                <span>{t('spectrum.db', { value: -100 })}</span>
            </div>
            <div className="absolute bottom-6 left-6 right-6 flex justify-between text-[8px] font-mono text-indigo-500/50 pointer-events-none">
                <span>{t('spectrum.hz')}</span>
                <span>{t('spectrum.nyquistLimit')}</span>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-2 bg-indigo-500/5 border-t border-indigo-500/10 flex items-center justify-between">
         <span className="text-[8px] font-mono text-indigo-400 uppercase font-black">{t('spectrum.engineActive')}</span>
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
               <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" />
               <span className="text-[8px] font-mono text-gray-500 uppercase">{t('spectrum.resolution', { count: fftData?.length || 0 })}</span>
            </div>
         </div>
      </div>
    </div>
  );
};

export default SpectrumAnalyzer;
