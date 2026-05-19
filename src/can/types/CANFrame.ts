export type CANFrameType = 'data' | 'remote' | 'error' | 'overload';
export type CANIdFormat = 'standard' | 'extended';

export interface CANFrame {
  uid: string;
  arbitrationId: number;      // 11-bit (0-2047) or 29-bit (0-536870911)
  idFormat: CANIdFormat;
  frameType: CANFrameType;
  isRTR: boolean;
  dlc: number;                // Data Length Code 0-8
  data: number[];             // max 8 bytes
  crc: number;                // 15-bit CRC
  timestamp: number;          // ms since epoch
  nodeId: number;             // originating node id
  busLoadPercent: number;
  errors: string[];
  // CANopen upper layer (optional)
  cobId?: number;
  functionCode?: number;
  canOpenNodeId?: number;
}

export interface CANArbitrationEvent {
  timestamp: number;
  winnerId: number;
  loserId: number;
  winnerArbitrationId: number;
  loserArbitrationId: number;
}
