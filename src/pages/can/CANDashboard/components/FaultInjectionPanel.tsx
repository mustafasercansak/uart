import { useState } from 'react';
import { Zap, RotateCcw, AlertTriangle, Wifi } from 'lucide-react';
import type { CANNode, CANFaultType } from '../../../../can/types/CANNode';
import { FAULT_LABELS, FAULT_SEVERITY } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';

interface FaultInjectionPanelProps {
  nodes: CANNode[];
  onInject: (nodeId: number, fault: CANFaultType) => void;
  onRecover: (nodeId: number) => void;
  onSelectNode: (nodeId: number | null) => void;
  selectedNodeId: number | null;
}

const CLINICAL_FAULTS: CANFaultType[] = [
  'cardiac-arrest', 'bradycardia', 'tachycardia',
  'hypoxia', 'hypotension', 'hypertension',
  'fever', 'hypothermia',
];

const NETWORK_FAULTS: CANFaultType[] = ['bus-off', 'freeze', 'noise-burst'];

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-700/60 text-red-400 hover:bg-red-950/40 bg-red-950/20',
  warning:  'border-yellow-700/60 text-yellow-400 hover:bg-yellow-950/40 bg-yellow-950/20',
  network:  'border-purple-700/60 text-purple-400 hover:bg-purple-950/40 bg-purple-950/20',
};

const ACTIVE_STYLE: Record<string, string> = {
  critical: 'border-red-500 bg-red-900/40 text-red-300 animate-pulse',
  warning:  'border-yellow-500 bg-yellow-900/40 text-yellow-300 animate-pulse',
  network:  'border-purple-500 bg-purple-900/40 text-purple-300 animate-pulse',
};

export function FaultInjectionPanel({
  nodes, onInject, onRecover, onSelectNode, selectedNodeId,
}: FaultInjectionPanelProps) {
  const { t } = useTranslation();
  const [pendingFault, setPendingFault] = useState<CANFaultType | null>(null);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;

  const handleFaultClick = (fault: CANFaultType) => {
    if (!selectedNode) return;
    if (pendingFault === fault) {
      // Second click confirms
      onInject(selectedNode.id, fault);
      setPendingFault(null);
    } else {
      setPendingFault(fault);
    }
  };

  const handleRecover = () => {
    if (!selectedNode) return;
    onRecover(selectedNode.id);
    setPendingFault(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Node selector */}
      <div className="p-3 border-b border-gray-800/60">
        <div className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-2">
          {t('can.faultTargetNode')}
        </div>
        <div className="space-y-1">
          {nodes.length === 0 && (
            <div className="text-xs font-mono text-gray-600 text-center py-2">{t('can.noNodes')}</div>
          )}
          {nodes.map(node => (
            <button
              key={node.id}
              onClick={() => { onSelectNode(node.id === selectedNodeId ? null : node.id); setPendingFault(null); }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                node.id === selectedNodeId
                  ? 'border-cyan-600 bg-cyan-950/30 text-cyan-300'
                  : 'border-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
              <span className="flex-1 text-left truncate">{node.name}</span>
              <span className="text-[9px] text-gray-600">#{node.id}</span>
              {node.activeFault && (
                <span className="text-[8px] text-red-400 bg-red-900/30 border border-red-800 px-1 rounded">
                  {t(FAULT_LABELS[node.activeFault])}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Fault buttons — only shown when a node is selected */}
      {selectedNode ? (
        <div className="flex-1 p-3 space-y-4">
          {/* Confirm banner */}
          {pendingFault && (
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-950/30 border border-orange-700/60 rounded-lg text-xs font-mono text-orange-400">
              <AlertTriangle size={12} />
              {t('can.faultConfirm', { fault: t(FAULT_LABELS[pendingFault]) })}
            </div>
          )}

          {/* Clinical faults */}
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-2">
              <Zap size={9} />
              {t('can.clinicalFaults')}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {CLINICAL_FAULTS.map(fault => {
                const sev = FAULT_SEVERITY[fault];
                const isActive = selectedNode.activeFault === fault;
                const isPending = pendingFault === fault;
                return (
                  <button
                    key={fault}
                    onClick={() => handleFaultClick(fault)}
                    className={`px-2 py-1.5 rounded-lg border text-[10px] font-mono transition-all ${
                      isActive ? ACTIVE_STYLE[sev] : isPending ? 'border-orange-500 bg-orange-900/30 text-orange-300' : SEVERITY_STYLE[sev]
                    }`}
                  >
                    {isPending ? `⚡ ${t('can.confirm')}` : t(FAULT_LABELS[fault])}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Network faults */}
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-2">
              <Wifi size={9} />
              {t('can.networkFaults')}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {NETWORK_FAULTS.map(fault => {
                const sev = FAULT_SEVERITY[fault];
                const isActive = selectedNode.activeFault === fault;
                const isPending = pendingFault === fault;
                return (
                  <button
                    key={fault}
                    onClick={() => handleFaultClick(fault)}
                    className={`px-2 py-1.5 rounded-lg border text-[10px] font-mono transition-all ${
                      isActive ? ACTIVE_STYLE[sev] : isPending ? 'border-orange-500 bg-orange-900/30 text-orange-300' : SEVERITY_STYLE[sev]
                    }`}
                  >
                    {isPending ? `⚡ ${t('can.confirm')}` : t(FAULT_LABELS[fault])}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recovery */}
          {(selectedNode.activeFault || selectedNode.state === 'bus-off' || !selectedNode.isActive) && (
            <button
              onClick={handleRecover}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-green-700/60 text-green-400 hover:bg-green-950/30 text-xs font-mono transition-colors"
            >
              <RotateCcw size={11} />
              {t('can.recoverNode')}
            </button>
          )}

          <p className="text-[9px] font-mono text-gray-700 text-center leading-relaxed">
            {t('can.faultClickTwice')}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-gray-600 font-mono text-xs">
          {t('can.selectNodeForFault')}
        </div>
      )}
    </div>
  );
}
