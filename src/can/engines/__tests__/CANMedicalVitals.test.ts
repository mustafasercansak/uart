import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tickVitals, encodeVitalsToCANData } from '../CANMedicalVitals';
import { DEFAULT_VITALS } from '../../types/CANNode';
import type { CANNodeVitals } from '../../types/CANNode';

// Make noise near-zero: Box-Muller u1=0.9999 → sqrt(-2*log(0.9999)) ≈ 0.0141 → tiny amplitude
const NEAR_ZERO_U = 0.9999;

function vitals(overrides: Partial<CANNodeVitals> = {}): CANNodeVitals {
  return { ...DEFAULT_VITALS, alarmFlags: 0, ...overrides };
}

// ─── Normal drift profiles ────────────────────────────────────────────────────

describe('tickVitals — normal drift (no fault)', () => {
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('vital-monitor drifts heartRate, spO2, BPs, temp, respRate, etCO2', () => {
    const v = vitals();
    const result = tickVitals(v, 'vital-monitor', null);
    expect(result.heartRate).not.toBe(v.heartRate);
    expect(result.spO2).not.toBe(v.spO2);
    expect(result.systolicBP).not.toBe(v.systolicBP);
    expect(result.diastolicBP).not.toBe(v.diastolicBP);
    expect(result.temperature).not.toBe(v.temperature);
    expect(result.respiratoryRate).not.toBe(v.respiratoryRate);
    expect(result.etCO2).not.toBe(v.etCO2);
  });

  it('ecg-monitor and pulse-oximeter share vital-monitor branch', () => {
    const v = vitals();
    const ecg = tickVitals(v, 'ecg-monitor', null);
    const pox = tickVitals(v, 'pulse-oximeter', null);
    expect(ecg.heartRate).toBeTypeOf('number');
    expect(pox.spO2).toBeTypeOf('number');
  });

  it('iv-pump drifts flowRateMlHr and pressureMmHg, accumulates volumeInfusedMl', () => {
    const v = vitals({ flowRateMlHr: 100, pressureMmHg: 120, volumeInfusedMl: 50 });
    const result = tickVitals(v, 'iv-pump', null);
    expect(result.flowRateMlHr).toBeTypeOf('number');
    expect(result.pressureMmHg).toBeTypeOf('number');
    expect(result.volumeInfusedMl).toBeGreaterThan(50);
  });

  it('iv-pump uses 100 / 0 defaults when optional fields are absent', () => {
    const v = vitals();
    const result = tickVitals(v, 'iv-pump', null);
    expect(result.flowRateMlHr).toBeTypeOf('number');
    expect(result.volumeInfusedMl).toBeGreaterThanOrEqual(0);
  });

  it('infusion-pump shares iv-pump branch', () => {
    const v = vitals({ flowRateMlHr: 200, pressureMmHg: 130, volumeInfusedMl: 10 });
    const result = tickVitals(v, 'infusion-pump', null);
    expect(result.flowRateMlHr).toBeTypeOf('number');
  });

  it('ventilator drifts tidalVolume, peep, fio2, respRate and computes peakPressure', () => {
    const v = vitals({ tidalVolumeMl: 500, peepCmH2O: 5, fio2Percent: 40 });
    const result = tickVitals(v, 'ventilator', null);
    expect(result.tidalVolumeMl).toBeTypeOf('number');
    expect(result.peepCmH2O).toBeTypeOf('number');
    expect(result.fio2Percent).toBeTypeOf('number');
    expect(result.peakPressure).toBeTypeOf('number');
    expect(result.respiratoryRate).not.toBe(v.respiratoryRate);
  });

  it('ventilator uses defaults when optional fields are absent', () => {
    const v = vitals();
    const result = tickVitals(v, 'ventilator', null);
    expect(result.peakPressure).toBeTypeOf('number');
  });

  it('defibrillator only drifts heartRate', () => {
    const v = vitals();
    const result = tickVitals(v, 'defibrillator', null);
    expect(result.heartRate).not.toBe(v.heartRate);
    // spO2 unchanged in defibrillator branch (no drift applied there)
    expect(result.spO2).toBe(v.spO2);
  });

  it('custom drifts heartRate and spO2', () => {
    const v = vitals();
    const result = tickVitals(v, 'custom', null);
    expect(result.heartRate).not.toBe(v.heartRate);
    expect(result.spO2).not.toBe(v.spO2);
  });

  it('values stay within physiological bounds across 20 ticks (vital-monitor)', () => {
    vi.restoreAllMocks(); // use real random
    let v = vitals();
    for (let i = 0; i < 20; i++) {
      v = tickVitals(v, 'vital-monitor', null);
    }
    expect(v.heartRate).toBeGreaterThanOrEqual(40);
    expect(v.heartRate).toBeLessThanOrEqual(180);
    expect(v.spO2).toBeGreaterThanOrEqual(90);
    expect(v.spO2).toBeLessThanOrEqual(100);
    expect(v.systolicBP).toBeGreaterThanOrEqual(80);
    expect(v.systolicBP).toBeLessThanOrEqual(200);
    expect(v.temperature).toBeGreaterThanOrEqual(35);
    expect(v.temperature).toBeLessThanOrEqual(40);
  });
});

