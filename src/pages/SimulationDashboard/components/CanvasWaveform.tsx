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
}

export default function CanvasWaveform({
  dataKey,
  history,
  color,
  height = 80,
  enableGlow = true,
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
    </div>
  );
}
