import { useMemo, useEffect, useRef, useState } from 'react';
import UplotReact from 'uplot-react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface CanvasWaveformProps {
  dataKey: string;
  history: Array<Record<string, number>>;
  color: string;
  height?: number;
  /** If true, the panel will flash briefly when the value spikes significantly */
  enableGlow?: boolean;
  showCursors?: boolean;
  cursorA?: number | null;
  cursorB?: number | null;
  onCursorMove?: (type: 'A' | 'B', index: number) => void;
}

export default function CanvasWaveform({
  dataKey,
  color,
  history = [],
  height = 80,
  enableGlow = true,
  showCursors = false,
  cursorA = null,
  cursorB = null,
  onCursorMove
}: CanvasWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const prevValRef = useRef<number | null>(null);
  const [width, setWidth] = useState(300);
  const [currentHeight, setCurrentHeight] = useState(height);

  // Respond to container resizes
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(Math.floor(entry.contentRect.width));
        if (entry.contentRect.height > 0) {
          setCurrentHeight(Math.floor(entry.contentRect.height));
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Spike / glow flash effect: fires when value changes by >10% of range
  useEffect(() => {
    if (!enableGlow || !glowRef.current || history.length < 2) return;
    const last = history[history.length - 1]?.[dataKey] ?? 0;
    const prev = prevValRef.current;
    if (prev !== null) {
      const delta = Math.abs(last - prev);
      const range = Math.max(Math.abs(last), Math.abs(prev), 1);
      if (delta / range > 0.12) {
        // Flash glow overlay
        const el = glowRef.current;
        el.style.opacity = '1';
        el.style.transition = 'none';
        requestAnimationFrame(() => {
          el.style.transition = 'opacity 500ms ease-out';
          el.style.opacity = '0';
        });
      }
    }
    prevValRef.current = last;
  }, [history, dataKey, enableGlow]);

  const options = useMemo<uPlot.Options>(() => ({
    width,
    height: currentHeight,
    cursor: { show: false },
    legend: { show: false },
    padding: [2, 0, 0, 0],
    axes: [{ show: false }, { show: false }],
    scales: { x: { time: false } },
    series: [
      {},
      {
        stroke: color,
        width: 2,
        fill: `${color}22`,
        points: { show: false },
      },
    ],
  }), [width, currentHeight, color]);

  // Build aligned data [ [x...], [y...] ]
  const chartData = useMemo<uPlot.AlignedData>(() => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < history.length; i++) {
      x.push(history[i].t ?? i);
      y.push(history[i][dataKey] ?? 0);
    }
    return [x, y];
  }, [history, dataKey]);

  // Stable memo key: only recompute when new data actually arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const handleChartClick = (e: React.MouseEvent) => {
    if (!showCursors || !onCursorMove) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const pct = x / width;
    const idx = Math.floor(pct * history.length);
    const clampedIdx = Math.max(0, Math.min(idx, history.length - 1));

    // Simple A/B toggle logic: if A is null, set A. If A is set and B is null, set B. 
    // If both are set, set the closest one.
    if (cursorA === null) {
      onCursorMove('A', clampedIdx);
    } else if (cursorB === null) {
      onCursorMove('B', clampedIdx);
    } else {
      const distA = Math.abs(clampedIdx - cursorA);
      const distB = Math.abs(clampedIdx - cursorB);
      if (distA < distB) onCursorMove('A', clampedIdx);
      else onCursorMove('B', clampedIdx);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative uplot-dark">
      {/* Spike glow overlay */}
      {enableGlow && (
        <div
          ref={glowRef}
          className="absolute inset-0 pointer-events-none rounded-sm opacity-0 z-10"
          style={{
            background: `radial-gradient(ellipse at center, ${color}35 0%, transparent 70%)`,
          }}
        />
      )}
      <UplotReact options={options} data={chartData} />
      
      {/* Interactive Cursors Layer */}
      {showCursors && (
        <div 
          className="absolute inset-0 z-20 cursor-crosshair" 
          onClick={handleChartClick}
        >
          {cursorA !== null && (
            <div 
              className="absolute top-0 bottom-0 w-[1px] bg-emerald-500 shadow-[0_0_8px_#10b981]"
              style={{ left: `${(cursorA / (history.length - 1)) * 100}%` }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-emerald-500 text-[8px] font-black px-1 rounded-b text-black h-3 flex items-center">A</div>
            </div>
          )}
          {cursorB !== null && (
            <div 
              className="absolute top-0 bottom-0 w-[1px] bg-rose-500 shadow-[0_0_8px_#f43f5e]"
              style={{ left: `${(cursorB / (history.length - 1)) * 100}%` }}
            >
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-rose-500 text-[8px] font-black px-1 rounded-t text-black h-3 flex items-center">B</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