// ─── Alarm flags ─────────────────────────────────────────────────────────────

describe('tickVitals — computeAlarmFlags', () => {
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sets HR alarm (bit 0) when heartRate < 50', () => {
    const result = tickVitals(vitals({ heartRate: 45 }), 'vital-monitor', null);
    expect(result.alarmFlags & 0x01).toBe(0x01);
  });

  it('sets HR alarm (bit 0) when heartRate > 150', () => {
    const result = tickVitals(vitals({ heartRate: 160 }), 'vital-monitor', null);
    expect(result.alarmFlags & 0x01).toBe(0x01);
  });

  it('sets SpO2 alarm (bit 1) when spO2 < 94', () => {
    const result = tickVitals(vitals({ spO2: 90 }), 'vital-monitor', null);
    expect(result.alarmFlags & 0x02).toBe(0x02);
  });

  it('sets BP alarm (bit 2) when systolicBP > 180', () => {
    const result = tickVitals(vitals({ systolicBP: 185 }), 'vital-monitor', null);
    expect(result.alarmFlags & 0x04).toBe(0x04);
  });

  it('sets BP alarm (bit 2) when systolicBP < 90', () => {
    const result = tickVitals(vitals({ systolicBP: 85 }), 'vital-monitor', null);
    expect(result.alarmFlags & 0x04).toBe(0x04);
  });

  it('sets temp alarm (bit 3) when temperature > 38.5', () => {
    const result = tickVitals(vitals({ temperature: 39 }), 'vital-monitor', null);
    expect(result.alarmFlags & 0x08).toBe(0x08);
  });

  it('sets temp alarm (bit 3) when temperature < 35.5', () => {
    const result = tickVitals(vitals({ temperature: 35 }), 'vital-monitor', null);
    expect(result.alarmFlags & 0x08).toBe(0x08);
  });

  it('sets RR alarm (bit 4) when respiratoryRate > 25', () => {
    const result = tickVitals(vitals({ respiratoryRate: 28 }), 'vital-monitor', null);
    expect(result.alarmFlags & 0x10).toBe(0x10);
  });

  it('sets RR alarm (bit 4) when respiratoryRate < 8', () => {
    // defibrillator only drifts heartRate, so respiratoryRate=6 reaches computeAlarmFlags unchanged
    const result = tickVitals(vitals({ respiratoryRate: 6 }), 'defibrillator', null);
    expect(result.alarmFlags & 0x10).toBe(0x10);
  });

  it('no alarms for normal vitals', () => {
    const v = vitals({ heartRate: 75, spO2: 98, systolicBP: 120, diastolicBP: 80, temperature: 37, respiratoryRate: 16 });
    // Spy returns 0.5: Box-Muller gives small negative delta, values stay in normal range
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    const result = tickVitals(v, 'vital-monitor', null);
    expect(result.alarmFlags).toBe(0x00);
  });

  it('multiple alarms set simultaneously', () => {
    const v = vitals({ heartRate: 45, spO2: 90, systolicBP: 185 });
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    const result = tickVitals(v, 'vital-monitor', null);
    expect(result.alarmFlags & 0x01).toBe(0x01);
    expect(result.alarmFlags & 0x02).toBe(0x02);
    expect(result.alarmFlags & 0x04).toBe(0x04);
  });
});

