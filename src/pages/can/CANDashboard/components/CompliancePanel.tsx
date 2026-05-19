import { useMemo } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react';
import type { CANBusState, CANFaultEvent } from '../../../../can/types/CANBusState';
import { FAULT_LABELS, FAULT_SEVERITY } from '../../../../can/types/CANNode';
import { useTranslation } from '../../../../i18n/context';

interface CompliancePanelProps {
  state: CANBusState;
}

type MetricStatus = 'pass' | 'warn' | 'fail';

interface ComplianceMetric {
  id: string;
  label: string;
  standard: string;
  value: number;
  displayValue: string;
  threshold: string;
  status: MetricStatus;
  description: string;
}

function computeMetrics(state: CANBusState, t: (key: string, params?: Record<string, unknown>) => string): ComplianceMetric[] {
  const totalNodes   = state.nodes.length;
  const busOffNodes  = state.nodes.filter(n => n.state === 'bus-off').length;
  const activeNodes  = state.nodes.filter(n => n.isActive && n.state !== 'bus-off').length;
  const faultNodes   = state.nodes.filter(n => n.activeFault !== null).length;
  const alarmNodes   = state.nodes.filter(n => n.vitals.alarmFlags !== 0).length;
  const nodeAvail    = totalNodes > 0 ? ((totalNodes - busOffNodes) / totalNodes) * 100 : 100;
  const errorRate    = state.frameCount > 0 ? (state.errorCount / state.frameCount) * 100 : 0;

  const busLoadStatus: MetricStatus =
    state.busLoadPercent > 50 ? 'fail' :
    state.busLoadPercent > 30 ? 'warn' : 'pass';

  const errorRateStatus: MetricStatus =
    errorRate > 1 ? 'fail' : errorRate > 0.1 ? 'warn' : 'pass';

  const nodeAvailStatus: MetricStatus =
    nodeAvail < 80 ? 'fail' : nodeAvail < 95 ? 'warn' : 'pass';

  const busOffStatus: MetricStatus =
    busOffNodes > 1 ? 'fail' : busOffNodes > 0 ? 'warn' : 'pass';

  const alarmStatus: MetricStatus =
    alarmNodes > 2 ? 'fail' : alarmNodes > 0 ? 'warn' : 'pass';

  const faultStatus: MetricStatus =
    faultNodes > 1 ? 'fail' : faultNodes > 0 ? 'warn' : 'pass';

  return [
    {
      id: 'bus-load',
      label: t('can.busLoad'),
      standard: t('can.iEC6060118'),
      value: state.busLoadPercent,
      displayValue: `${state.busLoadPercent.toFixed(1)}%`,
      threshold: '< 30%',
      status: busLoadStatus,
      description: t('can.medicalCANBuses'),
    },
    {
      id: 'error-rate',
      label: t('can.errorFrameRate'),
      standard: t('can.iSO118981'),
      value: errorRate,
      displayValue: `${errorRate.toFixed(3)}%`,
      threshold: '< 0.1%',
      status: errorRateStatus,
      description: t('can.sustainedErrorR'),
    },
    {
      id: 'node-availability',
      label: t('can.nodeAvailabilit'),
      standard: t('can.iEC60601114'),
      value: nodeAvail,
      displayValue: `${nodeAvail.toFixed(0)}%`,
      threshold: '≥ 95%',
      status: nodeAvailStatus,
      description: t('can.percentageOfCon'),
    },
    {
      id: 'bus-off-count',
      label: t('can.busOffNodes'),
      standard: t('can.iSO118981612'),
      value: busOffNodes,
      displayValue: `${busOffNodes} / ${totalNodes}`,
      threshold: '= 0',
      status: busOffStatus,
      description: t('can.nodesInBusOffSt'),
    },
    {
      id: 'active-alarms',
      label: t('can.activeAlarms'),
      standard: t('can.iEC6060118'),
      value: alarmNodes,
      displayValue: alarmNodes.toString(),
      threshold: '= 0',
      status: alarmStatus,
      description: t('can.iEC6060118Requi'),
    },
    {
      id: 'active-faults',
      label: t('can.injectedFaults'),
      standard: t('can.simulation'),
      value: faultNodes,
      displayValue: `${faultNodes} node${faultNodes !== 1 ? 's' : ''}`,
      threshold: '= 0',
      status: faultStatus,
      description: t('can.nodesCurrentlyU'),
    },
    {
      id: 'active-nodes',
      label: t('can.activeNodes'),
      standard: t('can.cANopenCiA301'),
      value: activeNodes,
      displayValue: `${activeNodes} / ${totalNodes}`,
      threshold: `= ${totalNodes}`,
      status: activeNodes === totalNodes ? 'pass' : activeNodes >= totalNodes * 0.8 ? 'warn' : 'fail',
      description: t('can.allConfiguredNo'),
    },
  ];
}

