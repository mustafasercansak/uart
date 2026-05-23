import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANSimulationEngine } from '../CANSimulationEngine';
import { INITIAL_CAN_STATE } from '../../store/canReducer';
import type { CANBusState, CANLogEntry, CANFaultEvent } from '../../types/CANBusState';
import type { CANFrame } from '../../types/CANFrame';
import type { CANNode } from '../../types/CANNode';

const baseNode = (id: number, patch: Partial<CANNode> = {}) => ({
  id,
  name: `Node ${id}`,
  profile: 'custom' as const,
  color: '',
  sendIntervalMs: 50,
  isActive: true,
  baseArbitrationId: 0x100 + id,
  ...patch,
});

const createEngine = (patch: Partial<CANBusState> = {}) => {
  const engine = new CANSimulationEngine({ ...structuredClone(INITIAL_CAN_STATE), ...patch });
  const frames: CANFrame[] = [];
  const logs: CANLogEntry[] = [];
  const patches: Partial<CANBusState>[] = [];
  const faults: CANFaultEvent[] = [];
  engine.onFrame = frame => frames.push(frame);
  engine.onLog = entry => logs.push(entry);
  engine.onStateUpdate = update => patches.push(update);
  engine.onFaultEvent = event => faults.push(event);
  return { engine, frames, logs, patches, faults };
};

