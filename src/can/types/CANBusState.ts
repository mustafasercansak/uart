import type { CANFrame, CANArbitrationEvent } from './CANFrame';
import type { CANNode, CANFaultType } from './CANNode';
import type { CANErrorInjectionState } from './CANErrorInjection';
import type { OutputMode } from '../../types';

export type CANBusStatus = 'stopped' | 'running' | 'paused';
export type CANBaudRate = 125 | 250 | 500 | 1000;

export interface CANLogEntry {
  time: string;
  text: string;
  type: 'info' | 'tx' | 'rx' | 'error' | 'arbitration' | 'nmt' | 'alarm';
  nodeId?: number;
}

export interface CANFaultEvent {
  timestamp: number;
  time: string;
  nodeId: number;
  nodeName: string;
  fault: CANFaultType | 'recover';
}

export interface CANBusState {
  status: CANBusStatus;
  outputMode: OutputMode;
  serialConnected: boolean;
  networkConnected: boolean;
  isRecording: boolean;
  recordedFrames: CANFrame[];
  baudRate: CANBaudRate;
  nodes: CANNode[];
  recentFrames: CANFrame[];
  busLoadPercent: number;
  frameCount: number;
  errorCount: number;
  framesPerSecond: number;
  arbitrationEvents: CANArbitrationEvent[];
  startedAt: number | null;
  elapsedMs: number;
  logEntries: CANLogEntry[];
  faultEvents: CANFaultEvent[];
  selectedNodeId: number | null;
  selectedFrameUid: string | null;
  displayFilter: string;
  showArbitrationEvents: boolean;
  showErrorFrames: boolean;
  errorInjection: CANErrorInjectionState;
}

// Re-export referenced types so consumers only need one import path
export type { CANFrame, CANArbitrationEvent, CANNode, CANFaultType };
