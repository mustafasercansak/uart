/* eslint-disable react-hooks/refs */
import React, { useRef, useEffect } from 'react';

interface SweepChartWidgetProps {
  dataKey: string;
  waveformHistoryRef: React.MutableRefObject<Array<Record<string, number>>>;
  color: string;
  label: string;
}

const SweepChartWidget: React.FC<SweepChartWidgetProps> = ({
  dataKey,
  waveformHistoryRef,
  color,
  label
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const writePosRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset position on mount
    writePosRef.current = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [dataKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const history = waveformHistoryRef.current;
    if (history.length === 0) return;

    const width = canvas.width;
    const height = canvas.height;

    // We draw the last point relative to the previous point in history
    const lastPoint = history[history.length - 1];
    const prevPoint = history[history.length - 2] || lastPoint;

    const val = lastPoint[dataKey] ?? 0;
    const prevVal = prevPoint[dataKey] ?? 0;

    // Normalizing values (assumed range 0-255 for medical wave simulation, or compute range)
    const normY = height - ((val / 255) * (height - 10) + 5);
    const prevNormY = height - ((prevVal / 255) * (height - 10) + 5);

    const step = 2; // sweep line speed
    const x = writePosRef.current;
    const prevX = (x - step + width) % width;

    // Clear a small strip ahead of the sweep line to erase old data
    ctx.fillStyle = '#030712'; // match background
    ctx.fillRect(x, 0, step + 8, height);

    // Draw the segment
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;
    
    if (x >= step) {
      ctx.moveTo(prevX, prevNormY);
      ctx.lineTo(x, normY);
    } else {
      ctx.moveTo(0, normY);
      ctx.lineTo(x, normY);
    }
    ctx.stroke();

    // Advance sweep line
    writePosRef.current = (x + step) % width;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveformHistoryRef.current.length, color, dataKey]);

  return (
    <div className="flex flex-col h-full p-2 bg-gray-900/40 rounded-lg overflow-hidden select-none">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">{label} (Sweep)</span>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      </div>
      <div className="flex-1 min-h-0 relative bg-gray-950 rounded border border-gray-800/50">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          width={300}
          height={100}
        />
      </div>
    </div>
  );
};

export default SweepChartWidget;
