import type { Field } from './field';

export type ProtocolType = 'UART' | 'SPI' | 'I2C' | 'CAN';

export interface PeripheralState {
  id: string;
  name: string;
  protocol: ProtocolType;
  address?: number;
  isEnabled: boolean;
  internalState: Record<string, unknown>;
}

export type Parity = 'None' | 'Even' | 'Odd' | 'Mark' | 'Space';
export type StopBits = 1 | 1.5 | 2;
export type FramingMode = 'fixed' | 'delimiter' | 'slip' | 'cobs' | 'modbus';

export interface FramingConfig {
  mode: FramingMode;
  delimiter?: number | number[];  // single byte or multi-byte sequence (e.g. [0x0D, 0x0A])
  header?: number[];
  footer?: number[];
}

export interface FrameProfile {
  id: string;
  name: string;
  description: string;
  baudRate: number;
  dataBits: number;
  parity: Parity;
  stopBits: StopBits;
  sendIntervalMs: number;
  fields: Field[];
  framing: FramingConfig;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}
