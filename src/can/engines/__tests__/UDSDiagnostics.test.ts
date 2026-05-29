import { describe, expect, it, vi } from 'vitest';
import { CANSimulationEngine } from '../CANSimulationEngine';
import { INITIAL_CAN_STATE } from '../../store/canReducer';
import type { CANFrame } from '../../types/CANFrame';

describe('UDS diagnostics over ISO-TP', () => {
  function createEngine() {
    const engine = new CANSimulationEngine(structuredClone(INITIAL_CAN_STATE));
    const frames: CANFrame[] = [];
    const logs: string[] = [];

    engine.onFrame = frame => frames.push(frame);
    engine.onLog = entry => logs.push(entry.text);
    engine.setUDSConfig({ ...engine.getState().udsConfig, stMinMs: 0 });

    return { engine, frames, logs };
  }

  it('segments multi-frame 0x22 responses and emits flow control', () => {
    vi.useFakeTimers();
    const { engine, frames } = createEngine();

    engine.sendUDSRequest(0x7e0, [0x22, 0xf1, 0x90]);
    vi.runAllTimers();

    const diagnosticFrames = frames.filter(frame => frame.arbitrationId === 0x7e0 || frame.arbitrationId === 0x7e8);
    expect(diagnosticFrames.map(frame => (frame.data[0] & 0xf0) >> 4)).toEqual([0, 1, 3, 2, 2]);
    expect(diagnosticFrames[1].data.slice(0, 5)).toEqual([0x10, 0x14, 0x62, 0xf1, 0x90]);

    vi.useRealTimers();
  });

  it('reassembles incoming multi-frame requests before responding', () => {
    vi.useFakeTimers();
    const { engine, frames, logs } = createEngine();

    engine.sendCustomFrame(0x7e0, [0x10, 0x09, 0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1]);
    engine.sendCustomFrame(0x7e0, [0x21, 0x20, 0xf1, 0x21, 0x00, 0x00, 0x00, 0x00]);
    vi.runAllTimers();

    expect(logs.some(text => text.includes('ISO-TP reassembled len=9'))).toBe(true);
    expect(frames.some(frame => frame.arbitrationId === 0x7e8 && (frame.data[0] & 0xf0) === 0x10)).toBe(true);

    vi.useRealTimers();
  });

  it('responds to 0x19 Read DTC Information with mock DTC data', () => {
    vi.useFakeTimers();
    const { engine, frames } = createEngine();

    engine.sendUDSRequest(0x7e0, [0x19, 0x02, 0xff]);
    vi.runAllTimers();

    const response = frames.find(frame => frame.arbitrationId === 0x7e8 && frame.data[2] === 0x59);
    expect(response?.data.slice(2, 5)).toEqual([0x59, 0x02, 0xff]);

    vi.useRealTimers();
  });

  it('discards a stale CF that arrives after the 2 s ISO-TP session timeout', () => {
    vi.useFakeTimers();
    const { engine, logs } = createEngine();

    // Start a multi-frame transfer (FF creates a session)
    engine.sendCustomFrame(0x7e0, [0x10, 0x0f, 0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1]);

    // Advance past the 2 s expiry window before sending the CF
    vi.advanceTimersByTime(2100);
    engine.sendCustomFrame(0x7e0, [0x21, 0x20, 0xf1, 0x8c, 0x00, 0x00, 0x00, 0x00]);

    expect(logs.some(t => t.includes('expired'))).toBe(true);

    vi.useRealTimers();
  });

  it('drops and logs an ISO-TP CF with an out-of-order sequence number', () => {
    vi.useFakeTimers();
    const { engine, logs } = createEngine();

    // FF opens a session expecting CF sequence 1
    engine.sendCustomFrame(0x7e0, [0x10, 0x0f, 0x22, 0xf1, 0x90, 0xf1, 0x97, 0xf1]);
    // Send CF with sequence 2 (wrong — expected 1)
    engine.sendCustomFrame(0x7e0, [0x22, 0x20, 0xf1, 0x8c, 0x00, 0x00, 0x00, 0x00]);

    expect(logs.some(t => t.includes('sequence error'))).toBe(true);

    vi.useRealTimers();
  });

  it('skips the ECU response when autoRespond is disabled', () => {
    vi.useFakeTimers();
    const { engine, frames } = createEngine();
    engine.setUDSConfig({ ...engine.getState().udsConfig, autoRespond: false });

    engine.sendUDSRequest(0x7e0, [0x10, 0x01]);
    vi.runAllTimers();

    // No ECU response frame should appear on 0x7e8
    expect(frames.some(f => f.arbitrationId === 0x7e8)).toBe(false);

    vi.useRealTimers();
  });

  it('returns NRC 0x11 for an unknown SID', () => {
    vi.useFakeTimers();
    const { engine, frames } = createEngine();

    engine.sendUDSRequest(0x7e0, [0xff]);
    vi.runAllTimers();

    // SF PCI is data[0] (length byte), so response starts at data[1]
    const nrc = frames.find(f => f.arbitrationId === 0x7e8 && f.data[1] === 0x7f);
    expect(nrc?.data.slice(1, 4)).toEqual([0x7f, 0xff, 0x11]);

    vi.useRealTimers();
  });

  it('discards a First Frame with totalLength=0', () => {
    // Covers lines 436-437: the totalLength === 0 guard
    vi.useFakeTimers();
    const { engine, logs } = createEngine();

    // data[0] = 0x10 (FF PCI), data[1] = 0x00 → totalLength = 0
    engine.sendCustomFrame(0x7e0, [0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    vi.runAllTimers();

    expect(logs.some(t => t.includes('totalLength=0'))).toBe(true);

    vi.useRealTimers();
  });

  it('processes a short First Frame directly without opening a session', () => {
    vi.useFakeTimers();
    const { engine, logs } = createEngine();

    // totalLength = 3; payload.length (3) >= totalLength (3) → short-FF path
    engine.sendCustomFrame(0x7e0, [0x10, 0x03, 0x22, 0xf1, 0x90, 0x00, 0x00, 0x00]);
    vi.runAllTimers();

    expect(logs.some(t => t.includes('FF (short)'))).toBe(true);

    vi.useRealTimers();
  });

  it('responds to SID 0x11 ECU Reset with explicit subFunction and schedules node recovery', () => {
    // Covers lines 500-502: SID 0x11 handler
    //   • line 500: `payload[1] ?? 0x01` left side (payload[1]=0x01 defined)
    //   • line 501: `response = [0x51, subFunction]`
    //   • line 502: `if (targetNode)` FALSE (no nodes in engine)
    vi.useFakeTimers();
    const { engine, frames } = createEngine();

    engine.sendUDSRequest(0x7e0, [0x11, 0x01]);
    vi.runAllTimers();

    const response = frames.find(f => f.arbitrationId === 0x7e8 && f.data[1] === 0x51);
    expect(response).toBeDefined();
    expect(response?.data[2]).toBe(0x01);

    vi.useRealTimers();
  });

  it('uses ?? fallback for SID 0x11 subFunction when payload has no second byte', () => {
    // Covers line 500: `payload[1] ?? 0x01` right side (payload[1] is undefined)
    vi.useFakeTimers();
    const { engine, frames } = createEngine();

    engine.sendUDSRequest(0x7e0, [0x11]);  // no subFunction byte
    vi.runAllTimers();

    const response = frames.find(f => f.arbitrationId === 0x7e8 && f.data[1] === 0x51);
    expect(response).toBeDefined();
    expect(response?.data[2]).toBe(0x01);  // fallback subFunction = 0x01

    vi.useRealTimers();
  });

  it('schedules node recovery when targetNode is present for SID 0x11', () => {
    // Covers line 502: `if (targetNode)` TRUE branch — requires nodes in engine
    vi.useFakeTimers();
    const engine = new CANSimulationEngine(structuredClone(INITIAL_CAN_STATE));
    const frames: CANFrame[] = [];
    engine.onFrame = f => frames.push(f);
    engine.setUDSConfig({ ...engine.getState().udsConfig, stMinMs: 0 });

    // Add a node so getDiagnosticTargetNode(0x7e0) returns nodes[0]
    engine.addNode({ id: 1, name: 'ECU', profile: 'vital-monitor', color: '#fff', sendIntervalMs: 100, isActive: true, baseArbitrationId: 0x180 });

    engine.sendUDSRequest(0x7e0, [0x11, 0x01]);
    vi.runAllTimers();

    const response = frames.find(f => f.arbitrationId === 0x7e8 && f.data[1] === 0x51);
    expect(response).toBeDefined();

    vi.useRealTimers();
  });
});