// ─── Fault vitals ─────────────────────────────────────────────────────────────

describe('tickVitals — fault seeking', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('cardiac-arrest drives HR, SpO2, systolicBP, diastolicBP, respRate toward critical values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    let v = vitals({ heartRate: 72, spO2: 98, systolicBP: 120, diastolicBP: 80, respiratoryRate: 16 });
    for (let i = 0; i < 50; i++) {
      v = tickVitals(v, 'vital-monitor', 'cardiac-arrest');
    }
    expect(v.heartRate).toBeLessThan(72);
    expect(v.spO2).toBeLessThan(98);
    expect(v.systolicBP).toBeLessThan(120);
    expect(v.diastolicBP).toBeLessThan(80);
    expect(v.respiratoryRate).toBeLessThan(16);
  });

  it('bradycardia seeks heartRate downward', () => {
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    let v = vitals({ heartRate: 72 });
    for (let i = 0; i < 30; i++) {
      v = tickVitals(v, 'vital-monitor', 'bradycardia');
    }
    expect(v.heartRate).toBeLessThan(72);
  });

  it('tachycardia seeks heartRate upward', () => {
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    let v = vitals({ heartRate: 72 });
    for (let i = 0; i < 30; i++) {
      v = tickVitals(v, 'vital-monitor', 'tachycardia');
    }
    expect(v.heartRate).toBeGreaterThan(72);
  });

  it('hypoxia seeks spO2 downward', () => {
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    let v = vitals({ spO2: 98 });
    for (let i = 0; i < 30; i++) {
      v = tickVitals(v, 'vital-monitor', 'hypoxia');
    }
    expect(v.spO2).toBeLessThan(98);
  });

  it('hypotension drives both BPs downward', () => {
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    let v = vitals({ systolicBP: 120, diastolicBP: 80 });
    for (let i = 0; i < 30; i++) {
      v = tickVitals(v, 'vital-monitor', 'hypotension');
    }
    expect(v.systolicBP).toBeLessThan(120);
    expect(v.diastolicBP).toBeLessThan(80);
  });

  it('hypertension drives both BPs upward', () => {
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    let v = vitals({ systolicBP: 120, diastolicBP: 80 });
    for (let i = 0; i < 30; i++) {
      v = tickVitals(v, 'vital-monitor', 'hypertension');
    }
    expect(v.systolicBP).toBeGreaterThan(120);
    expect(v.diastolicBP).toBeGreaterThan(80);
  });

  it('fever seeks temperature upward', () => {
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    let v = vitals({ temperature: 36.6 });
    for (let i = 0; i < 30; i++) {
      v = tickVitals(v, 'vital-monitor', 'fever');
    }
    expect(v.temperature).toBeGreaterThan(36.6);
  });

  it('hypothermia seeks temperature downward', () => {
    vi.spyOn(Math, 'random').mockReturnValue(NEAR_ZERO_U);
    let v = vitals({ temperature: 36.6 });
    for (let i = 0; i < 30; i++) {
      v = tickVitals(v, 'vital-monitor', 'hypothermia');
    }
    expect(v.temperature).toBeLessThan(36.6);
  });

  it.each(['bus-off', 'freeze', 'noise-burst'] as const)(
    'network fault %s does not change vital values',
    (fault) => {
      const v = vitals();
      const result = tickVitals(v, 'vital-monitor', fault);
      expect(result.heartRate).toBe(v.heartRate);
      expect(result.spO2).toBe(v.spO2);
      expect(result.systolicBP).toBe(v.systolicBP);
      expect(result.temperature).toBe(v.temperature);
    }
  );
});

// ─── encodeVitalsToCANData ────────────────────────────────────────────────────

