export type CANFrameType = 'data' | 'remote' | 'error' | 'overload';
export type CANIdType = 'standard' | 'extended';

export interface CANFrame {
  id: number;
  idType: CANIdType;
  frameType: CANFrameType;
  dlc: number;
  data: number[];
  crc: number;
  timestamp: number;
  nodeId?: string;
  raw?: string;
  decoded?: Record<string, number>;
}

export interface CANNode {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  txIds: number[];
  /** Transmission period per message ID in ms (0 = manual only) */
  txPeriods: Record<number, number>;
}

export interface CANFilter {
  id: number;
  mask: number;
  enabled: boolean;
}

// ── DBC types ────────────────────────────────────────────────────────────────

export type DBCByteOrder = 'little' | 'big';  // 1 = Intel/little, 0 = Motorola/big
export type DBCValueType = 'unsigned' | 'signed';

export interface DBCSignal {
  name: string;
  startBit: number;
  bitLength: number;
  byteOrder: DBCByteOrder;
  valueType: DBCValueType;
  scale: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  receivers: string[];
  comment?: string;
  valueTable?: Record<number, string>;
}

export interface DBCMessage {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  signals: DBCSignal[];
  comment?: string;
}

export interface DBCDatabase {
  version: string;
  messages: Map<number, DBCMessage>;
  nodes: string[];
  filename?: string;
}

// ── Bus statistics ────────────────────────────────────────────────────────────

export interface CANNodeStats {
  nodeId: string;
  frameCount: number;
  frameRate: number;
  lastSeen: number;
  bytesSent: number;
}

export interface CANIdStats {
  id: number;
  count: number;
  rate: number;
  lastDlc: number;
  lastSeen: number;
  messageName?: string;
}

export interface CANBusStats {
  totalFrames: number;
  framesPerSecond: number;
  busLoad: number;
  byNodes: Map<string, CANNodeStats>;
  byId: Map<number, CANIdStats>;
  startTime: number;
}

// ── Signal history (for trend chart) ─────────────────────────────────────────

export interface SignalSample {
  t: number;
  v: number;
}

export interface SignalHistory {
  msgId: number;
  signalName: string;
  unit: string;
  min: number;
  max: number;
  samples: SignalSample[];
}
