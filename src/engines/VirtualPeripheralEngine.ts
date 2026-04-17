import type { ProtocolType, PeripheralState } from '../types';

export interface PeripheralResponse {
  bytes: number[];
  log: string;
}

export abstract class PeripheralDriver {
  abstract id: string;
  abstract name: string;
  abstract protocol: ProtocolType;
  
  protected state: any = {};
  
  constructor(initialState: any = {}) {
    this.state = initialState;
  }

  abstract process(input: number[]): PeripheralResponse | null;
  
  getState() {
    return this.state;
  }
}

// ── Temperature Sensor (I2C) ─────────────────
// Emulates LM75 style sensor at address 0x48
export class LM75Driver extends PeripheralDriver {
  id = 'lm75';
  name = 'LM75 Temp Sensor';
  protocol: ProtocolType = 'I2C';
  private address = 0x48;
  
  constructor() {
    super({ temp: 25.5, config: 0x00 });
  }

  process(input: number[]): PeripheralResponse | null {
    if (input.length === 0) return null;
    
    // Check address (first byte of I2C transaction usually includes R/W bit)
    const addr = input[0] >> 1;
    const isRead = (input[0] & 1) === 1;

    if (addr !== this.address) return null;

    if (isRead) {
      // Return 2 bytes of temperature data (9-bit resolution)
      const t = this.state.temp;
      const raw = Math.floor(t / 0.5) << 7; 
      return {
        bytes: [(raw >> 8) & 0xFF, raw & 0xFF],
        log: `I2C: LM75 Temp Read -> ${t}°C`
      };
    } else if (input.length > 1) {
      // Process write to register (simplified)
      const reg = input[1];
      if (reg === 0x01 && input.length > 2) {
         this.state.config = input[2];
         return { bytes: [], log: `I2C: LM75 Config Write -> 0x${input[2].toString(16)}` };
      }
    }
    
    return null;
  }
}

// ── SPI EEPROM (25AA010A) ────────────────────
export class EEPROMDriver extends PeripheralDriver {
  id = 'eeprom';
  name = '25AA010A EEPROM';
  protocol: ProtocolType = 'SPI';
  
  private memory = new Uint8Array(128);
  private wren = false;

  constructor() {
    super({});
    this.memory.fill(0xFF);
  }

  process(input: number[]): PeripheralResponse | null {
    if (input.length === 0) return null;
    const cmd = input[0];

    switch (cmd) {
      case 0x06: // WREN
        this.wren = true;
        return { bytes: [], log: 'SPI: EEPROM WREN (Write Enable)' };
      case 0x04: // WRDI
        this.wren = false;
        return { bytes: [], log: 'SPI: EEPROM WRDI (Write Disable)' };
      case 0x03: // READ
        if (input.length > 1) {
          const addr = input[1] & 0x7F;
          const val = this.memory[addr];
          return { bytes: [val], log: `SPI: EEPROM Read @0x${addr.toString(16)} -> 0x${val.toString(16)}` };
        }
        break;
      case 0x02: // WRITE
        if (this.wren && input.length > 2) {
          const addr = input[1] & 0x7F;
          const val = input[2];
          this.memory[addr] = val;
          this.wren = false; // Auto disable wren after write
          return { bytes: [], log: `SPI: EEPROM Write @0x${addr.toString(16)} <- 0x${val.toString(16)}` };
        }
        return { bytes: [], log: 'SPI: EEPROM Write FAILED (WREN bit not set)' };
      case 0x05: // RDSR
        return { bytes: [this.wren ? 0x02 : 0x00], log: 'SPI: EEPROM Read Status Register' };
    }
    
    return null;
  }
}

// ── Console CLI (UART) ───────────────────────
export class VirtualConsoleDriver extends PeripheralDriver {
  id = 'console';
  name = 'Virtual Terminal';
  protocol: ProtocolType = 'UART';

  process(input: number[]): PeripheralResponse | null {
    const text = String.fromCharCode(...input).trim();
    if (text === 'HELP') {
      return { 
        bytes: Array.from('Available commands: HELP, STATUS, RESET\r\n').map(c => c.charCodeAt(0)),
        log: 'UART: Console HELP command'
      };
    } else if (text === 'STATUS') {
       return { 
        bytes: Array.from('System OK. Uptime: 1042s\r\n').map(c => c.charCodeAt(0)),
        log: 'UART: Console STATUS command'
      };
    } else if (input.length > 0) {
      return {
        bytes: [...input],
        log: `UART: Raw Loopback (Jumper) -> ${input.length} bytes`
      };
    }
    return null;
  }
}

export class VirtualPeripheralEngine {
  private peripherals: PeripheralDriver[] = [
    new LM75Driver(),
    new EEPROMDriver(),
    new VirtualConsoleDriver()
  ];

  processIncoming(protocol: ProtocolType, bytes: number[]): PeripheralResponse[] {
    const responses: PeripheralResponse[] = [];
    
    for (const p of this.peripherals) {
      if (p.protocol === protocol) {
        const res = p.process(bytes);
        if (res) responses.push(res);
      }
    }
    
    return responses;
  }
}
