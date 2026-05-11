import type { LINFrame, LINScheduleEntry, LINChecksumType } from '../types/protocols/linbus';

/** Calculate parity bits for a 6-bit LIN frame ID → protected identifier */
export function calcPID(id: number): number {
  const i = id & 0x3F;
  const p0 = ((i >> 0) ^ (i >> 1) ^ (i >> 2) ^ (i >> 4)) & 1;
  const p1 = (~((i >> 1) ^ (i >> 3) ^ (i >> 4) ^ (i >> 5))) & 1;
  return i | (p0 << 6) | (p1 << 7);
}

/** LIN checksum with carry: classic uses data only, enhanced includes PID */
export function calcChecksum(data: number[], pid: number, type: LINChecksumType): number {
  let sum = type === 'enhanced' ? pid : 0;
  for (const b of data) {
    sum += b;
    if (sum > 0xFF) sum -= 0xFF;
  }
  return (~sum) & 0xFF;
}

export function buildLINFrame(
  id: number,
  data: number[],
  checksumType: LINChecksumType,
  nodeId?: string,
  frameName?: string,
): LINFrame {
  const pid = calcPID(id);
  return {
    id,
    pid,
    data,
    checksum: calcChecksum(data, pid, checksumType),
    checksumType,
    timestamp: Date.now(),
    nodeId,
    direction: 'tx',
    frameName,
  };
}

export function pidHex(pid: number): string {
  return '0x' + pid.toString(16).toUpperCase().padStart(2, '0');
}

export function dataHex(data: number[]): string {
  return data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/** Oscillating realistic data for a schedule entry driven by time t (seconds) */
export function generateLINData(entry: LINScheduleEntry, t: number): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < entry.dlc; i++) {
    const freq = 0.2 + ((entry.frameId * 7 + i * 3) % 9) * 0.08;
    const phase = entry.frameId * 0.5 + i * 1.1;
    const v = 127 + 100 * Math.sin(t * freq + phase);
    bytes.push(Math.max(0, Math.min(255, Math.round(v))));
  }
  return bytes;
}

/** Default sample schedule for demo */
export const SAMPLE_SCHEDULE: LINScheduleEntry[] = [
  { frameId: 0x01, name: 'BCM_DoorStatus',   dlc: 4, periodMs: 100,  publisherNodeId: 'BCM',     checksumType: 'enhanced' },
  { frameId: 0x02, name: 'BCM_LightCtrl',    dlc: 2, periodMs: 200,  publisherNodeId: 'BCM',     checksumType: 'enhanced' },
  { frameId: 0x10, name: 'HVAC_Status',      dlc: 4, periodMs: 200,  publisherNodeId: 'HVAC',    checksumType: 'enhanced' },
  { frameId: 0x11, name: 'HVAC_AirDist',     dlc: 2, periodMs: 500,  publisherNodeId: 'HVAC',    checksumType: 'enhanced' },
  { frameId: 0x20, name: 'Steering_Angle',   dlc: 4, periodMs: 50,   publisherNodeId: 'EPS',     checksumType: 'enhanced' },
  { frameId: 0x30, name: 'Seat_Driver',      dlc: 3, periodMs: 1000, publisherNodeId: 'Seat',    checksumType: 'classic'  },
];

export const SAMPLE_NODES = [
  { id: 'BCM',  name: 'Body Control Module', color: '#f59e0b', enabled: true, publishedIds: [0x01, 0x02] },
  { id: 'HVAC', name: 'HVAC Controller',     color: '#3b82f6', enabled: true, publishedIds: [0x10, 0x11] },
  { id: 'EPS',  name: 'Electric Power Steer',color: '#10b981', enabled: true, publishedIds: [0x20] },
  { id: 'Seat', name: 'Seat Module',         color: '#8b5cf6', enabled: true, publishedIds: [0x30] },
];
