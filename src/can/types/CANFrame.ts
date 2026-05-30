export type CANFrameType = 'data' | 'remote' | 'error' | 'overload';
export type CANIdFormat = 'standard' | 'extended';

/** Decoded SAE J1939 fields from a 29-bit extended CAN ID. */
export interface J1939Info {
  priority: number;        // bits 28-26 (0-7, lower = higher priority)
  dataPage: number;        // bit 24
  pgn: number;             // Parameter Group Number
  pf: number;              // PDU Format byte (bits 23-16)
  ps: number;              // PDU Specific byte (bits 15-8)
  sourceAddress: number;   // bits 7-0
  destinationAddress?: number; // equals ps when PF < 240 (peer-to-peer)
  isPeer2Peer: boolean;    // true when PF < 240
}

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
  // J1939 decoded fields (only present when idFormat === 'extended')
  j1939?: J1939Info;
}

export interface CANArbitrationEvent {
  timestamp: number;
  winnerId: number;
  loserId: number;
  winnerArbitrationId: number;
  loserArbitrationId: number;
}
