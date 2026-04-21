import type { ProtocolType } from '../types';

export interface PeripheralResponse {
  bytes: number[];
  log: string;
}

export abstract class PeripheralDriver<T extends Record<string, unknown> = Record<string, unknown>> {
  abstract id: string;
  abstract name: string;
  abstract protocol: ProtocolType;
  
  protected state: T;
  
  constructor(initialState: T = {} as T) {
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
      const t = this.state.temp as number;
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
    }
    return null;
    return null;
  }
}

// ── Infusion Pump (UART/Medical) ──────────────
export class InfusionPumpDriver extends PeripheralDriver {
  id = 'pump';
  name = 'Smart Infusion Pump';
  protocol: ProtocolType = 'UART';

  constructor() {
    super({
      running: 1,
      flowRate: 125,
      volumeInfused: 450,
      airInLine: 0,
      occlusion: 0,
      bolus: 0
    });
  }

  process(input: number[]): PeripheralResponse | null {
    if (input.length === 0) return null;
    
    // Command Processing (Simplified)
    const cmd = input[0];
    
    if (cmd === 0x01) { // START
      this.state.running = 1;
      return { bytes: [0x06], log: 'PUMP: Started Infusion' }; // 0x06 (ACK)
    } else if (cmd === 0x02) { // STOP
      this.state.running = 0;
      return { bytes: [0x06], log: 'PUMP: Stopped Infusion' };
    } else if (cmd === 0x03 && input.length >= 3) { // SET FLOW
      const flow = (input[1] << 8) | input[2];
      this.state.flowRate = flow;
      return { bytes: [0x06], log: `PUMP: Set Flow Rate to ${flow} mL/h` };
    } else if (cmd === 0x07) { // TRIGGER AIR ALARM
      return { bytes: [0x06], log: 'PUMP: INJECTED AIR ALARM' };
    } else if (cmd === 0x10) { // BOLUS
       this.state.bolus = 1;
       return { bytes: [0x06], log: 'PUMP: Bolus verildi' };
    }

    return null;
  }
}

// ── Flow Control Clamp (UART/Medical) ──────────
export class ClampDriver extends PeripheralDriver {
  id = 'clamp';
  name = 'Precision Flow Clamp';
  protocol: ProtocolType = 'UART';

  constructor() {
    super({
      position: 0, // 0 = fully open, 100 = fully closed
      pressure: 45,
      moving: 0,
      error: 0,
      calibrated: 1
    });
  }

  process(input: number[]): PeripheralResponse | null {
    if (input.length === 0) return null;

    const cmd = input[0];

    if (cmd === 0x10 && input.length >= 2) { // SET POSITION
      const pos = input[1];
      this.state.position = pos;
      this.state.moving = 1;
      
      // Simulate movement completion
      setTimeout(() => { this.state.moving = 0; }, 500);
      
      return { bytes: [0x06], log: `CLAMP: Setting position to ${pos}%` };
    } else if (cmd === 0x11) { // CALIBRATE
      this.state.calibrated = 1;
      return { bytes: [0x06], log: 'CLAMP: Calibrating...' };
    }

    return null;
  }
}

// ── Open Source Ventilator (Humanitarian) ─────
export class VentilatorDriver extends PeripheralDriver {
  id = 'ventilator';
  name = 'Global Open Ventilator';
  protocol: ProtocolType = 'UART';

  constructor() {
    super({
      running: 1,
      rr: 15,
      pressure: 25,
      peep: 5,
      apnea: 0
    });
  }

  process(input: number[]): PeripheralResponse | null {
    if (input.length === 0) return null;

    const cmd = input[0];

    if (cmd === 0x20 && input.length >= 2) { // SET RR
      const rr = input[1];
      this.state.rr = rr;
      return { bytes: [0x06], log: `VENT: Solunum hızı ${rr} BPM olarak güncellendi` };
    } else if (cmd === 0x25) { // SELF TEST
       return { bytes: [0x06], log: 'VENT: Kendi kendine test başlatıldı... Tamam.' };
    }

    return null;
  }
}

export class VirtualPeripheralEngine {
  private peripherals: PeripheralDriver[] = [
    new LM75Driver(),
    new EEPROMDriver(),
    new VirtualConsoleDriver(),
    new InfusionPumpDriver(),
    new ClampDriver(),
    new VentilatorDriver()
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
