import React, { useMemo } from 'react';
import { Cpu, Zap, Activity } from 'lucide-react';
import { useTranslation } from '../../../i18n/context';
import type { GeneratedFrame } from '../../../types';

interface HardwareLayoutProps {
  lastTxFrame: GeneratedFrame | null;
  lastRxFrame: GeneratedFrame | null;
  protocol: string;
}

const HardwareLayout: React.FC<HardwareLayoutProps> = ({ lastTxFrame, lastRxFrame, protocol }) => {
  const { t } = useTranslation();
  const [isTxActive, setIsTxActive] = React.useState(false);
  const [isRxActive, setIsRxActive] = React.useState(false);

  React.useEffect(() => {
    if (!lastTxFrame) return;
    const pulse = setTimeout(() => setIsTxActive(true), 0);
    const cleanup = setTimeout(() => setIsTxActive(false), 500);
    return () => {
      clearTimeout(pulse);
      clearTimeout(cleanup);
    };
  }, [lastTxFrame]);

  React.useEffect(() => {
    if (!lastRxFrame) return;
    const pulse = setTimeout(() => setIsRxActive(true), 0);
    const cleanup = setTimeout(() => setIsRxActive(false), 500);
    return () => {
      clearTimeout(pulse);
      clearTimeout(cleanup);
    };
  }, [lastRxFrame]);

  const pins = useMemo(() => [
    { id: 1, label: '3V3', type: 'power', color: 'bg-red-500' },
    { id: 2, label: 'GND', type: 'power', color: 'bg-gray-600' },
    { id: 3, label: 'TX', type: 'uart', active: isTxActive, color: 'bg-emerald-500' },
    { id: 4, label: 'RX', type: 'uart', active: isRxActive, color: 'bg-blue-500' },
    { id: 5, label: 'SCL', type: 'i2c', active: protocol === 'I2C' && (isTxActive || isRxActive), color: 'bg-yellow-500' },
    { id: 6, label: 'SDA', type: 'i2c', active: protocol === 'I2C' && (isTxActive || isRxActive), color: 'bg-blue-400' },
    { id: 7, label: 'SCK', type: 'spi', active: protocol === 'SPI' && (isTxActive || isRxActive), color: 'bg-yellow-400' },
    { id: 8, label: 'MISO', type: 'spi', active: protocol === 'SPI' && isRxActive, color: 'bg-green-400' },
    { id: 9, label: 'MOSI', type: 'spi', active: protocol === 'SPI' && isTxActive, color: 'bg-blue-600' },
    { id: 10, label: 'CS', type: 'spi', active: protocol === 'SPI' && (isTxActive || isRxActive), color: 'bg-purple-500' },
  ], [isTxActive, isRxActive, protocol]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-900/40 rounded-2xl border border-gray-800/30 overflow-hidden relative">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <div className="relative flex flex-col items-center gap-12">
        {/* MCU Package */}
        <div className="relative w-64 h-64 bg-gray-800 rounded-xl border-4 border-gray-700 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center group">
          <div className="absolute inset-2 border border-gray-700/50 rounded-lg" />

          <div className="flex flex-col items-center gap-2 z-10">
            <Cpu size={48} className="text-gray-600 group-hover:text-blue-500 transition-colors duration-500" />
            <span className="text-[10px] font-mono font-black text-gray-500 tracking-[0.3em]">UART-X1</span>
          </div>

          {/* Activity Glow */}
          {(isTxActive || isRxActive) && (
            <div className={`absolute inset-0 rounded-lg animate-pulse opacity-20 ${isTxActive ? 'bg-emerald-500' : 'bg-blue-500'}`} />
          )}

          {/* PINS Left */}
          <div className="absolute -left-10 top-0 bottom-0 flex flex-col justify-around py-4">
            {pins.slice(0, 5).map(pin => (
              <div key={pin.id} className="flex items-center gap-2 group/pin">
                <span className={`text-[8px] font-mono font-black ${pin.active ? 'text-white' : 'text-gray-600'} transition-colors`}>{pin.label}</span>
                <div className={`w-8 h-2 rounded-r-sm transition-all duration-150 ${pin.active ? `${pin.color} shadow-[0_0_10px_currentColor]` : 'bg-gray-700'}`} />
              </div>
            ))}
          </div>

          {/* PINS Right */}
          <div className="absolute -right-10 top-0 bottom-0 flex flex-col justify-around py-4">
            {pins.slice(5).map(pin => (
              <div key={pin.id} className="flex items-center gap-2 group/pin justify-end">
                <div className={`w-8 h-2 rounded-l-sm transition-all duration-150 ${pin.active ? `${pin.color} shadow-[0_0_10px_currentColor]` : 'bg-gray-700'}`} />
                <span className={`text-[8px] font-mono font-black ${pin.active ? 'text-white' : 'text-gray-600'} transition-colors text-right`}>{pin.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Signal Propagation UI */}
        <div className="flex items-center gap-12">
          <div className={`flex flex-col items-center gap-2 transition-opacity ${isTxActive ? 'opacity-100' : 'opacity-20'}`}>
            <Zap size={20} className="text-emerald-500" />
            <span className="text-[9px] font-mono text-emerald-500 font-bold uppercase">{t('hardware.txActive')}</span>
          </div>
          <div className={`flex flex-col items-center gap-2 transition-opacity ${isRxActive ? 'opacity-100' : 'opacity-20'}`}>
            <Activity size={20} className="text-blue-500" />
            <span className="text-[9px] font-mono text-blue-500 font-bold uppercase">{t('hardware.rxActive')}</span>
          </div>
        </div>
      </div>

      {/* Lab Legend */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1">
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-red-500" /> <span className="text-[8px] text-gray-500 uppercase font-mono">{t('hardware.power')}</span></div>
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-emerald-500" /> <span className="text-[8px] text-gray-500 uppercase font-mono">{t('hardware.uartBus')}</span></div>
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-yellow-500" /> <span className="text-[8px] text-gray-500 uppercase font-mono">{t('hardware.i2cBus')}</span></div>
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-purple-500" /> <span className="text-[8px] text-gray-500 uppercase font-mono">{t('hardware.spiBus')}</span></div>
      </div>
    </div>
  );
};

export default HardwareLayout;
