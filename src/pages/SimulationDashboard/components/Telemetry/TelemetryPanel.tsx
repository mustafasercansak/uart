import React, { memo, useState, useCallback, useMemo } from 'react';
import { Settings2, Save, X, GripVertical } from 'lucide-react';
import type { GeneratedFrame, Field } from '../../../../types';
import { useSimulation } from '../../../../hooks/useSimulation';
import Gauge from './Gauge';
import Sparkline from './Sparkline';

interface TelemetryPanelProps {
  lastFrame: GeneratedFrame | null;
  waveformHistory: Array<Record<string, number>>;
  fields: Field[];
}

const TelemetryPanel = memo(({ lastFrame, waveformHistory, fields }: TelemetryPanelProps) => {
  const { state, setTelemetryLayout } = useSimulation();
  const { telemetryLayouts, profileId } = state;
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  // Helper to get smart defaults
  const getSmartConfig = useCallback((field: Field) => {
    if (field.widgetConfig) return field.widgetConfig;
    const name = field.name.toLocaleLowerCase('tr-TR');
    if (field.type === 'waveform' || name.includes('pleth') || name.includes('ecg') || name.includes('ppg') || name.includes('dalga')) {
      return { type: 'sparkline' as const, color: '#10b981' };
    }
    if (name.includes('nabız') || name.includes('nabiz') || name.includes('bpm') || name.includes('spo2') || name.includes('sat') || name.includes('temp') || name.includes('sıcaklık') || name.includes('rpm')) {
      return { type: 'gauge' as const, min: 0, max: 200, color: '#f87171' };
    }
    if (field.type === 'range' || name.includes('bar')) {
       return { type: 'bar' as const, min: 0, max: 255, color: '#3b82f6' };
    }
    return null;
  }, []);

  // Filter and Sort fields
  const widgetFields = useMemo(() => {
    const rawFields = fields
      .map(f => ({ field: f, config: getSmartConfig(f) }))
      .filter(item => item.config !== null);

    const layout = profileId ? telemetryLayouts[profileId] : null;
    if (!layout) return rawFields;

    // Sort based on saved layout
    return [...rawFields].sort((a, b) => {
      const idxA = layout.indexOf(a.field.name);
      const idxB = layout.indexOf(b.field.name);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [fields, getSmartConfig, telemetryLayouts, profileId]);

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;

    const newLayoutList = widgetFields.map(w => w.field.name);
    const itemToMove = newLayoutList.splice(draggedItemIndex, 1)[0];
    newLayoutList.splice(index, 0, itemToMove);
    
    if (profileId) {
       setTelemetryLayout(profileId, newLayoutList);
       setDraggedItemIndex(index);
    }
  };

  if (!lastFrame) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-700 font-mono text-xs uppercase tracking-widest border-2 border-dashed border-gray-900/50 rounded-2xl m-4">
        Veri akışı bekleniyor...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Control Bar */}
      <div className="shrink-0 px-6 py-2 flex justify-between items-center bg-gray-950/50 border-b border-gray-800/50">
        <div className="flex items-center gap-2">
          <Settings2 size={12} className="text-gray-500" />
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-gray-400">Panel Ayarları</span>
        </div>
        <button 
          onClick={() => setIsEditMode(!isEditMode)}
          className={`px-3 py-1 rounded-lg text-[9px] font-mono font-black uppercase transition-all flex items-center gap-2 ${
            isEditMode ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          {isEditMode ? <><Save size={12} /> Yerleşimi Kaydet</> : <><Settings2 size={12} /> Düzenle</>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {widgetFields.map(({ field, config }, index) => {
            const parsed = lastFrame.fields.find(f => f.name === field.name);
            const value = parsed?.decimal ?? 0;
            const history = waveformHistory.map(h => h[field.name] ?? 0).slice(-40);

            return (
              <div 
                key={field.id}
                draggable={isEditMode}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                className={`relative group transition-all duration-300 ${isEditMode ? 'cursor-grab active:cursor-grabbing scale-[0.98]' : ''}`}
              >
                {isEditMode && (
                  <div className="absolute inset-0 z-10 bg-emerald-500/5 border-2 border-dashed border-emerald-500/20 rounded-xl pointer-events-none animate-pulse-slow" />
                )}
                
                {isEditMode && (
                   <div className="absolute top-2 left-2 z-20 text-emerald-500 opacity-60 group-hover:opacity-100 transition-opacity">
                      <GripVertical size={16} />
                   </div>
                )}

                {config!.type === 'gauge' && (
                  <Gauge label={field.name} value={value} min={config!.min ?? 0} max={config!.max ?? 100} unit={config!.unit} color={config!.color} />
                )}
                
                {config!.type === 'sparkline' && (
                  <Sparkline label={field.name} data={history} color={config!.color} />
                )}
                
                {config!.type === 'bar' && (
                  <div className="flex flex-col p-4 rounded-xl bg-gray-900/40 border border-gray-800/50 backdrop-blur-sm group hover:border-gray-700/50 transition-all">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[9px] font-mono font-black uppercase tracking-widest text-gray-500 group-hover:text-gray-300 transition-colors">{field.name}</span>
                      <span className="text-xs font-mono font-bold text-gray-200">{value}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all duration-500" 
                        style={{ 
                          width: `${Math.min(100, Math.max(0, ((value - (config!.min ?? 0)) / ((config!.max ?? 100) - (config!.min ?? 0))) * 100))}%`, 
                          backgroundColor: config!.color || '#3b82f6',
                          boxShadow: `0 0 10px ${config!.color || '#3b82f6'}88`
                        }} 
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {widgetFields.length === 0 && (
          <div className="text-center py-20 text-gray-600 font-mono text-[10px] uppercase tracking-widest">
             Bu profil için görsel gösterge tanımlanmamış.
          </div>
        )}
      </div>
    </div>
  );
});

TelemetryPanel.displayName = 'TelemetryPanel';
export default TelemetryPanel;
