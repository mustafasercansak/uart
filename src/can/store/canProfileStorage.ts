import { v4 as uuidv4 } from 'uuid';
import type { CANBaudRate } from '../types/CANBusState';
import type { CANMedicalProfile } from '../types/CANNode';
import { MEDICAL_PROFILE_COLORS } from '../types/CANNode';

const STORAGE_KEY = 'can_profiles';

export interface CANProfileNode {
  id: number;
  name: string;
  profile: CANMedicalProfile;
  color: string;
  baseArbitrationId: number;
  sendIntervalMs: number;
  isActive: boolean;
  // Extended CAN parameters (optional — backwards compatible)
  nodeId?: number;                // CANopen node ID 1–127
  frameFormat?: 'standard' | 'extended';
  dlc?: number;                   // Data Length Code 1–8 bytes
  nmtInitialState?: 'operational' | 'pre-operational' | 'stopped';
  priority?: number;              // Frame priority 0–7
}

export interface CANProfile {
  id: string;
  name: string;
  description: string;
  baudRate: CANBaudRate;
  nodes: CANProfileNode[];
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PROFILES: CANProfile[] = [
  {
    id: 'icu',
    name: 'can.iCUIntensiveCar',
    description: 'can.standardICUMoni',
    baudRate: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: 1, name: 'can.bed1Monitor', profile: 'vital-monitor', color: MEDICAL_PROFILE_COLORS['vital-monitor'], baseArbitrationId: 0x181, sendIntervalMs: 100, isActive: true },
      { id: 2, name: 'can.bed1IVPump', profile: 'iv-pump', color: MEDICAL_PROFILE_COLORS['iv-pump'], baseArbitrationId: 0x182, sendIntervalMs: 500, isActive: true },
      { id: 3, name: 'can.bed1Vent', profile: 'ventilator', color: MEDICAL_PROFILE_COLORS['ventilator'], baseArbitrationId: 0x183, sendIntervalMs: 200, isActive: true },
      { id: 4, name: 'can.bed2Monitor', profile: 'vital-monitor', color: MEDICAL_PROFILE_COLORS['vital-monitor'], baseArbitrationId: 0x184, sendIntervalMs: 100, isActive: true },
      { id: 5, name: 'can.bed2IVPump', profile: 'iv-pump', color: MEDICAL_PROFILE_COLORS['iv-pump'], baseArbitrationId: 0x185, sendIntervalMs: 500, isActive: true },
    ]
  },
  {
    id: 'er',
    name: 'can.eREmergencyRoom',
    description: 'can.traumaAndRapidR',
    baudRate: 1000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: 1, name: 'can.traumaMonitor', profile: 'vital-monitor', color: MEDICAL_PROFILE_COLORS['vital-monitor'], baseArbitrationId: 0x181, sendIntervalMs: 50, isActive: true },
      { id: 2, name: 'can.eCGMonitor', profile: 'ecg-monitor', color: MEDICAL_PROFILE_COLORS['ecg-monitor'], baseArbitrationId: 0x182, sendIntervalMs: 50, isActive: true },
      { id: 3, name: 'can.defibrillator', profile: 'defibrillator', color: MEDICAL_PROFILE_COLORS['defibrillator'], baseArbitrationId: 0x183, sendIntervalMs: 200, isActive: true },
      { id: 4, name: 'can.pulseOx', profile: 'pulse-oximeter', color: MEDICAL_PROFILE_COLORS['pulse-oximeter'], baseArbitrationId: 0x184, sendIntervalMs: 100, isActive: true },
    ]
  },
  {
    id: 'or',
    name: 'can.oROperatingRoom',
    description: 'can.anesthesiaAndCr',
    baudRate: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: 1, name: 'can.oRMonitor', profile: 'vital-monitor', color: MEDICAL_PROFILE_COLORS['vital-monitor'], baseArbitrationId: 0x181, sendIntervalMs: 100, isActive: true },
      { id: 2, name: 'can.anestVent', profile: 'ventilator', color: MEDICAL_PROFILE_COLORS['ventilator'], baseArbitrationId: 0x182, sendIntervalMs: 200, isActive: true },
      { id: 3, name: 'can.infusionPump', profile: 'infusion-pump', color: MEDICAL_PROFILE_COLORS['infusion-pump'], baseArbitrationId: 0x183, sendIntervalMs: 300, isActive: true },
      { id: 4, name: 'can.eCGMonitor', profile: 'ecg-monitor', color: MEDICAL_PROFILE_COLORS['ecg-monitor'], baseArbitrationId: 0x184, sendIntervalMs: 50, isActive: true },
    ]
  },
  {
    id: 'ward',
    name: 'can.wardGeneralCare',
    description: 'can.standardInpatie',
    baudRate: 250,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: 1, name: 'can.wardMonA', profile: 'vital-monitor', color: MEDICAL_PROFILE_COLORS['vital-monitor'], baseArbitrationId: 0x181, sendIntervalMs: 200, isActive: true },
      { id: 2, name: 'can.wardMonB', profile: 'vital-monitor', color: MEDICAL_PROFILE_COLORS['vital-monitor'], baseArbitrationId: 0x182, sendIntervalMs: 200, isActive: true },
      { id: 3, name: 'can.pulseOxA', profile: 'pulse-oximeter', color: MEDICAL_PROFILE_COLORS['pulse-oximeter'], baseArbitrationId: 0x183, sendIntervalMs: 1000, isActive: true },
      { id: 4, name: 'can.pulseOxB', profile: 'pulse-oximeter', color: MEDICAL_PROFILE_COLORS['pulse-oximeter'], baseArbitrationId: 0x184, sendIntervalMs: 1000, isActive: true },
      { id: 5, name: 'can.iVPumpA', profile: 'iv-pump', color: MEDICAL_PROFILE_COLORS['iv-pump'], baseArbitrationId: 0x185, sendIntervalMs: 500, isActive: true },
    ]
  }
];

export function loadCANProfiles(): CANProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PROFILES));
      return DEFAULT_PROFILES;
    }
    return JSON.parse(raw) as CANProfile[];
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function saveCANProfile(profile: CANProfile): void {
  const all = loadCANProfiles();
  const idx = all.findIndex(p => p.id === profile.id);
  if (idx >= 0) all[idx] = profile;
  else all.push(profile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteCANProfile(id: string): void {
  const all = loadCANProfiles().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function createCANProfile(
  name: string,
  description: string,
  baudRate: CANBaudRate,
  nodes: CANProfileNode[],
): CANProfile {
  const now = new Date().toISOString();
  return { id: uuidv4(), name, description, baudRate, nodes, createdAt: now, updatedAt: now };
}

export function profileNodeColor(profile: CANMedicalProfile): string {
  return MEDICAL_PROFILE_COLORS[profile];
}
