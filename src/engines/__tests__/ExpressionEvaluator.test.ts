import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '../ExpressionEvaluator';

describe('ExpressionEvaluator', () => {
  const mockFields = {
    'BPM': 75,
    'SPO2': 98,
    'Temp': 37
  };

  it('evaluates basic math operations', () => {
    expect(evaluateExpression('10 + 20', {}, 0, 100)).toBe(30);
    expect(evaluateExpression('5 * 2', {}, 0, 100)).toBe(10);
    expect(evaluateExpression('100 / 4', {}, 0, 100)).toBe(25);
  });

  it('handles field references', () => {
    expect(evaluateExpression("fields['BPM'] + 10", mockFields, 0, 200)).toBe(85);
    expect(evaluateExpression('fields["SPO2"]', mockFields, 0, 100)).toBe(98);
  });

  it('respects clamping boundaries', () => {
    expect(evaluateExpression("fields['BPM'] * 10", mockFields, 0, 100)).toBe(100);
    expect(evaluateExpression("fields['Temp'] - 50", mockFields, 0, 100)).toBe(0);
  });

  it('handles rounded results', () => {
    expect(evaluateExpression('10.7', {}, 0, 20)).toBe(11);
    expect(evaluateExpression('10.4', {}, 0, 20)).toBe(10);
  });

  it('supports Math functions', () => {
    expect(evaluateExpression('Math.pow(2, 3)', {}, 0, 100)).toBe(8);
    expect(evaluateExpression('Math.sqrt(16)', {}, 0, 100)).toBe(4);
  });

  it('returns clampMin on invalid expression', () => {
    expect(evaluateExpression('invalid + logic', {}, 10, 100)).toBe(10);
  });

  it('covers missing branches (unknown fields, non-numeric, catch)', () => {
    // Unknown field reference
    expect(evaluateExpression("fields['UNKNOWN']", mockFields, 5, 100)).toBe(5);
    
    // Non-numeric/NaN results
    expect(evaluateExpression("'not a number'", {}, 7, 100)).toBe(7);
    expect(evaluateExpression("NaN", {}, 8, 100)).toBe(8);
    
    // Explicit throw in expression
    expect(evaluateExpression("(function(){throw 'err'})()", {}, 9, 100)).toBe(9);
  });
});
