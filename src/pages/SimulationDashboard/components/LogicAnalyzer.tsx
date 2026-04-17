import React, { useRef, useEffect, useState, memo } from 'react';
import { useSimulation } from '../../../hooks/useSimulation';
import { useTranslation } from '../../../i18n/LanguageContext';

const COLORS = {
  bg: '#0a0c10',
  grid: '#1e293b',
  signal: '#10b981', // Emerald-500
  signalShadow: 'rgba(16, 185, 129, 0.2)',
  cursor: '#f59e0b', // Amber-500
  label: '#64748b',
  text: '#ffffff',
  header: '#111827',
};

const LogicAnalyzer = memo(() => {
  const { state } = useSimulation();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(200); // px per ms
  const [scrollX, setScrollX] = useState(0); // in ms
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const [cursorA, setCursorA] = useState<number | null>(null);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [isDraggingA, setIsDraggingA] = useState(false);
  const [isDraggingB, setIsDraggingB] = useState(false);

  const autoScroll = useRef(true);

  // Get the default signal from state (Level 4 addition)
  const signal = state.logicHistory?.find(s => s.id === 'tx-main') || { id: 'tx-main', transitions: [] };

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setCanvasSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Update scrollX during simulation if autoScroll is enabled
  useEffect(() => {
    if (autoScroll.current && signal.transitions.length > 0) {
      const lastT = signal.transitions[signal.transitions.length - 1].t;
      const visibleMs = canvasSize.width / zoom;
      setScrollX(Math.max(0, lastT - visibleMs * 0.8));
    }
  }, [signal.transitions.length, zoom, canvasSize.width]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSize;
    if (width === 0 || height === 0) return;
    
    ctx.clearRect(0, 0, width, height);

    if (signal.transitions.length === 0) {
      ctx.fillStyle = COLORS.label;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t('logic.waiting'), width / 2, height / 2);
      return;
    }

    const plotHeight = height * 0.4;
    const centerY = height / 2;
    const highY = centerY - plotHeight / 2;
    const lowY = centerY + plotHeight / 2;

    const startTime = scrollX;
    const endTime = startTime + width / zoom;

    // 1. Draw Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const gridStep = zoom > 500 ? 0.1 : zoom > 100 ? 1 : zoom > 20 ? 10 : 100;
    const firstGrid = Math.floor(startTime / gridStep) * gridStep;
    for (let t = firstGrid; t <= endTime; t += gridStep) {
      const x = (t - startTime) * zoom;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();

    // 2. Draw Signal Path
    ctx.strokeStyle = COLORS.signal;
    ctx.lineWidth = 2;
    ctx.shadowBlur = autoScroll.current ? 8 : 0;
    ctx.shadowColor = COLORS.signalShadow;
    ctx.beginPath();

    // Find first point in view
    let firstIdx = signal.transitions.findIndex(tr => tr.t >= startTime);
    if (firstIdx === -1) firstIdx = signal.transitions.length - 1;
    if (firstIdx > 0) firstIdx--;

    const visibleTransitions = signal.transitions.slice(firstIdx);
    
    if (visibleTransitions.length > 0) {
      let lastV = visibleTransitions[0].v;
      let lastX = (visibleTransitions[0].t - startTime) * zoom;
      ctx.moveTo(lastX, lastV === 1 ? highY : lowY);

      for (let i = 1; i < visibleTransitions.length; i++) {
        const tr = visibleTransitions[i];
        const x = (tr.t - startTime) * zoom;
        if (x > width + 10) break;
        
        ctx.lineTo(x, lastV === 1 ? highY : lowY);
        ctx.lineTo(x, tr.v === 1 ? highY : lowY);
        
        // Protocol Decoding Overlay
        if (tr.label && zoom > 150) {
           ctx.save();
           ctx.shadowBlur = 0;
           ctx.fillStyle = tr.label === 'START' ? '#f59e0b' : tr.label === 'STOP' ? '#8b5cf6' : tr.label === 'PARITY' ? '#3b82f6' : '#94a3b8';
           ctx.font = 'bold 8px ui-monospace';
           ctx.textAlign = 'center';
           ctx.fillText(tr.label, x, highY - 15);
           ctx.restore();
        }

        lastX = x;
        lastV = tr.v;
      }
      ctx.lineTo(width, lastV === 1 ? highY : lowY);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Draw Cursors
    [cursorA, cursorB].forEach((cTime, i) => {
      if (cTime !== null) {
        const x = (cTime - startTime) * zoom;
        if (x >= 0 && x <= width) {
          ctx.strokeStyle = COLORS.cursor;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = COLORS.cursor;
          ctx.fillRect(x - 8, 5, 16, 16);
          ctx.fillStyle = 'black';
          ctx.font = 'bold 10px ui-monospace';
          ctx.textAlign = 'center';
          ctx.fillText(i === 0 ? 'A' : 'B', x, 17);
        }
      }
    });

    // 4. Differential Measurements
    if (cursorA !== null && cursorB !== null) {
      const deltaT = Math.abs(cursorB - cursorA);
      const freq = deltaT > 0 ? 1000 / deltaT : 0;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(width - 160, 10, 150, 45);
      ctx.strokeStyle = COLORS.cursor;
      ctx.lineWidth = 1;
      ctx.strokeRect(width - 160, 10, 150, 45);
      
      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px ui-monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`ΔT: ${deltaT.toFixed(3)} ms`, width - 150, 25);
      ctx.fillText(`Freq: ${freq.toFixed(1)} Hz`, width - 150, 42);
    }

    // No recursive requestAnimationFrame here anymore. 
    // This function now just performs a single static draw of the current state.
  };

  useEffect(() => {
    // Only trigger a draw when something meaningful changes.
    // We don't need a continuous loop because the component already re-renders 
    // and this effect runs when transitions or zoom changes.
    draw();
  }, [canvasSize, zoom, scrollX, signal.transitions.length, cursorA, cursorB]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const t = scrollX + x / zoom;

    if (cursorA !== null && Math.abs((cursorA - scrollX) * zoom - x) < 15) setIsDraggingA(true);
    else if (cursorB !== null && Math.abs((cursorB - scrollX) * zoom - x) < 15) setIsDraggingB(true);
    else {
      if (cursorA === null) setCursorA(t);
      else if (cursorB === null) setCursorB(t);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingA && !isDraggingB) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    setCursorA(prev => isDraggingA ? scrollX + x / zoom : prev);
    setCursorB(prev => isDraggingB ? scrollX + x / zoom : prev);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.8 : 1.2;
      setZoom(prev => Math.min(10000, Math.max(5, prev * delta)));
    } else {
      setScrollX(prev => Math.max(0, prev + e.deltaY / zoom));
      autoScroll.current = false;
    }
  };

  return (
    <div className="flex flex-col h-full bg-black border-t border-gray-800">
      <div className="px-4 py-1.5 bg-gray-900/50 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-gray-300 uppercase tracking-widest">Logic Analyzer v4.0</span>
          </div>
          <div className="h-4 w-px bg-gray-800" />
          <div className="flex gap-4">
             <div className="flex items-center gap-2">
                <span className="text-[9px] text-gray-500 uppercase">Zoom</span>
                <input 
                  type="range" min="5" max="2000" step="5" value={zoom} 
                  onChange={e => setZoom(Number(e.target.value))}
                  className="w-20 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
             </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
           <button 
             onClick={() => { setCursorA(null); setCursorB(null); }}
             className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[9px] font-mono text-gray-400 uppercase transition-colors"
           >
             {t('logic.clearCursors')}
           </button>
           <button 
             onClick={() => autoScroll.current = !autoScroll.current}
             className={`px-2 py-1 rounded text-[9px] font-mono uppercase transition-colors font-bold ${autoScroll.current ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-gray-800 text-gray-500'}`}
           >
             {autoScroll.current ? t('logic.running') : t('logic.paused')}
           </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative cursor-crosshair select-none bg-gray-950">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => { setIsDraggingA(false); setIsDraggingB(false); }}
          onMouseLeave={() => { setIsDraggingA(false); setIsDraggingB(false); }}
          onWheel={handleWheel}
          className="w-full h-full"
        />
        
        {/* Signal Labels */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-none opacity-40">
           <span className="text-[10px] font-mono font-black text-emerald-500 uppercase">TX_LINE</span>
           <div className="h-px w-8 bg-emerald-500" />
        </div>
      </div>

      <div className="px-4 py-1 bg-gray-900 border-t border-gray-800 flex justify-between items-center">
         <div className="flex gap-4 text-[9px] font-mono text-gray-600 uppercase">
            <span>{t('logic.scrollInstr')}</span>
            <span>{t('logic.zoomInstr')}</span>
            <span>{t('logic.measureInstr')}</span>
         </div>
      </div>
    </div>
  );
});

LogicAnalyzer.displayName = 'LogicAnalyzer';

export default LogicAnalyzer;
