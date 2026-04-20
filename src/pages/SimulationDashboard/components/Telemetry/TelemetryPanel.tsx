import React, { memo, useCallback, useMemo, useEffect } from 'react';
import { Settings2, Save, X, GripVertical, Plus, LayoutDashboard, Wand2, Activity } from 'lucide-react';
import type { GeneratedFrame, Field, GridPanel, FrameProfile } from '../../../../types';
import { useSimulation } from '../../../../hooks/useSimulation';
import { SENSOR_TEMPLATES } from '../../../../data/templates';
import DashboardGrid from '../DashboardGrid';
import { useTranslation } from '../../../../i18n/LanguageContext';

interface TelemetryPanelProps {
  lastFrame: GeneratedFrame | null;
  waveformHistory: Array<Record<string, number>>;
  fields: Field[];
  profiles: FrameProfile[];
}

const TelemetryPanel = memo(({ lastFrame, waveformHistory, fields, profiles }: TelemetryPanelProps) => {
  const { t } = useTranslation();
  const { state, updateLayout, removeWidget } = useSimulation();
  const { dashboardLayout, profileId } = state;
  const currentProfile = useMemo(() => profiles?.find((p: FrameProfile) => p.id === profileId), [profiles, profileId]);

  const matchingTemplate = useMemo(() => {
    if (!currentProfile) return null;
    
    // 1. Doğrudan isim eşleşmesi
    const directMatch = SENSOR_TEMPLATES.find(t => t.name.toLowerCase() === currentProfile.name.toLowerCase());
    if (directMatch) return directMatch;
    
    // 2. Kısmi isim eşleşmesi (Fuzzy)
    const fuzzyMatch = SENSOR_TEMPLATES.find(t => 
      currentProfile.name.toLowerCase().includes(t.name.toLowerCase()) || 
      t.name.toLowerCase().includes(currentProfile.name.toLowerCase()) ||
      (currentProfile.name.includes('Monitor') && t.name.includes('Monitor'))
    );
    if (fuzzyMatch) return fuzzyMatch;
    
    // 3. Alan bazlı eşleşme (BPM, SpO2 gibi kritik alanlar)
    const profileFieldNames = fields.map(f => f.name.toLowerCase());
    const fieldMatch = SENSOR_TEMPLATES.find(t => {
      const templateFieldNames = t.profile.fields.map(f => f.name.toLowerCase());
      const commonFields = profileFieldNames.filter(name => templateFieldNames.includes(name));
      // En az 2 ortak alan varsa veya alan sayısı tutuyorsa
      return commonFields.length >= 2 || (t.profile.fields.length === fields.length && fields.length > 0);
    });
    
    return fieldMatch || null;
  }, [currentProfile, fields]);

  // Convert dashboardLayout.widgets to GridPanel format for DashboardGrid
  const panels = useMemo<GridPanel[]>(() => {
    return (dashboardLayout?.widgets || []).map(w => {
      // Find the actual field to get the correct casing/metadata if needed
      const field = fields.find(f => f.name.toLowerCase() === w.fieldId.toLowerCase());
      return {
        id: w.id,
        fieldName: field?.name || w.fieldId,
        fieldType: 'number',
        color: w.config?.color || '#3b82f6',
        widgetType: w.type,
        config: w.config
      };
    });
  }, [dashboardLayout, fields]);

  const handleApplyTemplate = useCallback(() => {
    if (matchingTemplate?.defaultLayout) {
      updateLayout(matchingTemplate.defaultLayout.widgets);
    }
  }, [matchingTemplate, updateLayout]);

  const handleRemove = useCallback((id: string) => {
    removeWidget(id);
  }, [removeWidget]);

  const handleUpdatePanel = useCallback((id: string, updates: Partial<GridPanel>) => {
    const updated = (dashboardLayout?.widgets || []).map(w => {
      if (w.id === id) {
        return {
          ...w,
          type: updates.widgetType || w.type,
          config: { ...(w.config || {}), ...(updates.config || {}) }
        };
      }
      return w;
    });
    updateLayout(updated);
  }, [dashboardLayout, updateLayout]);
  
  // Dashboard boşsa ve eşleşen şablon varsa otomatik uygula
  useEffect(() => {
    if (panels.length === 0 && matchingTemplate?.defaultLayout && lastFrame) {
      handleApplyTemplate();
    }
  }, [panels.length, matchingTemplate, lastFrame, handleApplyTemplate]);

  if (!lastFrame) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 m-4 border-2 border-dashed border-gray-900/50 rounded-2xl bg-gray-950/20">
        <Activity size={32} className="text-gray-800 mb-4 animate-pulse" />
        <div className="text-gray-700 font-mono text-xs uppercase tracking-widest text-center">
            {t('telemetryPanel.waitingData')} <br/>
            <span className="text-[10px] text-gray-800 mt-2 block opacity-50">{t('telemetryPanel.startSimulation')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-950/20">
      {/* Control Bar */}
      <div className="shrink-0 px-6 py-2 flex justify-between items-center bg-gray-950/50 border-b border-gray-800/50">
        <div className="flex items-center gap-2">
          <Settings2 size={12} className="text-gray-500" />
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-gray-400">{t('telemetryPanel.designerMode')}</span>
        </div>
        <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono text-gray-600">PIN FIELDS FROM SIDEBAR OR DISSECTOR</span>
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
            onUpdatePanel={handleUpdatePanel}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-12 text-center">
             <div className="w-16 h-16 rounded-full bg-gray-900/50 flex items-center justify-center mb-6 border border-gray-800/50 shadow-2xl relative group">
                <LayoutDashboard size={24} className="text-gray-700 group-hover:text-blue-500 transition-colors" />
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center border-2 border-gray-950">
                    <Plus size={10} className="text-white" />
                </div>
             </div>
             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 font-mono">{t('telemetryPanel.dashboardReady')}</h3>
             <p className="text-[10px] text-gray-600 font-mono max-w-xs leading-relaxed mb-8">
                {t('telemetryPanel.noWidgets')} <br/>
                {t('telemetryPanel.pinFromSidebar')}
             </p>

             {matchingTemplate?.defaultLayout && (
                <button
                    onClick={handleApplyTemplate}
                    className="flex items-center gap-3 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-900/20 group"
                >
                    <Wand2 size={16} className="group-hover:rotate-12 transition-transform" />
                    <div className="flex flex-col items-start">
                        <span className="text-[11px] font-bold uppercase tracking-wider">{t('telemetryPanel.applyTemplate')}</span>
                        <span className="text-[8px] opacity-70 font-mono italic">{t('telemetryPanel.loadWidgets').replace('{name}', matchingTemplate.name)}</span>
                    </div>
                </button>
             )}
          </div>
        )}
      </div>
    </div>
  );
});

TelemetryPanel.displayName = 'TelemetryPanel';
export default TelemetryPanel;
