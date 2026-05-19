import { useMemo } from 'react';
import { useTranslation } from '../../../../i18n/context';
import type { CANArbitrationEvent } from '../../../../can/types/CANFrame';
import type { CANNode } from '../../../../can/types/CANNode';

interface ArbitrationTabProps {
  events: CANArbitrationEvent[];
  nodes: CANNode[];
}

export function ArbitrationTab({ events, nodes }: ArbitrationTabProps) {
  const { t } = useTranslation();
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  if (events.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-xs">{t('can.noArbitrationEvents')}</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto font-mono text-[11px]">
      <div className="sticky top-0 bg-gray-950/90 backdrop-blur-sm grid grid-cols-[80px_1fr_1fr_1fr] gap-2 px-3 py-1.5 text-gray-600 text-[10px] border-b border-gray-800 uppercase tracking-widest">
        <span>{t('common.time')}</span>
        <span>{t('can.winner')}</span>
        <span>{t('can.loser')}</span>
        <span>{t('can.iDs')}</span>
      </div>
      {[...events].reverse().map((ev, i) => {
        const winner = nodeMap.get(ev.winnerId);
        const loser  = nodeMap.get(ev.loserId);
        return (
          <div key={i} className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 px-3 py-1.5 border-b border-gray-900/60 hover:bg-white/[0.02]">
            <span className="text-gray-600 tabular-nums">{new Date(ev.timestamp).toISOString().slice(11, 23)}</span>
            <span style={{ color: winner?.color ?? '#22d3ee' }}>{winner?.name ?? `N${ev.winnerId}`}</span>
            <span className="text-gray-500">{loser?.name ?? `N${ev.loserId}`}</span>
            <span className="text-gray-600 tabular-nums">
              W:0x{ev.winnerArbitrationId.toString(16).toUpperCase().padStart(3,'0')} &gt; L:0x{ev.loserArbitrationId.toString(16).toUpperCase().padStart(3,'0')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
