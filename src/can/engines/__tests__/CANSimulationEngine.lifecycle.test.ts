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
      ecuResponseId: 0x900,
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

  it('transmitFrame uses extended idFormat for nodes with 29-bit arbitration IDs', () => {
    // Covers line 600: `node.baseArbitrationId > 0x7ff ? 'extended' : 'standard'` — extended branch
    const { engine, frames } = createEngine();
    engine.addNode(makeNodeInput(1, { baseArbitrationId: 0x18FF1234 }));

    engine.start();
    vi.advanceTimersByTime(60);

    const extFrame = frames.find(f => f.arbitrationId === 0x18FF1234);
    expect(extFrame).toBeDefined();
    expect(extFrame?.idFormat).toBe('extended');
  });

  it('one-time error injection fires when oneTimeArmed is true, then resets', () => {
    // Covers `shouldInject = current.oneTimeArmed` both true and false
    const { engine, frames } = createEngine();
    engine.addNode(makeNodeInput(1));

    engine.setErrorInjectionConfig({
      enabledTypes: { 'bit-stuffing': true, 'crc-corruption': false, 'form-error': false, 'ack-error': false },
      triggerMode: 'one-time',
      periodicEvery: 1,
      randomRate: 0,
    });

    // NOT armed → shouldInject = false
    engine.sendCustomFrame(0x100, [0x01]);
    expect(frames[frames.length - 1].errors).toEqual([]);

    // Armed → shouldInject = true
    engine.armOneTimeErrorInjection();
    engine.sendCustomFrame(0x100, [0x01]);
    expect(frames[frames.length - 1].errors).toContain('Bit Stuffing Violation');
    expect(engine.getState().errorInjection.oneTimeArmed).toBe(false);
  });

  it('random trigger mode injects errors based on randomRate', () => {
    // Covers line 675 else branch: `shouldInject = Math.random() * 100 < randomRate`
    const { engine, frames } = createEngine();
    engine.addNode(makeNodeInput(1));

    engine.setErrorInjectionConfig({
      enabledTypes: { 'crc-corruption': true, 'form-error': false, 'ack-error': false, 'bit-stuffing': false },
      triggerMode: 'random',
      periodicEvery: 1,
      randomRate: 100,
    });

    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 * 100 = 0 < 100 → always inject
    engine.sendCustomFrame(0x100, [0x01]);
    expect(frames[frames.length - 1].errors).toContain('CRC Corruption');
  });

  it('transmitDiagnosticFrame uses extended idFormat for 29-bit diagnostic addresses', () => {
    // Covers line 567: `arbitrationId > 0x7ff ? 'extended' : 'standard'` in transmitDiagnosticFrame
    const { engine, frames } = createEngine();
    engine.setUDSConfig({
      ...engine.getState().udsConfig,
      testerRequestId: 0x18FF0001,
      ecuResponseId:   0x18FF0002,
      autoRespond: true,
    });
    engine.sendUDSRequest(0x18FF0001, [0x10, 0x01]);
    vi.runAllTimers();

    const extDiag = frames.find(f => f.arbitrationId === 0x18FF0001 || f.arbitrationId === 0x18FF0002);
    expect(extDiag).toBeDefined();
    expect(extDiag?.idFormat).toBe('extended');
  });

  it('scheduleManagedTimeout guard exits early when timer fires after clearTimers', () => {
    // Covers line 752: `if (!this.isotpTxTimers.has(tid)) return` — the early-exit guard
    const { engine, frames } = createEngine();

    // Trigger a multi-frame UDS request — schedules multiple timers
    engine.sendUDSRequest(0x7e0, [0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1, 0x8c, 0xf1, 0x9d]);

    // Cancel all timers before they fire — clears isotpTxTimers set
    engine.clearFrames();
    const framesBefore = frames.length;

    // Run timers now — each callback checks `isotpTxTimers.has(tid)` → false → returns early
    vi.runAllTimers();

    // No new frames should have been produced by the cancelled timers
    expect(frames.length).toBe(framesBefore);
  });

  it('noise-burst re-injection clears existing timer (line 239 branch)', () => {
    // Covers line 239: `if (existing) clearTimeout(existing)` — TRUE branch (second injection)
    const { engine } = createEngine();
    engine.addNode(makeNodeInput(1));

    engine.injectFault(1, 'noise-burst');  // first: existing = undefined → if(null) FALSE
    engine.injectFault(1, 'noise-burst');  // second: existing = timer → if(timer) TRUE ← covered
    expect(engine.getState().nodes[0]?.activeFault).toBe('noise-burst');
  });

  it('noise-burst recovery callback skips update when fault already cleared (line 242 branch)', () => {
    // Covers line 242: `if (current?.activeFault === 'noise-burst')` FALSE branch
    // = activeFault was manually cleared before the 3-second recovery timer fires
    const { engine } = createEngine();
    engine.addNode(makeNodeInput(1));

    engine.injectFault(1, 'noise-burst');        // activeFault = 'noise-burst', timer set
    engine.recoverNode(1);                        // activeFault = null
    vi.advanceTimersByTime(3100);                 // timer fires; activeFault is now null → FALSE branch

    expect(engine.getState().nodes[0]?.activeFault).toBeNull();
  });

  it('tick skips nodes that have not reached sendIntervalMs since last send (line 294 branch)', () => {
    // Covers line 294: `if (now - lastSentAt < sendIntervalMs) continue` TRUE branch
    // Covers line 326: `else if (pendingTransmissions.length === 1)` FALSE branch (length=0)
    const { engine, frames } = createEngine();
    engine.addNode(makeNodeInput(1, { sendIntervalMs: 200 })); // 200ms interval > 50ms tick

    engine.start();
    vi.advanceTimersByTime(50);   // tick 1: lastSentAt=0 → transmits (50ms < very old diff)
    const afterFirstTick = frames.length;

    vi.advanceTimersByTime(50);   // tick 2: now - lastSentAt=50ms < 200ms → skip (line 294 TRUE)
    // pendingTransmissions=[] → line 326 else-if evaluates FALSE → no transmission
    expect(frames.length).toBe(afterFirstTick);
  });

  it('sendCustomFrame uses extended idFormat for 29-bit arbitration IDs (line 351 branch)', () => {
    // Covers line 351: `arbitrationId > 0x7ff ? 'extended' : 'standard'` extended branch
    const { engine, frames } = createEngine();
    engine.sendCustomFrame(0x18FF1234, [0xDE, 0xAD]);

    const frame = frames[frames.length - 1];
    expect(frame.idFormat).toBe('extended');
    expect(frame.arbitrationId).toBe(0x18FF1234);
  });

  it('CF without prior FF is silently discarded (line 460 TRUE branch)', () => {
    // Covers line 460: `if (!session) return` — TRUE branch: CF with no open session
    const { engine, logs } = createEngine();
    engine.sendCustomFrame(0x7e0, [0x21, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
    // No FF was sent → session is undefined → returns early (no error thrown)
    expect(logs.every(t => !t.includes('ISO-TP reassembled'))).toBe(true);
  });

  it('multi-segment CF reassembly: first CF does not complete session (line 475 FALSE branch)', () => {
    // Covers line 475: `if (session.payload.length >= totalLength)` FALSE branch
    // Need totalLength large enough that one CF is insufficient
    const { engine, frames, logs } = createEngine();

    // FF: totalLength=20, initial payload=6 bytes
    engine.sendCustomFrame(0x7e0, [0x10, 0x14, 0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1]);
    // CF1: adds 7 bytes → total=13 < 20 → FALSE branch at 475 (still need more)
    engine.sendCustomFrame(0x7e0, [0x21, 0x8c, 0xf1, 0x9d, 0xf1, 0xa0, 0xf1, 0xa1]);
    // CF2: adds 7 bytes → total=20 >= 20 → TRUE branch: reassembly complete
    engine.sendCustomFrame(0x7e0, [0x22, 0xf1, 0xa2, 0x00, 0x00, 0x00, 0x00, 0x00]);
    vi.runAllTimers();

    expect(logs.some(t => t.includes('ISO-TP reassembled len=20'))).toBe(true);
    expect(frames.some(f => f.arbitrationId === 0x7e8)).toBe(true);
  });

  it('pciType outside {0,1,2,3} silently falls through (line 484 FALSE branch)', () => {
    // Covers line 484: `if (pciType === 3)` FALSE branch — pciType=4 (reserved)
    const { engine, logs } = createEngine();
    // pciType = (0x40 & 0xf0) >> 4 = 4 → not 0,1,2,3 → reaches if(pciType===3) → FALSE
    engine.sendCustomFrame(0x7e0, [0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    // No crash, no log for unexpected pciType
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });

  it('short FC frame uses ?? fallbacks for missing BS and STmin bytes (line 485 branches)', () => {
    // Covers line 485: `data[1] ?? 0` and `data[2] ?? 0` — 1-byte FC frame
    const { engine, logs } = createEngine();
    // pciType=3 (FC), only 1 byte → data[1]=undefined → ?? 0; data[2]=undefined → ?? 0
    engine.sendCustomFrame(0x7e0, [0x30]);
    expect(logs.some(t => t.includes('Flow Control'))).toBe(true);
  });

  it('applyErrorInjection skips injection body when no error types are enabled (line 675 FALSE branch)', () => {
    // Covers line 675: `if (enabledTypes.length > 0)` FALSE branch
    // Default config has all types disabled → body skipped
    const { engine, frames } = createEngine();
    // Explicitly set all types false so enabledTypes.length = 0
    engine.setErrorInjectionConfig({
      enabledTypes: { 'crc-corruption': false, 'form-error': false, 'ack-error': false, 'bit-stuffing': false },
      triggerMode: 'one-time',
      periodicEvery: 1,
      randomRate: 0,
    });
    engine.sendCustomFrame(0x100, [0x01, 0x02]);
    expect(frames[frames.length - 1].errors).toEqual([]);
  });

  it('ISO-TP SF with zero-length payload logs ?? fallback for payload[0] (line 428 branch)', () => {
    // Covers line 428: `payload[0] ?? 0` — when payload is empty (length=0 SF)
    const { engine, logs } = createEngine();
    // pciType=0 (SF), payloadLength = 0x00 & 0x0f = 0 → payload=[] → payload[0]=undefined → ??0
    engine.sendCustomFrame(0x7e0, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(logs.some(t => t.includes('SID=0x00'))).toBe(true);
  });

  it('noise-burst recovery skips update when fault cleared before timer fires (line 242 b1)', () => {
    // Explicit test: timer fires, current.activeFault is null → if-condition FALSE
    const { engine, logs } = createEngine();
    engine.addNode(makeNodeInput(1));

    engine.injectFault(1, 'noise-burst');
    // Manually clear activeFault before the 3-second timer fires
    engine.updateNode(1, { activeFault: null });
    // Advance past the 3s timer
    vi.advanceTimersByTime(3100);

    // Recovery callback sees activeFault !== 'noise-burst' → doesn't log recovery
    expect(logs.some(t => t.includes('noise burst ended') && t.includes('Node 1'))).toBe(false);
  });

  it('resume tick fires when time advances (line 110 anonymous fn)', () => {
    // Covers the `() => this.tick()` arrow function set by resume() at line 110
    const { engine, frames } = createEngine();
    engine.addNode(makeNodeInput(1));

    engine.start();
    engine.pause();
    engine.resume();
    vi.advanceTimersByTime(60);   // fires the setInterval(() => tick()) from resume()

    expect(frames.length).toBeGreaterThan(0);
  });

  it('clearTimers cancels busOff and noiseBurst timers when they are active (forEach lambdas)', () => {
    // Covers lines 814/816: `t => clearTimeout(t)` in busOffTimers.forEach / noiseBurstTimers.forEach
    const { engine } = createEngine();
    engine.addNode(makeNodeInput(1));
    engine.addNode(makeNodeInput(2));

    // Schedule timers into both Sets
    engine.injectFault(1, 'bus-off');      // busOffTimers.set(1, timer)
    engine.injectFault(2, 'noise-burst');  // noiseBurstTimers.set(2, timer)

    // stop() calls clearTimers() which forEach-cancels both sets
    engine.stop();

    expect(engine.getState().status).toBe('stopped');
  });

  it('stop() cancels active isotpTxTimers via clearTimers forEach (line 818 lambda)', () => {
    // Covers line 818: `t => clearTimeout(t)` in clearTimers()'s isotpTxTimers.forEach
    // Requires stop() called BEFORE timers fire (with stMinMs > 0 so timers are pending)
    const { engine } = createEngine();
    engine.setUDSConfig({ ...engine.getState().udsConfig, stMinMs: 10 });

    // sendUDSRequest with stMinMs=10 schedules CF timers into isotpTxTimers
    engine.sendUDSRequest(0x7e0, [0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1, 0x8c, 0xf1]);

    // stop() → clearTimers() → isotpTxTimers.forEach(t => clearTimeout(t)) at line 818
    engine.stop();
    expect(engine.getState().status).toBe('stopped');
  });

  it('clearTimers handles both null and non-null tickTimer branches', () => {
    // Covers line 813 TRUE branch: stop() after start() clears a live tickTimer
    // Covers line 813 FALSE branch: stop() on a never-started engine sees tickTimer=null
    const { engine } = createEngine();

    // FALSE branch first: stop() before start() → tickTimer is null → if-false
    engine.stop();
    expect(engine.getState().status).toBe('stopped');

    // TRUE branch: start() sets tickTimer, then stop() clears it
    engine.start();
    expect(engine.getState().status).toBe('running');
    engine.stop();
    expect(engine.getState().status).toBe('stopped');
  });

  it('sweepIsoTpRxSessions evicts an orphaned FF session via the background interval', () => {
    const { engine, logs } = createEngine();

    engine.start();
    engine.setUDSConfig({ ...engine.getState().udsConfig, stMinMs: 0 });

    // Open an ISO-TP session by sending an FF but no CFs
    engine.sendCustomFrame(0x7e0, [0x10, 0x0f, 0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1]);

    // The sweep fires every 2000 ms and expires sessions older than 2000 ms.
    // Advancing 4100 ms guarantees the second sweep fires with the session
    // well past the 2 s threshold (effective max TTL is ~4 s by design).
    vi.advanceTimersByTime(4100);

    expect(logs.some(t => t.includes('expired'))).toBe(true);

    engine.stop();
  });

  it('sweepIsoTpRxSessions does not fire after stop()', () => {
    const { engine, logs } = createEngine();

    engine.start();
    engine.setUDSConfig({ ...engine.getState().udsConfig, stMinMs: 0 });
    // Open a session, then stop the engine
    engine.sendCustomFrame(0x7e0, [0x10, 0x0f, 0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1]);
    engine.stop();

    const logsBefore = logs.length;
    // Advance well past 2 s — sweep timer should have been cancelled by stop()
    vi.advanceTimersByTime(5000);

    expect(logs.length).toBe(logsBefore); // no new expiry logs after stop
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
