import React, { memo, useState, useCallback, useMemo } from 'react';
import { Settings2, Save, X, GripVertical, Plus } from 'lucide-react';
import type { GeneratedFrame, Field, GridPanel, DashboardWidget } from '../../../../types';
import { useSimulation } from '../../../../hooks/useSimulation';
import DashboardGrid from '../DashboardGrid';

interface TelemetryPanelProps {
  lastFrame: GeneratedFrame | null;
  waveformHistory: Array<Record<string, number>>;
  fields: Field[];
}

const TelemetryPanel = memo(({ lastFrame, waveformHistory, fields }: TelemetryPanelProps) => {
  const { state, updateLayout, removeWidget } = useSimulation();
  const { dashboardLayout } = state;

  // Convert dashboardLayout.widgets to GridPanel format for DashboardGrid
  const panels = useMemo<GridPanel[]>(() => {
    return (dashboardLayout?.widgets || []).map(w => ({
      id: w.id,
      fieldName: w.fieldId,
      fieldType: 'number', // Default or derived
      color: w.config?.color || '#3b82f6',
      widgetType: w.type,
      config: w.config
    }));
  }, [dashboardLayout]);

  const handleRemove = useCallback((id: string) => {
    removeWidget(id);
  }, [removeWidget]);

  const handleLayoutChange = useCallback((layoutItems: any[]) => {
    const updated = (dashboardLayout?.widgets || []).map(w => {
      const l = layoutItems.find(li => li.i === w.id);
      if (l) {
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      }
      return w;
    });
    updateLayout(updated);
  }, [dashboardLayout, updateLayout]);

  if (!lastFrame) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-700 font-mono text-xs uppercase tracking-widest border-2 border-dashed border-gray-900/50 rounded-2xl m-4">
        Veri akışı bekleniyor...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-950/20">
      {/* Control Bar */}
      <div className="shrink-0 px-6 py-2 flex justify-between items-center bg-gray-950/50 border-b border-gray-800/50">
        <div className="flex items-center gap-2">
          <Settings2 size={12} className="text-gray-500" />
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-gray-400">Designer Mode</span>
        </div>
        <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono text-gray-600">PIN FIELDS FROM DISSECTOR TO ADD WIDGETS</span>
            <div className="h-4 w-[1px] bg-gray-800" />
            <span className="text-[9px] font-mono text-emerald-500/60 uppercase tracking-tighter">Auto-Save Active</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {panels.length > 0 ? (
          <DashboardGrid 
            panels={panels} 
            history={waveformHistory} 
            onRemovePanel={handleRemove}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-12 text-center">
             <div className="w-16 h-16 rounded-full bg-gray-900/50 flex items-center justify-center mb-4 border border-gray-800/50">
                <Plus size={24} className="text-gray-700" />
             </div>
             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Dashboard Boş</h3>
             <p className="text-[10px] text-gray-600 font-mono max-w-xs leading-relaxed">
                Henüz bir gösterge eklenmemiş. <br/> 
                <span className="text-blue-500">Packet Dissector</span> panelinden iğne (pin) ikonlarını kullanarak alanları buraya ekleyebilirsiniz.
             </p>
          </div>
        )}
      </div>
    </div>
  );
});

TelemetryPanel.displayName = 'TelemetryPanel';
export default TelemetryPanel;
