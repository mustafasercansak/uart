import { describe, it, expect } from 'vitest';
import { executePeripheralScript } from '../ScriptRunner';

describe('ScriptRunner', () => {
  it('should execute a simple script and return results', () => {
    const script = 'return { bytes: [1, 2, 3], log: "test log" };';
    const result = executePeripheralScript(script, [], {});

    expect(result.bytes).toEqual([1, 2, 3]);
    expect(result.log).toBe('test log');
  });

  it('should support the send function for single bytes and arrays', () => {
    const script = `
      send(10);
      send([20, 30]);
    `;
    const result = executePeripheralScript(script, [], {});

    expect(result.bytes).toEqual([10, 20, 30]);
  });

  it('should handle state modifications', () => {
    const script = `
      state.count = (state.count || 0) + 1;
      state.lastValue = input[0];
    `;
    const initialState = { count: 5 };
    const input = [42];
    const result = executePeripheralScript(script, input, initialState);

    expect(result.nextState.count).toBe(6);
    expect(result.nextState.lastValue).toBe(42);
    // Ensure original state is not modified (if it's handled by value)
    expect(initialState.count).toBe(5);
  });

  it('should capture console.log output', () => {
    const script = `
      console.log("Hello");
      console.log("World");
    `;
    const result = executePeripheralScript(script, [], {});

    expect(result.log).toBe('Hello\nWorld\n');
  });

  it('should provide access to input bytes', () => {
    const script = `
      if (input[0] === 0xAA) {
        send(0x55);
      }
    `;
    const result1 = executePeripheralScript(script, [0xAA], {});
    expect(result1.bytes).toEqual([0x55]);

    const result2 = executePeripheralScript(script, [0xBB], {});
    expect(result2.bytes).toEqual([]);
  });

  it('should handle runtime errors gracefully', () => {
    const script = 'throw new Error("Boom");';
    const result = executePeripheralScript(script, [], { key: 'value' });

    expect(result.bytes).toEqual([]);
    expect(result.log).toContain('Script Error: Boom');
    expect(result.nextState).toEqual({ key: 'value' });
  });

  it('should handle syntax errors', () => {
    const script = 'if (true {'; // Missing parenthesis
    const result = executePeripheralScript(script, [], {});

    expect(result.log).toContain('Script Error:');
    expect(result.bytes).toEqual([]);
  });

  it('should use default return if script returns nothing but uses send', () => {
    const script = 'send(1);';
    const result = executePeripheralScript(script, [], {});
    expect(result.bytes).toEqual([1]);
  });

  it('should use return value if send is not used', () => {
    const script = 'return { bytes: [5], log: "ret" };';
    const result = executePeripheralScript(script, [], {});
    expect(result.bytes).toEqual([5]);
    expect(result.log).toBe('ret');
  });
  
  it('should handle empty script', () => {
    const script = '';
    const result = executePeripheralScript(script, [], { x: 1 });
    expect(result.bytes).toEqual([]);
    expect(result.nextState).toEqual({ x: 1 });
  });

  it('should handle script returning null', () => {
    const script = 'return null;';
    const result = executePeripheralScript(script, [], {});
    expect(result.bytes).toEqual([]);
    expect(result.log).toBe('');
  });

  it('should handle script returning object without bytes or log', () => {
    const script = 'return {};';
    const result = executePeripheralScript(script, [], {});
    expect(result.bytes).toEqual([]);
    expect(result.log).toBe('');
  });
});
