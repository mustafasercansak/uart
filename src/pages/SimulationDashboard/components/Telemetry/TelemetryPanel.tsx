import React, { memo } from 'react';
import type { GeneratedFrame, Field } from '../../../../types';
import Gauge from './Gauge';
import Sparkline from './Sparkline';

interface TelemetryPanelProps {
  lastFrame: GeneratedFrame | null;
  waveformHistory: Array<Record<string, number>>;
  fields: Field[];
}

const TelemetryPanel = memo(({ lastFrame, waveformHistory, fields }: TelemetryPanelProps) => {
  if (!lastFrame) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-700 font-mono text-xs uppercase tracking-widest border-2 border-dashed border-gray-900/50 rounded-2xl m-4">
        Veri akışı bekleniyor...
      </div>
    );
  }

  // Helper to get smart defaults if widgetConfig is missing
  const getSmartConfig = (field: Field) => {
    if (field.widgetConfig) return field.widgetConfig;
    
    const name = field.name.toLocaleLowerCase('tr-TR');
    
    // Waveform detection
    if (field.type === 'waveform' || name.includes('pleth') || name.includes('ecg') || name.includes('ppg') || name.includes('dalga')) {
      return { type: 'sparkline' as const, color: '#10b981' };
    }
    
    // Crucial medical stats (Gauge)
    if (name.includes('nabız') || name.includes('nabiz') || name.includes('bpm') || name.includes('spo2') || name.includes('sat') || name.includes('temp') || name.includes('sıcaklık') || name.includes('rpm')) {
      return { type: 'gauge' as const, min: 0, max: 200, color: '#f87171' };
    }
    
    // Others (Bar)
    if (field.type === 'range' || name.includes('bar')) {
       return { type: 'bar' as const, min: 0, max: 255, color: '#3b82f6' };
    }
    
    return null;
  };

  // Filter fields that have widget configurations or smart matches
  const widgetFields = fields
    .map(f => ({ field: f, config: getSmartConfig(f) }))
    .filter(item => item.config !== null);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {widgetFields.map(({ field, config }) => {
          const parsed = lastFrame.fields.find(f => f.name === field.name);
          const value = parsed?.decimal ?? 0;
          
          // Get history for sparkline
          const history = waveformHistory.map(h => h[field.name] ?? 0).slice(-40);

          switch (config!.type) {
            case 'gauge':
              return (
                <Gauge
                  key={field.id}
                  label={field.name}
                  value={value}
                  min={config!.min ?? 0}
                  max={config!.max ?? 100}
                  unit={config!.unit}
                  color={config!.color}
                />
              );
            case 'sparkline':
              return (
                <Sparkline
                  key={field.id}
                  label={field.name}
                  data={history}
                  color={config!.color}
                />
              );
            case 'bar':
              const percentage = ((value - (config!.min ?? 0)) / ((config!.max ?? 100) - (config!.min ?? 0))) * 100;
              return (
                <div key={field.id} className="flex flex-col p-4 rounded-xl bg-gray-900/40 border border-gray-800/50 backdrop-blur-sm group hover:border-gray-700/50 transition-all">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[9px] font-mono font-black uppercase tracking-widest text-gray-500 group-hover:text-gray-300 transition-colors">
                        {field.name}
                    </span>
                    <span className="text-xs font-mono font-bold text-gray-200">{value}</span>
                  </div>
                  <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-500" 
                      style={{ 
                        width: `${Math.min(100, Math.max(0, percentage))}%`, 
                        backgroundColor: config!.color || '#3b82f6',
                        boxShadow: `0 0 10px ${config!.color || '#3b82f6'}88`
                      }} 
                    />
                  </div>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
      
      {widgetFields.length === 0 && (
        <div className="text-center py-20 text-gray-600 font-mono text-[10px] uppercase tracking-widest">
           Bu profil için görsel gösterge tanımlanmamış.
        </div>
      )}
    </div>
  );
});

TelemetryPanel.displayName = 'TelemetryPanel';
export default TelemetryPanel;
