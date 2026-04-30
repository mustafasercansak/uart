import type { PeripheralScriptResult } from '../types';

/**
 * Executes a user-provided script in a (relatively) safe sandbox.
 * The script has access to:
 * - input: number[] (the incoming bytes)
 * - state: Record<string, any> (the peripheral's persistent state)
 * - console: a custom logger
 */
export function executePeripheralScript(
  script: string,
  input: number[],
  state: Record<string, any>
): PeripheralScriptResult {
  try {
    // Create the execution context
    const context = {
      input,
      state: { ...state },
      output: [] as number[],
      logText: '',
      console: {
        log: (msg: any) => { context.logText += String(msg) + '\n'; }
      },
      // Utility for easier byte handling
      send: (bytes: number | number[]) => {
        if (Array.isArray(bytes)) context.output.push(...bytes);
        else context.output.push(bytes);
      }
    };

    // Construct the function
    // Use 'with' to make context properties available as globals in the script (optional but nice)
    // Note: We use a restricted set of globals
    const runner = new Function(
      'input', 'state', 'console', 'send',
      `"use strict";
       ${script}
       return { bytes: [], log: "" }; // Fallback
      `
    );

    // The script should return an object or we capture the context state
    // We expect the script to either return the result or use 'send' and update 'state'
    const result = runner(context.input, context.state, context.console, context.send);

    return {
      bytes: context.output.length > 0 ? context.output : (result?.bytes || []),
      log: context.logText || (result?.log || ''),
      nextState: context.state
    };
  } catch (error: any) {
    return {
      bytes: [],
      log: `Script Error: ${error.message}`,
      nextState: state // Keep old state on error
    };
  }
}