describe('encodeVitalsToCANData', () => {
  const v = vitals({ heartRate: 75, spO2: 98, systolicBP: 120, diastolicBP: 80, temperature: 37, respiratoryRate: 16, alarmFlags: 0x03 });

  it('vital-monitor encodes 8 bytes with correct HR, SpO2, BP, alarms', () => {
    const data = encodeVitalsToCANData(v, 'vital-monitor');
    expect(data).toHaveLength(8);
    const view = new DataView(new Uint8Array(data).buffer);
    expect(view.getUint16(0, true)).toBe(Math.round(v.heartRate * 10));
    expect(view.getUint16(2, true)).toBe(Math.round(v.spO2 * 100));
    expect(view.getUint16(4, true)).toBe(Math.round(v.systolicBP * 10));
    expect(data[6]).toBe(Math.round(v.diastolicBP));
    expect(data[7]).toBe(v.alarmFlags);
  });

  it('ecg-monitor shares vital-monitor encoding', () => {
    const ecg = encodeVitalsToCANData(v, 'ecg-monitor');
    const vm = encodeVitalsToCANData(v, 'vital-monitor');
    expect(ecg).toEqual(vm);
  });

  it('pulse-oximeter shares vital-monitor encoding', () => {
    const pox = encodeVitalsToCANData(v, 'pulse-oximeter');
    const vm = encodeVitalsToCANData(v, 'vital-monitor');
    expect(pox).toEqual(vm);
  });

  it('iv-pump encodes flow, pressure, volume, alarms in 8 bytes', () => {
    const iv = vitals({ flowRateMlHr: 150, pressureMmHg: 130, volumeInfusedMl: 250, alarmFlags: 0 });
    const data = encodeVitalsToCANData(iv, 'iv-pump');
    expect(data).toHaveLength(8);
    const view = new DataView(new Uint8Array(data).buffer);
    expect(view.getUint16(0, true)).toBe(150);
    expect(view.getUint16(2, true)).toBe(130);
    expect(view.getUint16(4, true)).toBe(250);
    expect(view.getUint16(6, true)).toBe(0);
  });

  it('iv-pump uses 0 when optional fields absent', () => {
    const data = encodeVitalsToCANData(vitals(), 'iv-pump');
    const view = new DataView(new Uint8Array(data).buffer);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(0);
  });

  it('infusion-pump shares iv-pump encoding', () => {
    const iv = vitals({ flowRateMlHr: 100, pressureMmHg: 110, volumeInfusedMl: 50, alarmFlags: 0 });
    expect(encodeVitalsToCANData(iv, 'infusion-pump')).toEqual(encodeVitalsToCANData(iv, 'iv-pump'));
  });

  it('ventilator encodes tidalVolume, peep, fio2, respRate, peakPressure, alarms', () => {
    const vent = vitals({ tidalVolumeMl: 500, peepCmH2O: 5, fio2Percent: 40, respiratoryRate: 14, peakPressure: 22, alarmFlags: 0 });
    const data = encodeVitalsToCANData(vent, 'ventilator');
    expect(data).toHaveLength(8);
    const arr = new Uint8Array(data);
    const view = new DataView(arr.buffer);
    expect(view.getUint16(0, true)).toBe(500);
    expect(arr[2]).toBe(Math.round(5 * 10));
    expect(arr[3]).toBe(40);
    expect(arr[4]).toBe(14);
    expect(arr[5]).toBe(Math.round(22 * 10) & 0xff);
    expect(view.getUint16(6, true)).toBe(0);
  });

  it('ventilator uses defaults when optional fields absent', () => {
    const data = encodeVitalsToCANData(vitals(), 'ventilator');
    expect(data).toHaveLength(8);
    const arr = new Uint8Array(data);
    const view = new DataView(arr.buffer);
    expect(view.getUint16(0, true)).toBe(500); // default tidalVolumeMl
    expect(arr[3]).toBe(40);                    // default fio2Percent
  });

  it('defibrillator encodes HR and status byte 0x00', () => {
    const data = encodeVitalsToCANData(v, 'defibrillator');
    expect(data).toHaveLength(8);
    const view = new DataView(new Uint8Array(data).buffer);
    expect(view.getUint16(0, true)).toBe(Math.round(v.heartRate * 10));
    expect(data[2]).toBe(0x00);
  });

  it('custom (default) encodes HR, SpO2, and alarmFlags in 5 bytes', () => {
    const data = encodeVitalsToCANData(v, 'custom');
    expect(data).toHaveLength(5);
    const view = new DataView(new Uint8Array(data).buffer);
    expect(view.getUint16(0, true)).toBe(Math.round(v.heartRate * 10));
    expect(view.getUint16(2, true)).toBe(Math.round(v.spO2 * 100));
    expect(data[4]).toBe(v.alarmFlags);
  });
});
