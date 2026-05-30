import type { CANMedicalProfile, CANNodeVitals, CANFaultType } from '../types/CANNode';

/** Physiological range limits per vital sign. */
const VITAL_RANGES = {
  heartRate:       { min: 40,  max: 180, step: 0.5 },
  spO2:            { min: 90,  max: 100, step: 0.1 },
  systolicBP:      { min: 80,  max: 200, step: 0.5 },
  diastolicBP:     { min: 50,  max: 120, step: 0.3 },
  temperature:     { min: 35,  max: 40,  step: 0.02 },
  respiratoryRate: { min: 8,   max: 30,  step: 0.2 },
  etCO2:           { min: 25,  max: 55,  step: 0.3 },
  flowRateMlHr:    { min: 0,   max: 500, step: 1 },
  pressureMmHg:    { min: 0,   max: 300, step: 1 },
  tidalVolumeMl:   { min: 300, max: 800, step: 2 },
  peepCmH2O:       { min: 3,   max: 20,  step: 0.5 },
  fio2Percent:     { min: 21,  max: 100, step: 0.5 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Add gaussian-like noise using Box-Muller transform. */
function gaussianNoise(amplitude: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return amplitude * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

/** Drift a single vital value slightly each tick (random walk). */
function driftValue(current: number, key: keyof typeof VITAL_RANGES): number {
  const range = VITAL_RANGES[key];
  const delta = gaussianNoise(range.step);
  return clamp(current + delta, range.min, range.max);
}

/**
 * Seek a vital toward a target at `speed` fraction per tick with added noise.
 * At speed=0.12 and 20 Hz, a value reaches ~95% of target in ~1.2 seconds.
 */
function seekValue(current: number, target: number, speed: number, noise: number, min: number, max: number): number {
  return clamp(current + (target - current) * speed + gaussianNoise(noise), min, max);
}

/** Fault-specific vital targets (range midpoints) and seek parameters. */
const FAULT_TARGETS: Partial<Record<CANFaultType, (v: CANNodeVitals) => Partial<CANNodeVitals>>> = {
  'cardiac-arrest': () => ({ heartRate: 6,   spO2: 52,  systolicBP: 48,  diastolicBP: 28, respiratoryRate: 2  }),
  'bradycardia':    () => ({ heartRate: 34 }),
  'tachycardia':    () => ({ heartRate: 172 }),
  'hypoxia':        () => ({ spO2: 76 }),
  'hypotension':    () => ({ systolicBP: 62, diastolicBP: 38 }),
  'hypertension':   () => ({ systolicBP: 188, diastolicBP: 112 }),
  'fever':          () => ({ temperature: 40.1 }),
  'hypothermia':    () => ({ temperature: 33.2 }),
};

function tickFaultVitals(vitals: CANNodeVitals, fault: CANFaultType): CANNodeVitals {
  const targets = FAULT_TARGETS[fault]?.(vitals);
  if (!targets) return vitals; // Network faults don't affect vitals

  const next = { ...vitals };
  if (targets.heartRate !== undefined)       next.heartRate       = seekValue(vitals.heartRate,       targets.heartRate,       0.08, 0.4,  4,   200);
  if (targets.spO2 !== undefined)            next.spO2            = seekValue(vitals.spO2,            targets.spO2,            0.05, 0.1,  40,  100);
  if (targets.systolicBP !== undefined)      next.systolicBP      = seekValue(vitals.systolicBP,      targets.systolicBP,      0.06, 0.4,  40,  240);
  if (targets.diastolicBP !== undefined)     next.diastolicBP     = seekValue(vitals.diastolicBP,     targets.diastolicBP,     0.06, 0.3,  20,  140);
  if (targets.temperature !== undefined)     next.temperature     = seekValue(vitals.temperature,     targets.temperature,     0.02, 0.02, 30,  43);
  if (targets.respiratoryRate !== undefined) next.respiratoryRate = seekValue(vitals.respiratoryRate, targets.respiratoryRate, 0.05, 0.2,  0,   60);
  return next;
}

/**
 * Advance vitals by one simulation tick.
 * Each profile type drifts its relevant fields with realistic variation.
 * Pass activeFault to apply fault-driven vital seeking instead of normal drift.
 */
export function tickVitals(vitals: CANNodeVitals, profile: CANMedicalProfile, activeFault: CANFaultType | null): CANNodeVitals {
  if (activeFault) {
    return tickFaultVitals(vitals, activeFault);
  }

  const next = { ...vitals };

  switch (profile) {
    case 'vital-monitor':
    case 'ecg-monitor':
    case 'pulse-oximeter':
      next.heartRate       = driftValue(vitals.heartRate, 'heartRate');
      next.spO2            = driftValue(vitals.spO2, 'spO2');
      next.systolicBP      = driftValue(vitals.systolicBP, 'systolicBP');
      next.diastolicBP     = driftValue(vitals.diastolicBP, 'diastolicBP');
      next.temperature     = driftValue(vitals.temperature, 'temperature');
      next.respiratoryRate = driftValue(vitals.respiratoryRate, 'respiratoryRate');
      next.etCO2           = driftValue(vitals.etCO2, 'etCO2');
      break;

    case 'iv-pump':
    case 'infusion-pump':
      next.flowRateMlHr  = driftValue(vitals.flowRateMlHr ?? 100, 'flowRateMlHr');
      next.pressureMmHg  = driftValue(vitals.pressureMmHg ?? 120, 'pressureMmHg');
      next.volumeInfusedMl = (vitals.volumeInfusedMl ?? 0) + (next.flowRateMlHr / 3600000) * 100;
      break;

    case 'ventilator':
      next.tidalVolumeMl   = driftValue(vitals.tidalVolumeMl ?? 500, 'tidalVolumeMl');
      next.peepCmH2O       = driftValue(vitals.peepCmH2O ?? 5, 'peepCmH2O');
      next.fio2Percent     = driftValue(vitals.fio2Percent ?? 40, 'fio2Percent');
      next.peakPressure    = next.tidalVolumeMl / 30 + next.peepCmH2O;
      next.respiratoryRate = driftValue(vitals.respiratoryRate, 'respiratoryRate');
      break;

    case 'defibrillator':
      // Defibrillator is passive — only transmits when triggered
      next.heartRate = driftValue(vitals.heartRate, 'heartRate');
      break;

    case 'custom':
      next.heartRate = driftValue(vitals.heartRate, 'heartRate');
      next.spO2      = driftValue(vitals.spO2, 'spO2');
      break;
  }

  // Check alarm thresholds and set alarm flags
  next.alarmFlags = computeAlarmFlags(next);

  return next;
}

/** Compute alarm bitmask based on current vital values. */
function computeAlarmFlags(vitals: CANNodeVitals): number {
  let flags = 0;
  if (vitals.heartRate < 50 || vitals.heartRate > 150)   flags |= 0x01;
  if (vitals.spO2 < 94)                                  flags |= 0x02;
  if (vitals.systolicBP > 180 || vitals.systolicBP < 90) flags |= 0x04;
  if (vitals.temperature > 38.5 || vitals.temperature < 35.5) flags |= 0x08;
  if (vitals.respiratoryRate > 25 || vitals.respiratoryRate < 8) flags |= 0x10;
  return flags;
}

/**
 * Encode vital signs into a CAN data frame payload.
 * Encoding follows a simplified CANopen PDO mapping.
 * Returns up to 8 bytes.
 */
export function encodeVitalsToCANData(vitals: CANNodeVitals, profile: CANMedicalProfile): number[] {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);

  switch (profile) {
    case 'vital-monitor':
    case 'ecg-monitor':
    case 'pulse-oximeter': {
      // Byte 0-1: Heart Rate (×10, uint16)
      view.setUint16(0, Math.round(vitals.heartRate * 10), true);
      // Byte 2-3: SpO2 (×100, uint16)
      view.setUint16(2, Math.round(vitals.spO2 * 100), true);
      // Byte 4-5: Systolic BP (×10, uint16)
      view.setUint16(4, Math.round(vitals.systolicBP * 10), true);
      // Byte 6: Diastolic BP (uint8, /1 mmHg)
      buf[6] = Math.round(vitals.diastolicBP);
      // Byte 7: Alarm flags
      buf[7] = vitals.alarmFlags;
      return Array.from(buf);
    }

    case 'iv-pump':
    case 'infusion-pump': {
      // Byte 0-1: Flow rate ml/hr (uint16)
      view.setUint16(0, Math.round(vitals.flowRateMlHr ?? 0), true);
      // Byte 2-3: Pressure mmHg (uint16)
      view.setUint16(2, Math.round(vitals.pressureMmHg ?? 0), true);
      // Byte 4-5: Volume infused ml (uint16)
      view.setUint16(4, Math.round(vitals.volumeInfusedMl ?? 0), true);
      // Byte 6-7: Alarm flags (uint16)
      view.setUint16(6, vitals.alarmFlags, true);
      return Array.from(buf);
    }

    case 'ventilator': {
      // Byte 0-1: Tidal volume ml (uint16)
      view.setUint16(0, Math.round(vitals.tidalVolumeMl ?? 500), true);
      // Byte 2: PEEP ×10 (uint8)
      buf[2] = Math.round((vitals.peepCmH2O ?? 5) * 10);
      // Byte 3: FiO2 (uint8, %)
      buf[3] = Math.round(vitals.fio2Percent ?? 40);
      // Byte 4: Respiratory rate (uint8)
      buf[4] = Math.round(vitals.respiratoryRate);
      // Byte 5: Peak pressure ×10 (uint8)
      buf[5] = Math.round((vitals.peakPressure ?? 0) * 10) & 0xff;
      // Byte 6-7: Alarm flags
      view.setUint16(6, vitals.alarmFlags, true);
      return Array.from(buf);
    }

    case 'defibrillator': {
      // Byte 0-1: HR (uint16 ×10)
      view.setUint16(0, Math.round(vitals.heartRate * 10), true);
      // Byte 2: Device status (0 = standby, 1 = charging, 2 = ready)
      buf[2] = 0x00;
      // Byte 3-7: reserved
      return Array.from(buf);
    }

    default: {
      view.setUint16(0, Math.round(vitals.heartRate * 10), true);
      view.setUint16(2, Math.round(vitals.spO2 * 100), true);
      buf[4] = vitals.alarmFlags;
      return Array.from(buf.slice(0, 5));
    }
  }
}
