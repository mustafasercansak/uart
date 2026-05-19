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
});
