export type ModbusFunctionCode =
  | 0x01 | 0x02 | 0x03 | 0x04
  | 0x05 | 0x06 | 0x0f | 0x10;

export const MODBUS_FC_LABELS: Record<number, string> = {
  0x01: 'Read Coils',
  0x02: 'Read Discrete Inputs',
  0x03: 'Read Holding Registers',
  0x04: 'Read Input Registers',
  0x05: 'Write Single Coil',
  0x06: 'Write Single Register',
  0x0f: 'Write Multiple Coils',
  0x10: 'Write Multiple Registers',
};

export interface ModbusFrame {
  deviceAddress: number;
  functionCode: number;
  data: number[];
  crc: number;
  raw: number[];
  isResponse: boolean;
  timestamp: number;
  error?: string;
}

export interface ModbusRegister {
  address: number;
  value: number;
  label?: string;
}

export interface ModbusCoil {
  address: number;
  value: boolean;
  label?: string;
}

export interface ModbusSlaveState {
  deviceAddress: number;
  holdingRegisters: ModbusRegister[];
  inputRegisters: ModbusRegister[];
  coils: ModbusCoil[];
  discreteInputs: ModbusCoil[];
}
