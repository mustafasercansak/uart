import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ResponsiveGridLayout } from 'react-grid-layout';
import type { Layout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout';
import { X, GripHorizontal, RotateCcw, Activity, ChartLine, Gauge as GaugeIcon, Lightbulb, Settings, Check } from 'lucide-react';
import type { GridPanel, WidgetType } from '../../../types';
import CanvasWaveform from './CanvasWaveform';
import AnalogGauge from './Widgets/AnalogGauge';
import LedIndicator from './Widgets/LedIndicator';
import SevenSegment from './Widgets/SevenSegment';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const STORAGE_KEY = 'uart-dashboard-grid-v3';

interface DashboardGridProps {
  panels:        GridPanel[];
  history:       Array<Record<string, number>>;
  onRemovePanel: (id: string) => void;
  onUpdatePanel?: (id: string, updates: Partial<GridPanel>) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generates a clean tiled layout for the given panels */
function buildLayout(panels: GridPanel[], cols = 12): readonly LayoutItem[] {
  // 3 columns of width=4 each
  const perRow = Math.max(1, Math.floor(cols / 4));
  return panels.map((p, i) => ({
    i:    p.id,
    x:    (i % perRow) * 4,
    y:    Math.floor(i / perRow) * 5,
    w:    4,
    h:    5,
    minW: 2,
    minH: 3,
  }));
}

function loadPerPanelPositions(): Record<string, { x: number; y: number; w: number; h: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePerPanelPositions(
  layout: readonly LayoutItem[]
): void {
  try {
    const map: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const item of layout) {
      map[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* noop */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardGrid({ panels, history, onRemovePanel, onUpdatePanel }: DashboardGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [settingsOpen, setSettingsOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        if (e.contentRect.width > 0) setContainerWidth(e.contentRect.width);
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Build layout from panels, merging stored positions
  const [storedPositions, setStoredPositions] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >(loadPerPanelPositions);

  const currentLayout = useMemo<readonly LayoutItem[]>(() => {
    const perRow = Math.max(1, Math.floor(12 / 4));
    return panels.map((p, i) => {
      const saved = storedPositions[p.id];
      return {
        i:    p.id,
        x:    saved?.x ?? (i % perRow) * 4,
        y:    saved?.y ?? Math.floor(i / perRow) * 5,
        w:    saved?.w ?? 4,
        h:    saved?.h ?? 5,
        minW: 2,
        minH: 3,
      };
    });
  }, [panels, storedPositions]);

  const layouts = useMemo<ResponsiveLayouts>(() => ({
    lg: currentLayout,
    md: currentLayout,
    sm: currentLayout,
  }), [currentLayout]);

  const handleLayoutChange = useCallback(
    (layout: Layout, _allLayouts: ResponsiveLayouts) => {
      savePerPanelPositions(layout);
      const next: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const item of layout) next[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
      setStoredPositions(next);
    },
    []
  );

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setStoredPositions({});
  }, []);

  const lastPoint = history[history.length - 1] ?? {};

  const renderWidgetContent = (panel: GridPanel, value: number) => {
    switch (panel.widgetType) {
      case 'gauge':
        return <AnalogGauge value={value} color={panel.color} label={panel.fieldName} min={panel.config?.min ?? 0} max={panel.config?.max ?? 255} />;
      case 'led':
        return <LedIndicator active={value > 0} color={panel.color} label={panel.fieldName} />;
      case '7segment':
        return <SevenSegment value={value} color={panel.color} label={panel.fieldName} />;
      case 'chart':
      default:
        return (
          <div className="flex-1 min-h-0">
            <CanvasWaveform dataKey={panel.fieldName} history={history} color={panel.color} />
          </div>
        );
    }
  };

  const getWidgetIcon = (type: WidgetType) => {
    switch (type) {
      case 'gauge': return <GaugeIcon size={10} />;
      case 'led': return <Lightbulb size={10} />;
      case '7segment': return <Activity size={10} />;
      case 'chart': return <ChartLine size={10} />;
      default: return <GripHorizontal size={10} />;
    }
  };

  return (
    <div ref={containerRef} className="w-full">
      <div className="flex items-center justify-end px-4 py-1.5 gap-2 border-b border-gray-800/40">
        <span className="text-[9px] font-mono text-gray-600">{panels.length} WIDGET ACTIVE</span>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all border border-gray-800/50"
        >
          <RotateCcw size={10} />
          RESET LAYOUT
        </button>
      </div>

      <ResponsiveGridLayout
        width={containerWidth}
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 12, xs: 8, xxs: 4 }}
        rowHeight={38}
        onLayoutChange={handleLayoutChange}
        margin={[8, 8]}
        containerPadding={[8, 8]}
        {...({ draggableHandle: ".drag-handle" } as any)}
      >
        {panels.map(panel => {
          const currentVal = lastPoint[panel.fieldName] ?? 0;
          return (
            <div
              key={panel.id}
              className="bg-gray-900/80 rounded-lg border border-gray-800/60 overflow-hidden flex flex-col group"
              style={{
                boxShadow: `0 0 16px ${panel.color}0f, 0 2px 12px rgba(0,0,0,0.6)`,
              }}
            >
              <div
                className="drag-handle flex items-center justify-between px-2.5 py-1.5 bg-gray-800/50 border-b border-gray-700/30 cursor-grab active:cursor-grabbing shrink-0 select-none"
              >
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <div className="text-gray-600 group-hover:text-white transition-colors">
                    {getWidgetIcon(panel.widgetType)}
                  </div>
                  <span
                    className="text-[10px] font-mono font-bold uppercase tracking-widest truncate"
                    style={{ color: panel.color, textShadow: `0 0 6px ${panel.color}50` }}
                  >
                    {panel.fieldName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold font-mono tabular-nums opacity-60" style={{ color: panel.color }}>
                    {typeof currentVal === 'number' ? currentVal.toFixed(0) : currentVal}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsOpen(prev => prev === panel.id ? null : panel.id);
                    }}
                    className={`p-0.5 rounded transition-colors ${settingsOpen === panel.id ? 'text-blue-400 bg-blue-900/30' : 'text-gray-500 hover:text-gray-300'}`}
                    title="Ayarlar"
                  >
                    <Settings size={10} />
                  </button>
                  <button
                    onClick={() => onRemovePanel(panel.id)}
                    className="text-gray-600 hover:text-red-400 p-0.5 rounded transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 relative">
                 {settingsOpen === panel.id && (
                   <div className="absolute inset-0 z-[100] bg-gray-950/95 backdrop-blur-md p-3 flex flex-col gap-2.5">
                     <div className="text-[9px] uppercase font-bold text-gray-500 tracking-widest border-b border-gray-800 pb-1 mb-1">
                       WIDGET SETTINGS
                     </div>
                     <div className="flex flex-col gap-1">
                       <label className="text-[8px] text-gray-400 font-mono tracking-widest pl-0.5">TYPE</label>
                       <select 
                         className="bg-gray-900 text-xs text-gray-200 p-1.5 rounded border border-gray-800 font-mono focus:outline-none focus:border-blue-500/50"
                         value={panel.widgetType}
                         onChange={(e) => onUpdatePanel?.(panel.id, { widgetType: e.target.value as WidgetType })}
                       >
                         <option value="chart">Waveform Chart</option>
                         <option value="gauge">Analog Gauge</option>
                         <option value="led">LED Indicator</option>
                         <option value="7segment">7-Segment Display</option>
                       </select>
                     </div>
                     <div className="flex gap-2">
                       <div className="flex-1 flex flex-col gap-1">
                         <label className="text-[8px] text-gray-400 font-mono tracking-widest pl-0.5">MIN VAL</label>
                         <input 
                           type="number"
                           className="bg-gray-900 text-[11px] text-gray-200 p-1.5 rounded border border-gray-800 w-full font-mono focus:outline-none focus:border-blue-500/50"
                           value={panel.config?.min ?? 0}
                           onChange={(e) => onUpdatePanel?.(panel.id, { config: { ...(panel.config || {}), min: Number(e.target.value) } })}
                           step="any"
                         />
                       </div>
                       <div className="flex-1 flex flex-col gap-1">
                         <label className="text-[8px] text-gray-400 font-mono tracking-widest pl-0.5">MAX VAL</label>
                         <input 
                           type="number"
                           className="bg-gray-900 text-[11px] text-gray-200 p-1.5 rounded border border-gray-800 w-full font-mono focus:outline-none focus:border-blue-500/50"
                           value={panel.config?.max ?? 255}
                           onChange={(e) => onUpdatePanel?.(panel.id, { config: { ...(panel.config || {}), max: Number(e.target.value) } })}
                           step="any"
                         />
                       </div>
                     </div>
                     <div className="flex-1"></div>
                     <button
                       onClick={() => setSettingsOpen(null)}
                       className="w-full bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded flex items-center justify-center gap-1.5 text-[9px] font-bold tracking-widest uppercase transition-colors"
                     >
                       <Check size={11} strokeWidth={3} />
                       APPLY
                     </button>
                   </div>
                 )}
                 {renderWidgetContent(panel, currentVal)}
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
