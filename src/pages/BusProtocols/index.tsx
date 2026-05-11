import { useState } from 'react';
import { Network, Radio, Cable } from 'lucide-react';
import { useTranslation } from '../../i18n/context';
import ModbusPanel from '../SimulationDashboard/components/ModbusPanel';
import CANBusPanel from '../SimulationDashboard/components/CANBusPanel';
import LINBusPanel from './components/LINBusPanel';

type BusTab = 'modbus' | 'canbus' | 'linbus';

const TABS: Array<{ id: BusTab; icon: typeof Network; labelKey: string; color: string; shadow: string }> = [
  { id: 'modbus', icon: Network, labelKey: 'dashboard.modbus',  color: 'bg-amber-600',  shadow: 'shadow-amber-900/40'  },
  { id: 'canbus', icon: Radio,   labelKey: 'dashboard.canbus',  color: 'bg-blue-600',   shadow: 'shadow-blue-900/40'   },
  { id: 'linbus', icon: Cable,   labelKey: 'dashboard.linbus',  color: 'bg-emerald-600',shadow: 'shadow-emerald-900/40'},
];

export default function BusProtocols() {
  const { t } = useTranslation();
  const [active, setActive] = useState<BusTab>('modbus');

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-200 font-sans overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-800/60 bg-gray-950/80">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-amber-400 via-blue-500 to-emerald-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-gray-200">
            {t('nav.protocols')}
          </span>
        </div>
        <div className="h-4 w-px bg-gray-800" />
        <div className="flex items-center gap-1 glass-panel p-0.5 rounded-xl">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-3 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap ${
                active === tab.id
                  ? `${tab.color} text-white shadow-lg ${tab.shadow}`
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <tab.icon size={12} className={active === tab.id ? 'animate-pulse' : ''} />
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {active === 'modbus' && <ModbusPanel />}
        {active === 'canbus'  && <CANBusPanel />}
        {active === 'linbus'  && <LINBusPanel />}
      </div>
    </div>
  );
}
