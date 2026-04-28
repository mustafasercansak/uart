import { useEffect, useRef, type MutableRefObject } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface CanvasWaveformProps {
  dataKey: string;
  waveformHistoryRef: MutableRefObject<Array<Record<string, number>>>;
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
  waveformHistoryRef,
  height = 80,
  showCursors = false,
  cursorA = null,
  cursorB = null,
  onCursorMove,
}: CanvasWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ width: 300, height });

  // Keep latest prop values readable inside RAF closure without re-creating the effect
  const dataKeyRef = useRef(dataKey);
  dataKeyRef.current = dataKey;

  // Respond to container resizes imperatively
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width) || sizeRef.current.width;
        const h = Math.floor(e.contentRect.height) || sizeRef.current.height;
        if (w !== sizeRef.current.width || h !== sizeRef.current.height) {
          sizeRef.current = { width: w, height: h };
          uplotRef.current?.setSize({ width: w, height: h });
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Create uPlot once. RAF loop drives all chart updates — zero React renders.
  useEffect(() => {
    if (!containerRef.current) return;
    const { width, height: h } = sizeRef.current;

    const opts: uPlot.Options = {
      width,
      height: h,
      cursor: { show: false },
      legend: { show: false },
      padding: [2, 0, 0, 0],
      axes: [{ show: false }, { show: false }],
      scales: { x: { time: false } },
      series: [
        {},
        { stroke: color, width: 2, fill: `${color}22`, points: { show: false } },
      ],
    };

    const plot = new uPlot(opts, [[], []], containerRef.current);
    uplotRef.current = plot;

    const tick = () => {
      const u = uplotRef.current;
      if (!u) return;

      const history = waveformHistoryRef.current;
      if (history.length > 0) {
        const dk = dataKeyRef.current;
        const maxPoints = Math.max(120, Math.floor(sizeRef.current.width * 0.75));
        const step = history.length > maxPoints ? Math.ceil(history.length / maxPoints) : 1;
        const x: number[] = [];
        const y: number[] = [];

        for (let i = 0; i < history.length; i += step) {
          x.push(history[i].t ?? i);
          y.push(history[i][dk] ?? 0);
        }
        // Always include last point so right edge stays current
        const last = history[history.length - 1];
        const lastX = last.t ?? history.length - 1;
        if (x.length === 0 || x[x.length - 1] !== lastX) {
          x.push(lastX);
          y.push(last[dk] ?? 0);
        }
        u.setData([x, y]);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      plot.destroy();
      uplotRef.current = null;
    };
  // color change is rare; if needed, parent can key-mount a new instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveformHistoryRef]);

  const handleChartClick = (e: React.MouseEvent) => {
    if (!showCursors || !onCursorMove) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = (e.clientX - rect.left) / sizeRef.current.width;
    const histLen = waveformHistoryRef.current.length;
    const idx = Math.max(0, Math.min(Math.floor(pct * histLen), histLen - 1));

    if (cursorA === null) {
      onCursorMove('A', idx);
    } else if (cursorB === null) {
      onCursorMove('B', idx);
    } else {
      const distA = Math.abs(idx - cursorA);
      const distB = Math.abs(idx - cursorB);
      onCursorMove(distA < distB ? 'A' : 'B', idx);
    }
  };

  const histLen = waveformHistoryRef.current.length;

  return (
    <div ref={containerRef} className="w-full h-full relative uplot-dark">
      {showCursors && (
        <div
          className="absolute inset-0 z-20 cursor-crosshair"
          onClick={handleChartClick}
        >
          {cursorA !== null && histLen > 0 && (
            <div
              className="absolute top-0 bottom-0 w-[1px] bg-emerald-500 shadow-[0_0_8px_#10b981]"
              style={{ left: `${(cursorA / (histLen - 1)) * 100}%` }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-emerald-500 text-[8px] font-black px-1 rounded-b text-black h-3 flex items-center">A</div>
            </div>
          )}
          {cursorB !== null && histLen > 0 && (
            <div
              className="absolute top-0 bottom-0 w-[1px] bg-rose-500 shadow-[0_0_8px_#f43f5e]"
              style={{ left: `${(cursorB / (histLen - 1)) * 100}%` }}
            >
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-rose-500 text-[8px] font-black px-1 rounded-t text-black h-3 flex items-center">B</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
