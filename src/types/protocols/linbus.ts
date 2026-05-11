export type LINChecksumType = 'classic' | 'enhanced';
export type LINDirection = 'tx' | 'rx';

export interface LINFrame {
  id: number;
  pid: number;
  data: number[];
  checksum: number;
  checksumType: LINChecksumType;
  timestamp: number;
  nodeId?: string;
  direction: LINDirection;
  frameName?: string;
}

export interface LINScheduleEntry {
  frameId: number;
  name: string;
  dlc: number;
  periodMs: number;
  publisherNodeId: string;
  checksumType: LINChecksumType;
}

export interface LINNode {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  publishedIds: number[];
}

export interface LINNodeStats {
  nodeId: string;
  frameCount: number;
  frameRate: number;
  lastSeen: number;
}

export interface LINBusStats {
  totalFrames: number;
  framesPerSecond: number;
  byNodes: Map<string, LINNodeStats>;
  byId: Map<number, { id: number; count: number; name: string; lastDlc: number }>;
  startTime: number;
}
