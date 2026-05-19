import { useTranslation } from '../../../../i18n/context';
import { NodeCard } from './NodeCard';
import type { CANBusState } from '../../../../can/types/CANBusState';
import type { CANNode } from '../../../../can/types/CANNode';

interface NodesTabProps {
  state: CANBusState;
  updateNode: (id: number, patch: Partial<CANNode>) => void;
  removeNode: (id: number) => void;
  selectNode: (id: number | null) => void;
  onEdit: (node: CANNode) => void;
}

export function NodesTab({ state, updateNode, removeNode, selectNode, onEdit }: NodesTabProps) {
  const { t } = useTranslation();
  if (state.nodes.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-xs">{t('can.noNodes')}</div>;
  }
  return (
    <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 xl:grid-cols-3 gap-3 content-start">
      {state.nodes.map(node => (
        <NodeCard
          key={node.id}
          node={node}
          isSelected={state.selectedNodeId === node.id}
          onSelect={() => selectNode(node.id === state.selectedNodeId ? null : node.id)}
          onToggle={() => updateNode(node.id, { isActive: !node.isActive })}
          onRemove={() => removeNode(node.id)}
          onEdit={() => onEdit(node)}
        />
      ))}
    </div>
  );
}
