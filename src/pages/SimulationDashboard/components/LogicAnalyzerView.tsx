import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useSimulation } from '../../../hooks/useSimulation';
import { BitTransition, LogicSignal } from '../../../types';

const COLORS = {
  bg: '#0a0c10',
  grid: '#1e293b',
  signal: '#22c55e', // Emerald-500
  signalShadow: 'rgba(34, 197, 94, 0.2)',
  cursor: '#f59e0b', // Amber-500
  label: '#94a3b8',
  text: '#ffffff',
  trigger: '#ef4444', // Red-500
};

export const LogicAnalyzerView: React.FC = () => {
  const { state } = useSimulation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport state
  const [zoom, setZoom] = useState(1); // px per ms
  const [scrollX, setScrollX] = useState(0); // in ms
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Measurement Cursors (in ms)
  const [cursorA, setCursorA] = useState<number | null>(null);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [isDraggingA, setIsDraggingA] = useState(false);
  const [isDraggingB, setIsDraggingB] = useState(false);

  // Auto-scroll logic: if near the end, keep scrolling
  const autoScroll = useRef(true);

  const signal = state.logicHistory.find((s: LogicSignal) => s.id === 'tx-main') || { id: 'tx-main', transitions: [] };

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
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Update zoom based on baud rate initially
  useEffect(() => {
    if (state.profileId && !scrollX) {
      // Find a reasonable zoom for the current baud rate
      // At 9600, 1 bit is ~0.1ms. We want maybe 20px per bit.
      // 20px / 0.1ms = 200 zoom level.
      setZoom(200);
    }
  }, [state.profileId]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSize;
    ctx.clearRect(0, 0, width, height);

    if (signal.transitions.length === 0) {
      ctx.fillStyle = COLORS.label;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA STREAM DETECTED... START SIMULATION', width / 2, height / 2);
      return;
    }

    const margin = 40;
    const plotHeight = height - 80;
    const centerY = height / 2;
    const highY = centerY - plotHeight / 3;
    const lowY = centerY + plotHeight / 3;

    // Time window
    const startTime = scrollX;
    const endTime = startTime + width / zoom;

    // 1. Draw Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Vertical timing lines every 1ms or 10ms depending on zoom
    const gridStep = zoom > 50 ? 1 : 10;
    const firstGrid = Math.floor(startTime / gridStep) * gridStep;
    for (let t = firstGrid; t <= endTime; t += gridStep) {
      const x = (t - startTime) * zoom;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      
      if (zoom > 20) {
        ctx.fillStyle = COLORS.label;
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText(`${t.toFixed(1)}ms`, x + 2, height - 10);
      }
    }
    ctx.stroke();

    // 2. Draw Signal
    ctx.strokeStyle = COLORS.signal;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = COLORS.signalShadow;
    ctx.beginPath();

    const visibleTransitions = signal.transitions.filter((tr: BitTransition) => tr.t >= startTime - (1000/zoom) && tr.t <= endTime + (1000/zoom));
    
    if (visibleTransitions.length > 0) {
      let lastX = (visibleTransitions[0].t - startTime) * zoom;
      let lastV = visibleTransitions[0].v;
      ctx.moveTo(lastX, lastV === 1 ? highY : lowY);

      for (let i = 1; i < visibleTransitions.length; i++) {
        const tr = visibleTransitions[i];
        const x = (tr.t - startTime) * zoom;
        
        // Horizontal to new transition time
        ctx.lineTo(x, lastV === 1 ? highY : lowY);
        // Vertical transition
        ctx.lineTo(x, tr.v === 1 ? highY : lowY);
        
        lastX = x;
        lastV = tr.v;

        // Draw Labels
        if (tr.label && zoom > 100) {
          ctx.fillStyle = COLORS.text;
          ctx.font = 'bold 8px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(tr.label, x, highY - 15);
        }
      }
      
      // Extend to end of screen
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
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = COLORS.cursor;
          ctx.fillRect(x - 20, 5, 40, 15);
          ctx.fillStyle = 'black';
          ctx.font = 'bold 10px ui-monospace';
          ctx.textAlign = 'center';
          ctx.fillText(i === 0 ? 'A' : 'B', x, 16);
        }
      }
    });

    // 4. Cursor Measurements
    if (cursorA !== null && cursorB !== null) {
      const deltaT = Math.abs(cursorB - cursorA);
      const freq = deltaT > 0 ? 1000 / deltaT : 0;
      
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(10, 10, 180, 50);
      ctx.strokeStyle = COLORS.cursor;
      ctx.strokeRect(10, 10, 180, 50);
      
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px ui-monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`ΔT: ${deltaT.toFixed(4)} ms`, 20, 25);
      ctx.fillText(`ΔT: ${(deltaT * 1000).toFixed(1)} µs`, 20, 40);
      ctx.fillText(`Freq: ${freq.toFixed(2)} Hz`, 20, 55);
    }
  };

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [canvasSize, zoom, scrollX, signal.transitions.length, cursorA, cursorB]);

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const t = scrollX + x / zoom;

    // Check if clicking near cursor A or B
    if (cursorA !== null && Math.abs((cursorA - scrollX) * zoom - x) < 10) setIsDraggingA(true);
    else if (cursorB !== null && Math.abs((cursorB - scrollX) * zoom - x) < 10) setIsDraggingB(true);
    else {
      // Place cursor B where clicked if A exists, else place A
      if (cursorA === null) setCursorA(t);
      else setCursorB(t);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingA && !isDraggingB) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const t = scrollX + x / zoom;

    if (isDraggingA) setCursorA(t);
    if (isDraggingB) setCursorB(t);
  };

  const handleMouseUp = () => {
    setIsDraggingA(false);
    setIsDraggingB(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      // Zoom
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.min(5000, Math.max(1, prev * delta)));
    } else {
      // Scroll
      setScrollX(prev => Math.max(0, prev + e.deltaY / zoom));
      autoScroll.current = false;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 rounded-xl border border-white/5 overflow-hidden">
      <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
            Logic Analyzer v1.0
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-gray-500 uppercase">Zoom:</span>
            <input 
              type="range" 
              min="1" max="5000" 
              value={zoom} 
              onChange={e => setZoom(Number(e.target.value))}
              className="w-24 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={() => { setCursorA(null); setCursorB(null); }}
             className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[9px] font-mono text-gray-400 uppercase transition-colors"
           >
             Reset Cursors
           </button>
           <button 
             onClick={() => { autoScroll.current = true; if (signal.transitions.length > 0) setScrollX(signal.transitions[signal.transitions.length-1].t - (canvasSize.width / 2 / zoom)); }}
             className={`px-2 py-1 rounded text-[9px] font-mono uppercase transition-colors ${autoScroll.current ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}
           >
             {autoScroll.current ? 'Live Sync' : 'Static View'}
           </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative cursor-crosshair select-none overflow-hidden">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        
        {/* Overlay Labels */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
           <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-emerald-500/50 uppercase tracking-tighter">UART TX</span>
              <div className="h-px w-8 bg-emerald-500/20" />
           </div>
        </div>
      </div>

      <div className="px-4 py-1.5 bg-white/[0.02] border-t border-white/5 flex justify-between items-center">
         <div className="flex gap-4 text-[9px] font-mono text-gray-500 uppercase">
            <span>Scroll: Drag / Wheel</span>
            <span>Zoom: Ctrl + Wheel</span>
            <span>Measure: Click to place A/B</span>
         </div>
         <div className="text-[9px] font-mono text-gray-400">
            Current Baud: {state.profileId ? (state.profileId.includes('Medical') ? 9600 : 115200) : '-' } bps
         </div>
      </div>
    </div>
  );
};

export default LogicAnalyzerView;
