import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANSimulationEngine } from '../CANSimulationEngine';
import { INITIAL_CAN_STATE } from '../../store/canReducer';
import { DEFAULT_VITALS, type CANMedicalProfile } from '../../types/CANNode';
import type { CANFrame } from '../../types/CANFrame';
import type { CANBusState } from '../../types/CANBusState';

describe('CANSimulationEngine lifecycle and bus behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createEngine() {
    const engine = new CANSimulationEngine(structuredClone(INITIAL_CAN_STATE));
    const frames: CANFrame[] = [];
    const patches: Partial<CANBusState>[] = [];
    const logs: string[] = [];
    const faults: string[] = [];

    engine.onFrame = frame => frames.push(frame);
    engine.onStateUpdate = patch => patches.push(patch);
    engine.onLog = entry => logs.push(entry.text);
    engine.onFaultEvent = event => faults.push(`${event.nodeId}:${event.fault}`);

    return { engine, frames, patches, logs, faults };
  }

  it('starts, pauses, resumes, and stops without duplicating timers', () => {
    const { engine, patches, logs } = createEngine();

    engine.start();
    engine.start();
    engine.pause();
    engine.pause();
    engine.resume();
    engine.resume();
    engine.stop();

    expect(patches.map(patch => patch.status).filter(Boolean)).toEqual(['running', 'paused', 'running', 'stopped']);
    expect(engine.getState().status).toBe('stopped');
    expect(engine.getState().elapsedMs).toBe(0);
    expect(logs.length).toBeGreaterThanOrEqual(4);
  });

  it('adds, updates, removes nodes and clamps bus-level configuration', () => {
    const { engine, patches } = createEngine();

    engine.addNode(makeNodeInput(1, { name: 'Monitor', color: '' }));
    engine.updateNode(1, { name: 'Updated Monitor', sendIntervalMs: 25 });
    engine.setBaudRate(1000);
    engine.setErrorInjectionConfig({
      enabledTypes: { 'crc-corruption': false, 'form-error': false, 'ack-error': false, 'bit-stuffing': true },
      triggerMode: 'random',
      periodicEvery: 0,
      randomRate: 200,
    });
    engine.setUDSConfig({
      ...engine.getState().udsConfig,
      testerRequestId: -10,
      ecuResponseId: 0x900,
      blockSize: 999,
      stMinMs: 999,
      didResponses: [{ id: 'bad', did: 0x1ffff, label: 'Bad', encoding: 'hex', value: 'AA', enabled: true }],
      dtcCodes: [-1, 0x2ffffff],
    });
    engine.removeNode(1);

    expect(engine.getState().baudRate).toBe(1000);
    expect(engine.getState().errorInjection.config).toMatchObject({ periodicEvery: 1, randomRate: 100 });
    expect(engine.getState().udsConfig).toMatchObject({
      testerRequestId: 0,
      ecuResponseId: 0x7ff,
      blockSize: 255,
      stMinMs: 127,
      dtcCodes: [0, 0xffffff],
    });
    expect(engine.getState().udsConfig.didResponses[0].did).toBe(0xffff);
    expect(engine.getState().nodes).toEqual([]);
    expect(patches.some(patch => patch.nodes)).toBe(true);
  });

  it('arbitrates simultaneous node transmissions and updates bus load', () => {
    const { engine, frames, patches, logs } = createEngine();
    engine.addNode(makeNodeInput(1, { baseArbitrationId: 0x300, sendIntervalMs: 10 }));
    engine.addNode(makeNodeInput(2, { baseArbitrationId: 0x100, sendIntervalMs: 10 }));

    engine.start();
    vi.advanceTimersByTime(60);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ nodeId: 2, arbitrationId: 0x100 });
    expect(engine.getState().arbitrationEvents[0]).toMatchObject({ winnerId: 2, loserId: 1 });
    expect(engine.getState().nodes.find(node => node.id === 2)?.framesSent).toBe(1);
    expect(logs.some(text => text.includes('Arbitration'))).toBe(true);
    expect(patches.some(patch => typeof patch.busLoadPercent === 'number')).toBe(true);
  });

  it('skips inactive/offline/bus-off nodes and still transmits active nodes', () => {
    const { engine, frames } = createEngine();
    engine.addNode(makeNodeInput(1, { isActive: false }));
    engine.addNode(makeNodeInput(2));
    engine.updateNode(2, { state: 'offline' });
    engine.addNode(makeNodeInput(3));
    engine.updateNode(3, { state: 'bus-off' });
    engine.addNode(makeNodeInput(4, { baseArbitrationId: 0x104 }));

    engine.start();
    vi.advanceTimersByTime(60);

    expect(frames).toHaveLength(1);
    expect(frames[0].nodeId).toBe(4);
  });

  it('injects and recovers bus-off, freeze, noise burst, and clinical faults', () => {
    const { engine, faults, logs } = createEngine();
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    engine.addNode(makeNodeInput(1));
    engine.addNode(makeNodeInput(2));
    engine.addNode(makeNodeInput(3));
    engine.addNode(makeNodeInput(4));

    engine.injectFault(1, 'bus-off');
    engine.injectFault(2, 'freeze');
    engine.injectFault(3, 'noise-burst');
    engine.injectFault(4, 'tachycardia');
    engine.injectFault(999, 'bus-off');

    expect(engine.getState().nodes.find(node => node.id === 1)).toMatchObject({ state: 'bus-off', txErrorCounter: 256 });
    expect(engine.getState().nodes.find(node => node.id === 2)).toMatchObject({ isActive: false });
    expect(engine.getState().nodes.find(node => node.id === 3)?.activeFault).toBe('noise-burst');
    expect(engine.getState().nodes.find(node => node.id === 4)?.activeFault).toBe('tachycardia');

    engine.recoverNode(1);
    engine.recoverNode(2);
    engine.recoverNode(3);
    engine.recoverNode(999);

    expect(engine.getState().nodes.slice(0, 3).every(node => node.state === 'error-active' && node.isActive)).toBe(true);
    expect(faults).toEqual(expect.arrayContaining(['1:bus-off', '2:freeze', '3:noise-burst', '4:tachycardia', '1:recover']));
    expect(logs.some(text => text.includes('re-activated'))).toBe(true);
  });

  it('covers random error injection and alarm frame handling', () => {
    const { engine, frames, logs } = createEngine();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    engine.setErrorInjectionConfig({
      enabledTypes: { 'crc-corruption': true, 'form-error': false, 'ack-error': false, 'bit-stuffing': true },
      triggerMode: 'random',
      periodicEvery: 2,
      randomRate: 50,
    });
    engine.addNode(makeNodeInput(1, {
      vitals: { ...DEFAULT_VITALS, alarmFlags: 0x02 },
      sendIntervalMs: 10,
    }));

    engine.start();
    vi.advanceTimersByTime(60);

    expect(frames[0].errors).toEqual(expect.arrayContaining(['CRC Corruption', 'Bit Stuffing Violation']));
    expect(logs.some(text => text.includes('Injected Errors'))).toBe(true);
    expect(engine.getState().errorInjection.stats.errorsInjected).toBe(2);
  });

  it('handles UDS positive, negative, disabled, and malformed diagnostic paths', () => {
    const { engine, frames, logs } = createEngine();
    engine.addNode(makeNodeInput(1, { vitals: { ...DEFAULT_VITALS, heartRate: 88 } }));
    engine.setUDSConfig({
      ...engine.getState().udsConfig,
      stMinMs: 0,
      didResponses: [
        { id: 'hex', did: 0x1001, label: 'Hex', encoding: 'hex', value: '0A0B', enabled: true },
        { id: 'odd', did: 0x1002, label: 'Odd', encoding: 'hex', value: 'ABC', enabled: true },
        { id: 'vitals', did: 0x1003, label: 'Heart', encoding: 'vitals', value: 'heartRate', enabled: true },
        { id: 'ascii', did: 0x1004, label: 'Name', encoding: 'ascii', value: 'ECU', enabled: true },
        { id: 'disabled', did: 0x1005, label: 'Disabled', encoding: 'ascii', value: 'OFF', enabled: false },
      ],
      dtcCodes: [0x0a1200],
    });

    engine.sendCustomFrame(0x7e0, [0x02, 0x10, 0x03]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0x10, 0x01]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0x10, 0x02]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0x10, 0x03]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0x10, 0x04]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0x10, 0x05]);
    engine.sendCustomFrame(0x7e0, [0x01, 0x99]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x19, 0x01, 0xff]);
    engine.setUDSConfig({ ...engine.getState().udsConfig, autoRespond: false });
    engine.sendCustomFrame(0x7df, [0x02, 0x10, 0x01]);
    vi.runAllTimers();

    const ecuResponses = frames.filter(frame => frame.arbitrationId === 0x7e8);
    expect(ecuResponses.some(frame => frame.data.includes(0x50))).toBe(true);
    expect(ecuResponses.some(frame => frame.data.includes(0x62))).toBe(true);
    expect(ecuResponses.some(frame => frame.data[1] === 0x7f && frame.data[2] === 0x22)).toBe(true);
    expect(ecuResponses.some(frame => frame.data[1] === 0x7f && frame.data[2] === 0x99)).toBe(true);
    expect(ecuResponses.some(frame => frame.data[1] === 0x7f && frame.data[2] === 0x19)).toBe(true);
    expect(logs.some(text => text.includes('Diagnostic Session Control'))).toBe(true);
    expect(logs.some(text => text.includes('SID 0x99'))).toBe(true);
  });

  it('covers segmented ISO-TP requests, flow control, clear, and one-time injection paths', () => {
    const { engine, frames, patches, logs } = createEngine();
    engine.addNode(makeNodeInput(1));
    engine.addNode(makeNodeInput(2));

    engine.setErrorInjectionConfig({
      enabledTypes: { 'crc-corruption': true, 'form-error': true, 'ack-error': false, 'bit-stuffing': false },
      triggerMode: 'one-time',
      periodicEvery: 3,
      randomRate: 0,
    });
    engine.armOneTimeErrorInjection();
    engine.sendCustomFrame(0x123, [1, 2, 3]);
    expect(frames[frames.length - 1]?.errors).toEqual(expect.arrayContaining(['CRC Corruption', 'Form/Framing Error']));
    expect(engine.getState().errorInjection.oneTimeArmed).toBe(false);

    engine.setErrorInjectionConfig({
      enabledTypes: { 'crc-corruption': false, 'form-error': false, 'ack-error': true, 'bit-stuffing': false },
      triggerMode: 'periodic',
      periodicEvery: 2,
      randomRate: 0,
    });
    engine.sendCustomFrame(0x124, [1]);
    expect(frames[frames.length - 1]?.errors).toContain('ACK Error');
    engine.sendCustomFrame(0x125, [1]);
    expect(frames[frames.length - 1]?.errors).toEqual([]);

    engine.sendUDSRequest(0x7e0, [0x22, 0x10, 0x01, 0x10, 0x04, 0x10, 0x05, 0x10, 0x06, 0x10, 0x07]);
    vi.runAllTimers();
    expect(frames.some(frame => frame.data[0] === 0x30)).toBe(true);
    expect(logs.some(text => text.includes('ISO-TP'))).toBe(true);

    engine.sendCustomFrame(0x7e0, []);
    engine.sendCustomFrame(0x7e0, [0x30, 0x00, 0x00]);

    engine.clearFrames();
    expect(engine.getState()).toMatchObject({ recentFrames: [], frameCount: 0, errorCount: 0 });
    expect(patches.some(patch => patch.recentFrames && patch.frameCount === 0)).toBe(true);
  });

  it('auto-recovers noise bursts and covers diagnostic target fallbacks', () => {
    const { engine, faults, frames } = createEngine();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    engine.addNode(makeNodeInput(1, { vitals: { ...DEFAULT_VITALS, alarmFlags: 0x04 } }));
    engine.addNode(makeNodeInput(2));
    engine.injectFault(1, 'noise-burst');

    engine.start();
    vi.advanceTimersByTime(60);
    expect(frames[0].errors).toContain('Noise burst bit error');

    engine.injectFault(2, 'noise-burst');
    vi.advanceTimersByTime(3000);
    expect(engine.getState().nodes.find(node => node.id === 2)?.activeFault).toBeNull();
    expect(faults).toContain('2:recover');

    engine.setUDSConfig({ ...engine.getState().udsConfig, targetNodeId: 999 });
    engine.sendCustomFrame(0x7e1, [0x03, 0x22, 0xf1, 0x90]);
    vi.runOnlyPendingTimers();
    expect(frames.some(frame => frame.arbitrationId === 0x7e9 || frame.arbitrationId === 0x7e8)).toBe(true);
  });

  it('covers ISO-TP immediate, malformed, sequence-error, and reassembly branches', () => {
    const { engine, frames, logs } = createEngine();
    engine.addNode(makeNodeInput(1, { vitals: { ...DEFAULT_VITALS, heartRate: 72 } }));
    engine.setUDSConfig({
      ...engine.getState().udsConfig,
      didResponses: [
        { id: 'hr', did: 0x1001, label: 'Heart', encoding: 'vitals', value: 'heartRate', enabled: true },
      ],
      dtcCodes: [0x010203],
    });

    engine.sendCustomFrame(0x7e0, [0x10, 0x03, 0x22, 0x10, 0x01]);
    engine.sendCustomFrame(0x7e0, [0x02, 0x22]);
    engine.sendCustomFrame(0x7e0, [0x01, 0x19]);
    engine.sendCustomFrame(0x7e0, [0x10, 0x08, 0x22, 0x10, 0x01, 0x22, 0x10, 0x01]);
    engine.sendCustomFrame(0x7e0, [0x21, 0x22, 0x10]);
    engine.sendCustomFrame(0x7e0, [0x10, 0x08, 0x22, 0x10, 0x01, 0x22, 0x10, 0x01]);
    engine.sendCustomFrame(0x7e0, [0x22, 0x22, 0x10]);
    engine.sendUDSRequest(0x123, [0x10]);
    vi.runOnlyPendingTimers();

    expect(frames.some(frame => frame.data[1] === 0x7f && frame.data[2] === 0x22 && frame.data[3] === 0x13)).toBe(true);
    expect(frames.some(frame => frame.data[1] === 0x59)).toBe(true);
    expect(logs.some(text => text.includes('ISO-TP reassembled'))).toBe(true);
    expect(logs.some(text => text.includes('ISO-TP sequence error'))).toBe(true);
  });

  it('marks alarm frames when no other frame error exists', () => {
    const { engine, frames, logs } = createEngine();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    engine.addNode(makeNodeInput(1, {
      vitals: { ...DEFAULT_VITALS, temperature: 39, alarmFlags: 0 },
      sendIntervalMs: 10,
    }));

    engine.start();
    vi.advanceTimersByTime(60);

    expect(frames[0].errors).toContain('Alarm flags: 0x08');
    expect(logs.some(text => text.includes('alarm: flags=0x8'))).toBe(true);
  });
});

function makeNodeInput(id: number, patch: Record<string, unknown> = {}) {
  return {
    id,
    name: `Node ${id}`,
    profile: 'patient-monitor' as CANMedicalProfile,
    color: '#38bdf8',
    sendIntervalMs: 10,
    isActive: true,
    baseArbitrationId: 0x100 + id,
    ...patch,
  };
}
