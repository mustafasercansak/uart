import { Radio, RefreshCw, Unplug, Waves } from 'lucide-react';
import type { SmartListenResult } from '../../engines/SmartListen';
import { isLocked } from '../../engines/SmartListen';
import { useTranslation } from '../../i18n/context';

interface SmartListenOverlayProps {
  active: boolean;
  result: SmartListenResult;
  onStart: () => void;
  onCancel: () => void;
  onSync: () => void;
}

export function SmartListenOverlay({ active, result, onStart, onCancel, onSync }: SmartListenOverlayProps) {
  const { t } = useTranslation();
  const locked = isLocked(result);
  const baudLabel = result.baudRate ? `${result.baudRate.toLocaleString()} bps` : t('smartListen.waiting');
  const protocolLabel = getProtocolLabel(result.protocol, t);

  if (!active) {
    return (
      <button
        onClick={onStart}
        className="absolute right-4 bottom-4 z-40 flex items-center gap-2 rounded-lg border border-cyan-600/40 bg-cyan-950/60 px-3 py-2 text-[10px] font-mono font-black uppercase tracking-wider text-cyan-300 shadow-2xl backdrop-blur-md hover:bg-cyan-900/70"
      >
        <Radio size={14} />
        {t('smartListen.button')}
      </button>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="w-[min(420px,calc(100%-2rem))] rounded-lg border border-cyan-500/30 bg-gray-950/95 p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              {locked ? <Waves size={16} /> : <RefreshCw size={16} className="animate-spin" />}
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-white">
                {locked ? t('smartListen.locked') : t('smartListen.scanning')}
              </div>
              <div className="text-[10px] font-mono text-gray-500">{t('smartListen.passive')}</div>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-md border border-gray-700 p-1 text-gray-500 hover:text-white">
            <Unplug size={14} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 py-4">
          <Metric label={t('smartListen.protocol')} value={protocolLabel} />
          <Metric label={t('smartListen.baudRate')} value={baudLabel} />
          <Metric label={t('smartListen.confidence')} value={`${Math.round(result.confidence * 100)}%`} />
        </div>

        <div className="rounded-md border border-gray-800 bg-black/30 p-2">
          {result.evidence.slice(0, 3).map((item) => (
            <div key={item} className="text-[10px] font-mono text-gray-400">{item}</div>
          ))}
        </div>

        <button
          onClick={onSync}
          disabled={!locked}
          className="mt-4 w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
        >
          {t('smartListen.syncConnect')}
        </button>
      </div>
    </div>
  );
}

function getProtocolLabel(protocol: SmartListenResult['protocol'], t: (key: string) => string): string {
  switch (protocol) {
    case 'uart':
      return t('smartListen.protocolUart');
    case 'modbus_rtu':
      return t('smartListen.protocolModbusRtu');
    case 'can_standard':
      return t('smartListen.protocolCanStandard');
    case 'can_extended':
      return t('smartListen.protocolCanExtended');
    default:
      return t('smartListen.protocolUnknown');
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-900/70 p-2">
      <div className="text-[9px] font-mono uppercase text-gray-600">{label}</div>
      <div className="mt-1 truncate text-[11px] font-black text-gray-100">{value}</div>
    </div>
  );
}