const STATUS_ICON = {
  pass: ShieldCheck,
  warn: ShieldAlert,
  fail: ShieldX,
};

const STATUS_COLOR = {
  pass: { icon: 'text-green-400', bg: 'bg-green-950/20 border-green-800/40', value: 'text-green-400', badge: 'bg-green-900/40 text-green-400 border-green-700' },
  warn: { icon: 'text-yellow-400', bg: 'bg-yellow-950/20 border-yellow-800/40', value: 'text-yellow-400', badge: 'bg-yellow-900/40 text-yellow-400 border-yellow-700' },
  fail: { icon: 'text-red-400',    bg: 'bg-red-950/20 border-red-800/40',       value: 'text-red-400',    badge: 'bg-red-900/40 text-red-400 border-red-700' },
};

const FAULT_EVENT_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  warning:  'text-yellow-400',
  network:  'text-purple-400',
  recover:  'text-green-400',
};

export function CompliancePanel({ state }: CompliancePanelProps) {
  const { t } = useTranslation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => computeMetrics(state, t), [
    state.busLoadPercent, state.frameCount, state.errorCount,
    state.nodes, state.faultEvents.length, t,
  ]);

  const overallStatus: MetricStatus =
    metrics.some(m => m.status === 'fail') ? 'fail' :
    metrics.some(m => m.status === 'warn') ? 'warn' : 'pass';

  const OverallIcon = STATUS_ICON[overallStatus];
  const overallColor = STATUS_COLOR[overallStatus];

  const recentFaults = useMemo(() => [...state.faultEvents].reverse().slice(0, 30), [state.faultEvents]);

  return (
    <div className="flex flex-col h-full overflow-y-auto font-mono text-xs">
      {/* Overall status banner */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800/60 ${overallColor.bg} border`}>
        <OverallIcon size={20} className={overallColor.icon} />
        <div>
          <div className={`font-bold text-sm ${overallColor.value}`}>
            {overallStatus === 'pass' ? t('can.compliancePass') :
             overallStatus === 'warn' ? t('can.complianceWarn') :
             t('can.complianceFail')}
          </div>
          <div className="text-[10px] text-gray-500">{t('can.iEC606011ISO118')}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] text-gray-600">{t('can.metricsLabel')}</div>
          <div className={`font-bold ${overallColor.value}`}>
            {metrics.filter(m => m.status === 'pass').length}/{metrics.length}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="p-3 space-y-2">
        {metrics.map(metric => {
          const Icon = STATUS_ICON[metric.status];
          const colors = STATUS_COLOR[metric.status];
          return (
            <div key={metric.id} className={`rounded-lg border p-3 ${colors.bg}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon size={13} className={colors.icon} />
                  <span className="font-bold text-white text-[11px]">{metric.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`font-bold tabular-nums text-sm ${colors.value}`}>{metric.displayValue}</span>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${colors.badge}`}>
                    {metric.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[9px]">
                <span className="text-gray-600">{metric.description}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-600">
                <span className="text-gray-700">{metric.standard}</span>
                <span>·</span>
                <span>{t('can.threshold')}: <span className="text-gray-500">{metric.threshold}</span></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fault event timeline */}
      {recentFaults.length > 0 && (
        <div className="px-3 pb-3">
          <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <AlertTriangle size={9} />
            {t('can.faultTimeline')}
          </div>
          <div className="space-y-0.5">
            {recentFaults.map((ev, i) => {
              const isRecover = ev.fault === 'recover';
              const severityKey = isRecover ? 'recover' : FAULT_SEVERITY[ev.fault as keyof typeof FAULT_SEVERITY] ?? 'network';
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-gray-900/30 text-[10px]">
                  <span className="text-gray-600 tabular-nums shrink-0">{ev.time}</span>
                  <span className="text-gray-500 shrink-0 truncate max-w-[60px]">{ev.nodeName}</span>
                  <span className={`font-bold ${FAULT_EVENT_COLOR[severityKey]}`}>
                    {isRecover ? t('can.Recovered') : t(FAULT_LABELS[ev.fault as keyof typeof FAULT_LABELS]) ?? ev.fault}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
