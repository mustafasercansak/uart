import type { ProtocolType } from './protocol';

export interface ScriptablePeripheral {
  id: string;
  name: string;
  protocol: ProtocolType;
  script: string; // The JS code
  initialState: Record<string, unknown>;
  lastExecution?: {
    timestamp: number;
    input: number[];
    output: number[];
    log: string;
    error?: string;
  };
  isActive: boolean;
}

export interface PeripheralScriptResult {
  bytes: number[];
  log: string;
  nextState: Record<string, unknown>;
}
