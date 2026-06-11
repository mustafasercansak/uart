import { Exchange, FrameProfile } from '../types';
import { parseFrame } from './FrameParser';

/**
 * Wireshark-style Universal Filter Engine
 * Supports expressions like:
 *   bpm > 100
 *   status == error
 *   size < 20 && id == 0x01
 *   data contains "FF 00"
 */

export type FilterResult = {
  isValid: boolean;
  error?: string;
};

export class FilterEngine {
  /**
   * Validates if a filter string is syntactically correct.
   */
  static validate(filter: string): FilterResult {
    try {
      if (!filter || filter.trim() === '') return { isValid: true };

      // Plain text/hex quick-search: no operators → always valid
      if (!/[=><!&|]/.test(filter) && !filter.toLowerCase().includes('contains')) {
        return { isValid: true };
      }

      // Advanced expression: check tokens
      const tokens = filter.split(/\s+/);
      const invalidTokens = tokens.filter(t =>
        !/^[a-zA-Z0-9._:_\-]+$/.test(t) &&
        !/^==|!=|>=|<=|>|<|&&|\|\||contains|matches|!$/.test(t) &&
        !/^".*"$/.test(t) &&
        !/^0x[0-9a-fA-F]+$/.test(t) &&
        !/^[0-9.]+$/.test(t)
      );

      if (invalidTokens.length > 0 && !filter.includes('"')) {
        return { isValid: false, error: `Invalid token: ${invalidTokens[0]}` };
      }

      return { isValid: true };
    } catch (_e) {
      return { isValid: false };
    }
  }

  private static hexToAscii(hex: string): string {
    return hex.split(' ').filter(Boolean).map(h => {
      const b = parseInt(h, 16);
      return b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
    }).join('');
  }

  /**
   * Evaluates an exchange against a filter string.
   */
  static evaluate(exchange: Exchange, filter: string, profile?: FrameProfile): boolean {
    if (!filter || filter.trim() === '') return true;

    try {
      const normalizedFilter = filter.toLowerCase().trim();

      // Quick search (no operators): match hex bytes OR ASCII text
      const keywords = ['error', 'err', 'tx', 'rx'];
      if (!/[=><!&|]/.test(normalizedFilter) && !normalizedFilter.includes('contains') && !keywords.includes(normalizedFilter)) {
          const txRaw = exchange.tx?.rawHex || '';
          const rxRaw = exchange.rx?.rawHex || '';
          const txHex = txRaw.replace(/\s+/g, '').toLowerCase();
          const rxHex = rxRaw.replace(/\s+/g, '').toLowerCase();
          const txAscii = this.hexToAscii(txRaw).toLowerCase();
          const rxAscii = this.hexToAscii(rxRaw).toLowerCase();
          const searchHex = normalizedFilter.replace(/\s+/g, '');
          const searchText = normalizedFilter;
          return txHex.includes(searchHex) || rxHex.includes(searchHex) ||
                 txAscii.includes(searchText) || rxAscii.includes(searchText);
      }

      // Advanced Expression Parsing
      // We'll split by logical AND/OR first
      const orParts = normalizedFilter.split('||');
      
      return orParts.some(orPart => {
          const andParts = orPart.split('&&');
          return andParts.every(andPart => this.evaluateCondition(exchange, andPart.trim(), profile));
      });

    } catch (err) {
      console.error('Filter evaluation error:', err);
      return true; // Fallback to show all on error
    }
  }

  private static evaluateCondition(exchange: Exchange, condition: string, profile?: FrameProfile): boolean {
    const operators = ['==', '!=', '>=', '<=', '>', '<', 'contains'] as const;
    type FilterOperator = typeof operators[number];
    let operator: FilterOperator | null = null;
    let left = '';
    let right = '';

    for (const op of operators) {
        // Prefer space-delimited match to avoid false positives when an operator
        // string appears inside a value (e.g. `data contains 0x==FF` must not
        // match `==` before `contains`).
        const withSpaces = ` ${op} `;
        const spaceIdx = condition.indexOf(withSpaces);
        if (spaceIdx !== -1) {
            operator = op;
            left = condition.slice(0, spaceIdx).trim();
            // Use everything after the operator so the value can contain the op string.
            right = condition.slice(spaceIdx + withSpaces.length).trim();
            break;
        }
        // Symbolic operators may appear without spaces (e.g. `id==5`).
        // 'contains' is a word and requires spaces — skip the bare fallback for it.
        if (op !== 'contains' && condition.includes(op)) {
            operator = op;
            const sepIdx = condition.indexOf(op);
            left = condition.slice(0, sepIdx).trim();
            right = condition.slice(sepIdx + op.length).trim();
            break;
        }
    }

    if (!operator) {
        // Handle unary ! or simple existence
        if (condition.startsWith('!')) {
            return !this.evaluateCondition(exchange, condition.substring(1).trim(), profile);
        }
        
        // Special Keywords
        if (condition === 'error' || condition === 'err') {
            return (exchange.tx?.status === 'fail' || exchange.rx?.status === 'fail') && !exchange.isLoopbackMatch;
        }
        if (condition === 'tx') return !!exchange.tx;
        if (condition === 'rx') return !!exchange.rx;

        // Simple field existence or value search
        return !!exchange.tx?.rawHex.toLowerCase().includes(condition) || 
               !!exchange.rx?.rawHex.toLowerCase().includes(condition);
    }

    // Get value of the left side (field)
    const val = this.getFieldValue(exchange, left, profile);
    if (val === undefined) return false;

    // Parse the right side
    const target = right.startsWith('0x') ? parseInt(right, 16) : right;
    const targetNum = typeof target === 'string' ? parseFloat(target) : target;

    switch (operator) {
        case '==': return val == target || (typeof val === 'string' && val.toLowerCase() === right.toLowerCase());
        case '!=': return val != target;
        case '>': return Number(val) > Number(targetNum);
        case '<': return Number(val) < Number(targetNum);
        case '>=': return Number(val) >= Number(targetNum);
        case '<=': return Number(val) <= Number(targetNum);
        case 'contains': {
            const sVal = String(val).toLowerCase().replace(/\s+/g, '');
            const sTarget = String(right).toLowerCase().replace(/[ "']+/g, '').replace(/\s+/g, '');
            return sVal.includes(sTarget);
        }
    }
  }

  private static getFieldValue(exchange: Exchange, fieldName: string, profile?: FrameProfile): string | number | boolean | undefined {
    const entry = exchange.tx || exchange.rx;
    if (!entry) return undefined;

    // Standard Fields
    switch (fieldName) {
        case 'id': return exchange.id;
        case 'src': return exchange.tx ? 'tx' : 'rx';
        case 'size': return entry.rawHex.split(' ').length;
        case 'len': return entry.rawHex.split(' ').length;
        case 'status': return entry.status || 'ok';
        case 'latency': return exchange.latencyMs || 0;
        case 'data': return entry.rawHex;
        case 'hex': return entry.rawHex;
    }

    // Profile Fields (Requires Parsing)
    if (profile) {
        const bytes = entry.rawHex.split(' ').map(h => parseInt(h, 16));
        const parsed = parseFrame(profile, bytes);
        if (parsed) {
            const field = parsed.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
            if (field) return field.decimal;
            
            // Search in flags
            for (const f of parsed) {
                if (f.flags && f.flags[fieldName]) {
                    return f.flags[fieldName];
                }
            }
        }
    }

    return undefined;
  }
}

