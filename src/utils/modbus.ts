import type { ModbusFrame, ModbusSlaveState } from '../types/protocols/modbus';

export function crc16Modbus(buf: number[]): number {
  let crc = 0xffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xa001;
      else crc >>= 1;
    }
  }
  return crc;
}

export function buildModbusRequest(
  deviceAddress: number,
  functionCode: number,
  startAddress: number,
  value: number,
): ModbusFrame {
  const payload: number[] = [deviceAddress, functionCode];

  // startAddress high/low
  payload.push((startAddress >> 8) & 0xff, startAddress & 0xff);

  if (functionCode === 0x05) {
    // Write Single Coil: 0xFF00 = ON, 0x0000 = OFF
    const coilVal = value ? 0xff00 : 0x0000;
    payload.push((coilVal >> 8) & 0xff, coilVal & 0xff);
  } else if (functionCode === 0x06) {
    // Write Single Register
    payload.push((value >> 8) & 0xff, value & 0xff);
  } else {
    // Read functions: quantity
    payload.push((value >> 8) & 0xff, value & 0xff);
  }

  const crc = crc16Modbus(payload);
  payload.push(crc & 0xff, (crc >> 8) & 0xff);

  return {
    deviceAddress,
    functionCode,
    data: payload.slice(2, -2),
    crc,
    raw: payload,
    isResponse: false,
    timestamp: Date.now(),
  };
}

export function buildModbusWriteMultiple(
  deviceAddress: number,
  startAddress: number,
  values: number[],
): ModbusFrame {
  const fc = 0x10;
  const byteCount = values.length * 2;
  const payload: number[] = [
    deviceAddress, fc,
    (startAddress >> 8) & 0xff, startAddress & 0xff,
    (values.length >> 8) & 0xff, values.length & 0xff,
    byteCount,
  ];
  for (const v of values) {
    payload.push((v >> 8) & 0xff, v & 0xff);
  }
  const crc = crc16Modbus(payload);
  payload.push(crc & 0xff, (crc >> 8) & 0xff);

  return {
    deviceAddress, functionCode: fc,
    data: payload.slice(2, -2),
    crc, raw: payload, isResponse: false, timestamp: Date.now(),
  };
}

export function buildModbusResponse(
  request: ModbusFrame,
  slave: ModbusSlaveState,
): ModbusFrame {
  const { deviceAddress, functionCode } = request;
  const startAddr = (request.data[0] << 8) | request.data[1];
  const quantity = (request.data[2] << 8) | request.data[3];

  let responseData: number[] = [];
  let errorCode: number | null = null;

  try {
    switch (functionCode) {
      case 0x01: {
        // Read Coils
        const coils = slave.coils.slice(startAddr, startAddr + quantity);
        if (coils.length < quantity) { errorCode = 0x02; break; }
        const byteCount = Math.ceil(quantity / 8);
        const coilBytes: number[] = new Array(byteCount).fill(0);
        coils.forEach((c, i) => { if (c.value) coilBytes[Math.floor(i / 8)] |= 1 << (i % 8); });
        responseData = [byteCount, ...coilBytes];
        break;
      }
      case 0x02: {
        const inputs = slave.discreteInputs.slice(startAddr, startAddr + quantity);
        if (inputs.length < quantity) { errorCode = 0x02; break; }
        const byteCount = Math.ceil(quantity / 8);
        const bytes: number[] = new Array(byteCount).fill(0);
        inputs.forEach((d, i) => { if (d.value) bytes[Math.floor(i / 8)] |= 1 << (i % 8); });
        responseData = [byteCount, ...bytes];
        break;
      }
      case 0x03: {
        const regs = slave.holdingRegisters.slice(startAddr, startAddr + quantity);
        if (regs.length < quantity) { errorCode = 0x02; break; }
        responseData = [quantity * 2];
        regs.forEach(r => responseData.push((r.value >> 8) & 0xff, r.value & 0xff));
        break;
      }
      case 0x04: {
        const regs = slave.inputRegisters.slice(startAddr, startAddr + quantity);
        if (regs.length < quantity) { errorCode = 0x02; break; }
        responseData = [quantity * 2];
        regs.forEach(r => responseData.push((r.value >> 8) & 0xff, r.value & 0xff));
        break;
      }
      case 0x05: {
        const coilVal = request.data[2] === 0xff;
        if (startAddr < slave.coils.length) slave.coils[startAddr].value = coilVal;
        responseData = [...request.data];
        break;
      }
      case 0x06: {
        const regVal = (request.data[2] << 8) | request.data[3];
        if (startAddr < slave.holdingRegisters.length) slave.holdingRegisters[startAddr].value = regVal;
        responseData = [...request.data];
        break;
      }
      default:
        errorCode = 0x01;
    }
  } catch {
    errorCode = 0x04;
  }

  if (errorCode !== null) {
    const payload = [deviceAddress, functionCode | 0x80, errorCode];
    const crc = crc16Modbus(payload);
    payload.push(crc & 0xff, (crc >> 8) & 0xff);
    return { deviceAddress, functionCode: functionCode | 0x80, data: [errorCode], crc, raw: payload, isResponse: true, timestamp: Date.now(), error: `Exception ${errorCode}` };
  }

  const payload = [deviceAddress, functionCode, ...responseData];
  const crc = crc16Modbus(payload);
  payload.push(crc & 0xff, (crc >> 8) & 0xff);
  return { deviceAddress, functionCode, data: responseData, crc, raw: payload, isResponse: true, timestamp: Date.now() };
}

export function makeDefaultSlaveState(address: number): ModbusSlaveState {
  return {
    deviceAddress: address,
    holdingRegisters: Array.from({ length: 20 }, (_, i) => ({ address: i, value: Math.floor(Math.random() * 1000), label: `HR${i}` })),
    inputRegisters: Array.from({ length: 10 }, (_, i) => ({ address: i, value: Math.floor(Math.random() * 500), label: `IR${i}` })),
    coils: Array.from({ length: 16 }, (_, i) => ({ address: i, value: i % 3 === 0, label: `C${i}` })),
    discreteInputs: Array.from({ length: 8 }, (_, i) => ({ address: i, value: i % 2 === 0, label: `DI${i}` })),
  };
}

export function frameToHexString(frame: ModbusFrame): string {
  return frame.raw.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
