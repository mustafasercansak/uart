import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualPeripheralEngine } from '../VirtualPeripheralEngine';

describe('VirtualPeripheralEngine', () => {
  let engine: VirtualPeripheralEngine;

  beforeEach(() => {
    engine = new VirtualPeripheralEngine();
  });

  describe('VentilatorDriver', () => {
    it('should set respiratory rate (RR) when receiving 0x20 command', () => {
      const input = [0x20, 25]; // Command 0x20, Value 25
      const responses = engine.processIncoming('UART', input);
      
      expect(responses).toHaveLength(1);
      expect(responses[0].bytes).toEqual([0x06]); // ACK
      expect(responses[0].log).toContain('25 BPM');
    });

    it('should respond to self-test command 0x25', () => {
      const input = [0x25];
      const responses = engine.processIncoming('UART', input);
      
      expect(responses).toHaveLength(1);
      expect(responses[0].bytes).toEqual([0x06]);
      expect(responses[0].log).toContain('Tamam');
    });
  });

  describe('InfusionPumpDriver', () => {
    it('should respond to bolus command 0x10', () => {
      const input = [0x10];
      const responses = engine.processIncoming('UART', input);
      expect(responses[0].log).toContain('Bolus');
    });
  });
});
