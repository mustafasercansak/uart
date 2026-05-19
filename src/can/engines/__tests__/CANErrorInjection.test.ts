import { describe, expect, it } from 'vitest';
import { CANSimulationEngine } from '../CANSimulationEngine';
import { INITIAL_CAN_STATE } from '../../store/canReducer';
import type { CANFrame } from '../../types/CANFrame';

describe('CAN error injection', () => {
  function createEngine() {
    const engine = new CANSimulationEngine(structuredClone(INITIAL_CAN_STATE));
    const frames: CANFrame[] = [];
    const logs: string[] = [];

    engine.onFrame = frame => frames.push(frame);
    engine.onLog = entry => logs.push(entry.text);

    return { engine, frames, logs };
  }

  it('injects armed protocol errors into outgoing CAN frames', () => {
    const { engine, frames, logs } = createEngine();

    engine.setErrorInjectionConfig({
      enabledTypes: {
        'crc-corruption': true,
        'form-error': true,
        'ack-error': false,
        'bit-stuffing': false,
      },
      triggerMode: 'one-time',
      periodicEvery: 5,
      randomRate: 20,
    });

    engine.armOneTimeErrorInjection();
    engine.sendCustomFrame(0x321, [0x01, 0x02, 0x03]);

    expect(frames).toHaveLength(1);
    expect(frames[0].errors).toContain('CRC Corruption');
    expect(frames[0].errors).toContain('Form/Framing Error');
    expect(logs.some(text => text.includes('Injected Errors'))).toBe(true);
    expect(engine.getState().errorInjection.stats).toEqual({
      totalPackets: 1,
      successfulPackets: 0,
      errorsInjected: 2,
    });
    expect(engine.getState().errorInjection.oneTimeArmed).toBe(false);
  });

  it('counts clean packets as successful when no injection is triggered', () => {
    const { engine, frames, logs } = createEngine();

    engine.sendCustomFrame(0x123, [0xaa]);

    expect(frames).toHaveLength(1);
    expect(frames[0].errors).toEqual([]);
    expect(logs.some(text => text.includes('Injected Errors'))).toBe(false);
    expect(engine.getState().errorInjection.stats).toEqual({
      totalPackets: 1,
      successfulPackets: 1,
      errorsInjected: 0,
    });
  });

  it('injects periodic errors based on packet count', () => {
    const { engine, frames } = createEngine();

    engine.setErrorInjectionConfig({
      enabledTypes: {
        'crc-corruption': false,
        'form-error': false,
        'ack-error': true,
        'bit-stuffing': false,
      },
      triggerMode: 'periodic',
      periodicEvery: 2,
      randomRate: 20,
    });

    engine.sendCustomFrame(0x100, [0x01]);
    engine.sendCustomFrame(0x101, [0x02]);
    engine.sendCustomFrame(0x102, [0x03]);

    expect(frames.map(frame => frame.errors)).toEqual([
      [],
      ['ACK Error'],
      [],
    ]);
    expect(engine.getState().errorInjection.stats).toEqual({
      totalPackets: 3,
      successfulPackets: 2,
      errorsInjected: 1,
    });
  });

  it('clears injection counters and one-time arming with frame history', () => {
    const { engine } = createEngine();

    engine.setErrorInjectionConfig({
      enabledTypes: {
        'crc-corruption': true,
        'form-error': false,
        'ack-error': false,
        'bit-stuffing': false,
      },
      triggerMode: 'one-time',
      periodicEvery: 5,
      randomRate: 20,
    });
    engine.armOneTimeErrorInjection();
    engine.sendCustomFrame(0x555, [0x05]);

    engine.armOneTimeErrorInjection();
    engine.clearFrames();

    expect(engine.getState().recentFrames).toEqual([]);
    expect(engine.getState().frameCount).toBe(0);
    expect(engine.getState().errorInjection.oneTimeArmed).toBe(false);
    expect(engine.getState().errorInjection.stats).toEqual({
      totalPackets: 0,
      successfulPackets: 0,
      errorsInjected: 0,
    });
  });
});