describe('CANSimulationEngine coverage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs lifecycle methods, emits state updates, and ignores invalid pause/resume transitions', () => {
    vi.useFakeTimers();
    const { engine, patches, logs } = createEngine();

    engine.pause();
    expect(engine.getState().status).toBe('stopped');
    engine.stop();
    expect(engine.getState().status).toBe('stopped');

    engine.start();
    engine.start();
    expect(engine.getState().status).toBe('running');
    expect(patches.some(patch => patch.status === 'running')).toBe(true);

    engine.pause();
    engine.pause();
    expect(engine.getState().status).toBe('paused');

    engine.resume();
    engine.resume();
    expect(engine.getState().status).toBe('running');

    engine.stop();
    expect(engine.getState()).toMatchObject({ status: 'stopped', startedAt: null, elapsedMs: 0 });
    expect(logs.length).toBeGreaterThanOrEqual(4);
  });

  it('adds, updates, removes nodes, sets baud rate, and clamps UDS configuration', () => {
    const { engine, patches, logs } = createEngine();

    engine.addNode(baseNode(1, { color: undefined }));
    engine.updateNode(1, { name: 'Updated', isActive: false });
    engine.setBaudRate(1000);
    engine.setUDSConfig({
      ...engine.getState().udsConfig,
      testerRequestId: -20,
      ecuResponseId: 0xffff,
      blockSize: 999,
      stMinMs: 999,
      didResponses: [{ id: 'bad', did: 0x1ffff, label: 'Bad', encoding: 'hex', value: 'AA', enabled: true }],
      dtcCodes: [-1, 0xffffff + 1],
    });

    expect(engine.getState().nodes[0]).toMatchObject({ name: 'Updated', color: '#94a3b8', isActive: false });
    expect(engine.getState().baudRate).toBe(1000);
    expect(engine.getState().udsConfig).toMatchObject({
      testerRequestId: 0,
      ecuResponseId: 0x7ff,
      blockSize: 255,
      stMinMs: 127,
      didResponses: [expect.objectContaining({ did: 0xffff })],
      dtcCodes: [0, 0xffffff],
    });

    engine.removeNode(1);
    expect(engine.getState().nodes).toEqual([]);
    expect(patches.some(patch => patch.nodes)).toBe(true);
    expect(logs.some(entry => entry.text.includes('Baud rate set'))).toBe(true);
  });

  it('injects and recovers clinical, freeze, bus-off, and noise-burst faults', () => {
    vi.useFakeTimers();
    const { engine, faults, logs } = createEngine();
    engine.addNode(baseNode(1));
    engine.addNode(baseNode(2));
    engine.addNode(baseNode(3));
    engine.addNode(baseNode(4));

    engine.injectFault(99, 'freeze');
    engine.recoverNode(99);
    expect(faults).toEqual([]);

    engine.injectFault(1, 'bradycardia');
    expect(engine.getState().nodes[0].activeFault).toBe('bradycardia');

    engine.injectFault(2, 'freeze');
    expect(engine.getState().nodes[1]).toMatchObject({ isActive: false, activeFault: 'freeze' });

    engine.injectFault(3, 'bus-off');
    expect(engine.getState().nodes[2]).toMatchObject({ state: 'bus-off', activeFault: 'bus-off' });

    engine.injectFault(4, 'noise-burst');
    engine.injectFault(4, 'noise-burst');
    expect(engine.getState().nodes[3].activeFault).toBe('noise-burst');

    vi.advanceTimersByTime(3000);
    expect(engine.getState().nodes[3].activeFault).toBeNull();

    engine.recoverNode(2);
    expect(engine.getState().nodes[1]).toMatchObject({ isActive: true, state: 'error-active', activeFault: null });
    expect(faults.map(event => event.fault)).toEqual(['bradycardia', 'freeze', 'bus-off', 'noise-burst', 'noise-burst', 'recover', 'recover']);
    expect(logs.some(entry => entry.text.includes('noise burst ended'))).toBe(true);
  });

  it('normalizes custom frames, routes diagnostics only for diagnostic IDs, and handles malformed ISO-TP frames', () => {
    const { engine, frames, logs } = createEngine();

    engine.sendCustomFrame(0x321, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(frames[0]).toMatchObject({ arbitrationId: 0x321, dlc: 8, data: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(logs.some(entry => entry.text.includes('ISO-TP'))).toBe(false);

    engine.sendCustomFrame(0x7e0, []);
    engine.sendCustomFrame(0x7e0, [0x30, 0x00, 0x00]);
    engine.sendCustomFrame(0x7e0, [0x21, 0x00]);
    expect(logs.some(entry => entry.text.includes('Flow Control'))).toBe(true);
  });

  it('covers UDS response variants and disabled auto-response', () => {
    const { engine, frames, logs } = createEngine();
    engine.addNode(baseNode(1));
    engine.setUDSConfig({
      ...engine.getState().udsConfig,
      autoRespond: false,
      didResponses: [
        { id: 'odd-hex', did: 0xf122, label: 'Odd Hex', encoding: 'hex', value: 'ABC', enabled: true },
      ],
    });

    engine.sendCustomFrame(0x7e0, [0x02, 0x10, 0x01]);
    expect(frames.some(frame => frame.arbitrationId === 0x7e8)).toBe(false);

    engine.setUDSConfig({
      ...engine.getState().udsConfig,
      autoRespond: true,
      targetNodeId: 99,
      didResponses: [
        { id: 'odd-hex', did: 0xf122, label: 'Odd Hex', encoding: 'hex', value: 'ABC', enabled: true },
        { id: 'good-hex', did: 0xf123, label: 'Good Hex', encoding: 'hex', value: 'DE AD', enabled: true },
        { id: 'missing-vital', did: 0xf124, label: 'Missing Vital', encoding: 'vitals', value: 'notAField', enabled: true },
        { id: 'ascii', did: 0xf125, label: 'Ascii', encoding: 'ascii', value: 'OK', enabled: true },
      ],
    });

    engine.sendCustomFrame(0x7e1, [0x02, 0x10, 0x03]);
    engine.sendCustomFrame(0x7e0, [0x01, 0x99]);
    engine.sendCustomFrame(0x7e0, [0x02, 0x22, 0xf1]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0xf1, 0x99]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0xf1, 0x22]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0xf1, 0x23]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0xf1, 0x24]);
    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0xf1, 0x25]);
    engine.sendCustomFrame(0x7e0, [0x02, 0x19, 0x01]);
    engine.sendCustomFrame(0x7e0, [0x01, 0x10]);
    engine.sendCustomFrame(0x7e0, [0x01, 0x19]);

    const responsePayloads = frames
      .filter(frame => frame.nodeId === -2)
      .map(frame => frame.data.slice(0, 8));
    expect(responsePayloads).toEqual(expect.arrayContaining([
      [0x06, 0x50, 0x03, 0x00, 0x32, 0x01, 0xf4, 0x00],
      [0x03, 0x7f, 0x99, 0x11, 0x00, 0x00, 0x00, 0x00],
      [0x03, 0x7f, 0x22, 0x13, 0x00, 0x00, 0x00, 0x00],
      [0x03, 0x7f, 0x22, 0x31, 0x00, 0x00, 0x00, 0x00],
      [0x05, 0x62, 0xf1, 0x23, 0xde, 0xad, 0x00, 0x00],
      [0x05, 0x62, 0xf1, 0x24, 0x00, 0x00, 0x00, 0x00],
      [0x05, 0x62, 0xf1, 0x25, 0x4f, 0x4b, 0x00, 0x00],
      [0x03, 0x7f, 0x19, 0x12, 0x00, 0x00, 0x00, 0x00],
    ]));
    expect(logs.some(entry => entry.text.includes('SID 0x99'))).toBe(true);
  });

  it('handles complete first frames and ISO-TP sequence errors', () => {
    const { engine, frames, logs } = createEngine();

    engine.sendCustomFrame(0x7e0, [0x10, 0x03, 0x10, 0x01, 0x00]);
    expect(frames.some(frame => frame.arbitrationId === 0x7e8 && frame.data[0] === 0x30)).toBe(true);
    expect(frames.some(frame => frame.arbitrationId === 0x7e8 && frame.data[1] === 0x50)).toBe(true);

    engine.sendCustomFrame(0x7e0, [0x10, 0x09, 0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1]);
    engine.sendCustomFrame(0x7e0, [0x22, 0x20, 0xf1, 0x21]);
    engine.sendCustomFrame(0x7e0, [0x30]);

    expect(logs.some(entry => entry.text.includes('ISO-TP sequence error'))).toBe(true);
    expect(logs.some(entry => entry.text.includes('BS=0 STmin=0ms'))).toBe(true);
  });

  it('uses default UDS response IDs and target node fallback for non-standard request IDs', () => {
    vi.useFakeTimers();
    const { engine, frames, logs } = createEngine();
    engine.addNode(baseNode(1));

    engine.sendUDSRequest(0x123, [0x10, 0x01]);
    vi.runAllTimers();

    expect(frames.some(frame => frame.arbitrationId === 0x123 && frame.nodeId === -1)).toBe(true);
    expect(frames.some(frame => frame.arbitrationId === engine.getState().udsConfig.ecuResponseId && frame.nodeId === -2)).toBe(true);
    expect(logs.some(entry => entry.text.includes('request on 0x123'))).toBe(true);
  });

  it('covers random error injection and disabled injection branches', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const { engine, frames } = createEngine();

    engine.setErrorInjectionConfig({
      enabledTypes: {
        'crc-corruption': false,
        'form-error': false,
        'ack-error': false,
        'bit-stuffing': true,
      },
      triggerMode: 'random',
      periodicEvery: 0,
      randomRate: 100,
    });
    engine.sendCustomFrame(0x120, [0xaa]);
    expect(frames[0].errors).toEqual(['Bit Stuffing Violation']);

    engine.setErrorInjectionConfig({
      enabledTypes: {
        'crc-corruption': false,
        'form-error': false,
        'ack-error': false,
        'bit-stuffing': false,
      },
      triggerMode: 'random',
      periodicEvery: 1,
      randomRate: 100,
    });
    engine.sendCustomFrame(0x121, [0xbb]);
    expect(frames[1].errors).toEqual([]);
    randomSpy.mockRestore();
  });

  it('ticks active nodes, arbitrates simultaneous sends, records alarms, and updates bus load/FPS', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const { engine, frames, logs, patches } = createEngine();
    engine.addNode(baseNode(1, { baseArbitrationId: 0x120 }));
    engine.addNode(baseNode(2, {
      baseArbitrationId: 0x110,
      vitals: {
        heartRate: 72,
        spO2: 80,
        systolicBP: 120,
        diastolicBP: 80,
        temperature: 36.6,
        respiratoryRate: 16,
        etCO2: 38,
        alarmFlags: 0x02,
      },
    }));

    engine.start();
    vi.advanceTimersByTime(1050);
    engine.stop();

    expect(frames.length).toBeGreaterThan(0);
    expect(engine.getState().arbitrationEvents.length).toBeGreaterThan(0);
    expect(logs.some(entry => entry.type === 'arbitration')).toBe(true);
    expect(logs.some(entry => entry.type === 'alarm')).toBe(true);
    expect(patches.some(patch => typeof patch.framesPerSecond === 'number')).toBe(true);
    expect(patches.some(patch => typeof patch.busLoadPercent === 'number')).toBe(true);
  });

  it('marks active noise-burst frames as errors during ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const { engine, frames } = createEngine();
    engine.addNode(baseNode(1, {
      vitals: {
        heartRate: 72,
        spO2: 80,
        systolicBP: 120,
        diastolicBP: 80,
        temperature: 36.6,
        respiratoryRate: 16,
        etCO2: 38,
        alarmFlags: 0x02,
      },
    }));
    engine.injectFault(1, 'noise-burst');

    engine.start();
    vi.advanceTimersByTime(60);
    engine.stop();

    expect(frames.some(frame => frame.errors.includes('Noise burst bit error'))).toBe(true);
    expect(engine.getState().errorCount).toBeGreaterThan(0);
    randomSpy.mockRestore();
  });

  it('encodes existing vital DIDs and logs injected node-frame errors with node IDs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const { engine, frames, logs } = createEngine();
    engine.addNode(baseNode(1));
    engine.setUDSConfig({
      ...engine.getState().udsConfig,
      targetNodeId: 1,
      didResponses: [
        { id: 'heart-rate', did: 0xf120, label: 'Heart Rate', encoding: 'vitals', value: 'heartRate', enabled: true },
      ],
    });

    engine.sendCustomFrame(0x7e0, [0x03, 0x22, 0xf1, 0x20]);
    expect(frames.some(frame => frame.data.slice(0, 6).join(',') === [0x05, 0x62, 0xf1, 0x20, 0x02, 0xd0].join(','))).toBe(true);

    engine.setErrorInjectionConfig({
      enabledTypes: {
        'crc-corruption': false,
        'form-error': true,
        'ack-error': false,
        'bit-stuffing': false,
      },
      triggerMode: 'one-time',
      periodicEvery: 1,
      randomRate: 0,
    });
    engine.armOneTimeErrorInjection();
    engine.start();
    vi.advanceTimersByTime(60);
    engine.stop();

    expect(logs.some(entry => entry.type === 'error' && entry.nodeId === 1)).toBe(true);
  });
});
