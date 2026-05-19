
export type CANNodeState = 'error-active' | 'error-passive' | 'bus-off' | 'offline';
export type CANNMTState = 'initializing' | 'pre-operational' | 'operational' | 'stopped';

export type CANFaultType =
  | 'cardiac-arrest'
  | 'bradycardia'
  | 'tachycardia'
  | 'hypoxia'
  | 'hypotension'
  | 'hypertension'
  | 'fever'
  | 'hypothermia'
  | 'bus-off'
  | 'freeze'
  | 'noise-burst';

export type CANMedicalProfile =
  | 'vital-monitor'
  | 'iv-pump'
  | 'ventilator'
  | 'ecg-monitor'
  | 'defibrillator'
  | 'infusion-pump'
  | 'pulse-oximeter'
  | 'custom';

export interface CANNodeVitals {
  heartRate: number;           // bpm
  spO2: number;                // percentage
  systolicBP: number;          // mmHg
  diastolicBP: number;         // mmHg
  temperature: number;         // Celsius
  respiratoryRate: number;     // breaths per minute
  etCO2: number;               // end-tidal CO2 mmHg
  // IV / Infusion pump fields
  flowRateMlHr?: number;
  pressureMmHg?: number;
  volumeInfusedMl?: number;
  // Ventilator fields
  tidalVolumeMl?: number;
  peepCmH2O?: number;
  fio2Percent?: number;
  peakPressure?: number;
  // Alarm bitmask — bit 0: HR alarm, bit 1: SpO2 alarm, bit 2: BP alarm, etc.
  alarmFlags: number;
}

export interface CANNode {
  id: number;                  // CANopen node-id range 1-127
  name: string;
  profile: CANMedicalProfile;
  color: string;
  txErrorCounter: number;      // TEC 0-255
  rxErrorCounter: number;      // REC 0-255
  state: CANNodeState;
  nmtState: CANNMTState;
  sendIntervalMs: number;
  isActive: boolean;
  baseArbitrationId: number;
  vitals: CANNodeVitals;
  // Active injected fault — null means normal operation
  activeFault: CANFaultType | null;
  // Simulation timing
  lastSentAt: number;
  framesSent: number;
}

export const FAULT_LABELS: Record<CANFaultType, string> = {
  'cardiac-arrest': 'can.cardiacArrest',
  'bradycardia':    'can.bradycardia',
  'tachycardia':    'can.tachycardia',
  'hypoxia':        'can.hypoxia',
  'hypotension':    'can.hypotension',
  'hypertension':   'can.hypertension',
  'fever':          'can.fever',
  'hypothermia':    'can.hypothermia',
  'bus-off':        'can.busOff',
  'freeze':         'can.tXFreeze',
  'noise-burst':    'can.noiseBurst',
};

export const FAULT_SEVERITY: Record<CANFaultType, 'critical' | 'warning' | 'network'> = {
  'cardiac-arrest': 'critical',
  'bradycardia':    'critical',
  'tachycardia':    'warning',
  'hypoxia':        'critical',
  'hypotension':    'critical',
  'hypertension':   'warning',
  'fever':          'warning',
  'hypothermia':    'warning',
  'bus-off':        'network',
  'freeze':         'network',
  'noise-burst':    'network',
};

export const DEFAULT_VITALS: CANNodeVitals = {
  heartRate: 72,
  spO2: 98,
  systolicBP: 120,
  diastolicBP: 80,
  temperature: 36.6,
  respiratoryRate: 16,
  etCO2: 38,
  alarmFlags: 0,
};

export const MEDICAL_PROFILE_COLORS: Record<CANMedicalProfile, string> = {
  'vital-monitor':  '#22d3ee',
  'iv-pump':        '#a78bfa',
  'ventilator':     '#34d399',
  'ecg-monitor':    '#f87171',
  'defibrillator':  '#fbbf24',
  'infusion-pump':  '#818cf8',
  'pulse-oximeter': '#fb7185',
  'custom':         '#94a3b8',
};

export const MEDICAL_PROFILE_LABELS: Record<CANMedicalProfile, string> = {
  'vital-monitor':  'can.vitalMonitor',
  'iv-pump':        'can.iVPump',
  'ventilator':     'can.ventilator',
  'ecg-monitor':    'can.eCGMonitor',
  'defibrillator':  'can.defibrillator',
  'infusion-pump':  'can.infusionPump',
  'pulse-oximeter': 'can.pulseOximeter',
  'custom':         'can.customNode',
};
