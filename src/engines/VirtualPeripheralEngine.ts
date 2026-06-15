import type { ProtocolType } from '../types';
import { executePeripheralScript } from './ScriptRunner';

export interface PeripheralResponse {
  bytes: number[];
  log: string;
}

export abstract class PeripheralDriver<T extends Record<string, unknown> = Record<string, unknown>> {
  abstract id: string;
  abstract name: string;
  abstract protocol: ProtocolType;
  
  protected state: T;
  onAsyncResponse?: (res: PeripheralResponse) => void;
  
  constructor(initialState: T = {} as T) {
    this.state = initialState;
  }

  abstract process(input: number[]): PeripheralResponse | null;
  
  getState() {
    return this.state;
  }
}

export class ScriptableDriver extends PeripheralDriver {
  id: string;
  name: string;
  protocol: ProtocolType;
  private script: string;

  constructor(id: string, name: string, protocol: ProtocolType, script: string, initialState: Record<string, unknown>) {
    super(initialState);
    this.id = id;
    this.name = name;
    this.protocol = protocol;
    this.script = script;
  }

  process(input: number[]): PeripheralResponse | null {
    const result = executePeripheralScript(this.script, input, this.state);
    this.state = result.nextState;
    return {
      bytes: result.bytes,
      log: result.log
    };
  }

  updateScript(script: string) {
    this.script = script;
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

// ── SIM Card / Modem Simulator (UART) ──────────
export class SimCardDriver extends PeripheralDriver {
  id = 'simcard';
  name = 'SIM Card Modem';
  protocol: ProtocolType = 'UART';

  private rxBuffer: number[] = [];
  private mode: 'command' | 'httpdata' | 'transparent' | 'filewrite' | 'smswrite' = 'command';
  private echo = true;

  // HTTP context
  private httpInitialized = false;
  private url = '';
  private contentType = 'application/json';
  private postData = '';
  private postDataLength = 0;
  private responseStatus = 0;
  private responseBody = '';

  // TCP transparent mode context
  private tcpHost = '';
  private tcpPort = 0;
  private transparentBuffer: number[] = [];

  // Filesystem & Certificates context
  private files: Record<string, string> = {};
  private writeFilename = '';
  private writeFileLength = 0;

  // SSL Context parameters
  private sslVersion = 3;
  private sslAuthMode = 0; // 0: None, 1: Client, 2: Server, 3: Mutual
  private sslCaCert = '';
  private sslClientCert = '';
  private sslClientKey = '';

  // MQTT context
  private mqttConnected = false;
  private mqttBroker = '';
  private mqttSubscribedTopics: string[] = [];

  // SMS context
  private smsPhone = '';
  private smsIndex = 1;

  constructor() {
    super({});
  }

  process(input: number[]): PeripheralResponse | null {
    if (input.length === 0) return null;

    if (this.mode === 'command') {
      const firstByte = this.rxBuffer.length > 0 ? this.rxBuffer[0] : input[0];
      if (firstByte !== 0x41 && firstByte !== 0x61 && firstByte !== 0x0D && firstByte !== 0x0A) {
        return null;
      }
    }

    let responseBytes: number[] = [];
    let logMsg = '';

    // Handle Echo
    if (this.echo && this.mode !== 'transparent' && this.mode !== 'filewrite' && this.mode !== 'smswrite') {
      responseBytes.push(...input);
    }

    if (this.mode === 'smswrite') {
      for (const b of input) {
        if (b === 0x1A) { // Ctrl+Z
          const message = String.fromCharCode(...this.transparentBuffer);
          this.transparentBuffer = [];
          this.mode = 'command';
          responseBytes.push(...Array.from(`\r\n+CMGS: ${this.smsIndex}\r\n\r\nOK\r\n`).map(c => c.charCodeAt(0)));
          logMsg = `Modem: Sent SMS to ${this.smsPhone} (Message: "${message.trim()}") (Index: ${this.smsIndex++})`;
          break;
        } else {
          this.transparentBuffer.push(b);
        }
      }
      return { bytes: responseBytes, log: logMsg || `Modem: Collecting SMS data...` };
    }

    if (this.mode === 'filewrite') {
      for (const b of input) {
        this.transparentBuffer.push(b);
        if (this.transparentBuffer.length >= this.writeFileLength) {
          const fileData = String.fromCharCode(...this.transparentBuffer);
          this.files[this.writeFilename] = fileData;
          this.transparentBuffer = [];
          this.mode = 'command';
          responseBytes.push(...Array.from('\r\nOK\r\n').map(c => c.charCodeAt(0)));
          logMsg = `Modem: Saved file "${this.writeFilename}" (${fileData.length} bytes)`;
          break;
        }
      }
      return { bytes: responseBytes, log: logMsg || `Modem: Writing file data...` };
    }

    if (this.mode === 'httpdata') {
      for (const b of input) {
        this.transparentBuffer.push(b);
        if (this.transparentBuffer.length >= this.postDataLength) {
          this.postData = String.fromCharCode(...this.transparentBuffer);
          this.transparentBuffer = [];
          this.mode = 'command';
          responseBytes.push(...Array.from('\r\nOK\r\n').map(c => c.charCodeAt(0)));
          logMsg = `Modem: HTTPDATA download complete (${this.postData.length} bytes)`;
          break;
        }
      }
      return { bytes: responseBytes, log: logMsg || `Modem: Downloading HTTPDATA...` };
    }

    if (this.mode === 'transparent') {
      for (const b of input) {
        if (b === 0x1A) { // Ctrl+Z
          const payload = String.fromCharCode(...this.transparentBuffer);
          this.transparentBuffer = [];
          this.mode = 'command';
          logMsg = `Modem: Sending transparent data to ${this.tcpHost}:${this.tcpPort}`;
          this.handleTransparentSend(payload);
          break;
        } else {
          this.transparentBuffer.push(b);
        }
      }
      return { bytes: responseBytes, log: logMsg || `Modem: Collecting transparent TCP data...` };
    }

    // Command Mode - accumulate until \r or \n
    for (const b of input) {
      if (b === 0x0D || b === 0x0A) {
        if (this.rxBuffer.length > 0) {
          const cmdLine = String.fromCharCode(...this.rxBuffer).trim();
          this.rxBuffer = [];
          const cmdRes = this.handleCommand(cmdLine);
          if (cmdRes) {
            responseBytes.push(...cmdRes.bytes);
            logMsg = cmdRes.log;
          }
        }
      } else {
        this.rxBuffer.push(b);
      }
    }

    if (responseBytes.length > 0 || logMsg) {
      return { bytes: responseBytes, log: logMsg };
    }

    return null;
  }

  private handleCommand(cmd: string): { bytes: number[]; log: string } | null {
    const upperCmd = cmd.toUpperCase();
    let reply = '';
    let log = '';

    if (upperCmd === 'AT') {
      reply = '\r\nOK\r\n';
      log = 'Modem: AT OK';
    } else if (upperCmd === 'ATE0') {
      this.echo = false;
      reply = '\r\nOK\r\n';
      log = 'Modem: Echo Off';
    } else if (upperCmd === 'ATE1') {
      this.echo = true;
      reply = '\r\nOK\r\n';
      log = 'Modem: Echo On';
    } else if (upperCmd === 'AT+CSQ') {
      reply = '\r\n+CSQ: 31,99\r\n\r\nOK\r\n';
      log = 'Modem: Signal Quality query';
    } else if (upperCmd === 'AT+CREG?') {
      reply = '\r\n+CREG: 0,1\r\n\r\nOK\r\n';
      log = 'Modem: Registration status query';
    } else if (upperCmd === 'AT+CGATT?') {
      reply = '\r\n+CGATT: 1\r\n\r\nOK\r\n';
      log = 'Modem: GPRS attachment status query';
    } else if (upperCmd.startsWith('AT+SAPBR=')) {
      reply = '\r\nOK\r\n';
      log = `Modem: Bearer config command: ${cmd}`;
    } else if (upperCmd === 'AT+HTTPINIT') {
      this.httpInitialized = true;
      reply = '\r\nOK\r\n';
      log = 'Modem: HTTP service initialized';
    } else if (upperCmd.startsWith('AT+HTTPPARA=')) {
      const urlMatch = cmd.match(/"?URL"?\s*,\s*"([^"]+)"/i);
      const contentMatch = cmd.match(/"?CONTENT"?\s*,\s*"([^"]+)"/i);
      if (urlMatch) {
        this.url = urlMatch[1];
        reply = '\r\nOK\r\n';
        log = `Modem: Set URL -> ${this.url}`;
      } else if (contentMatch) {
        this.contentType = contentMatch[1];
        reply = '\r\nOK\r\n';
        log = `Modem: Set Content-Type -> ${this.contentType}`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Unknown HTTPPARA parameter: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+HTTPDATA=')) {
      const match = upperCmd.match(/AT\+HTTPDATA=(\d+),(\d+)/);
      if (match) {
        this.postDataLength = parseInt(match[1], 10);
        this.mode = 'httpdata';
        this.transparentBuffer = [];
        reply = '\r\nDOWNLOAD\r\n';
        log = `Modem: Waiting for HTTPDATA body (${this.postDataLength} bytes)`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid HTTPDATA format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+HTTPACTION=')) {
      const match = upperCmd.match(/AT\+HTTPACTION=(\d+)/);
      if (match) {
        const method = parseInt(match[1], 10);
        reply = '\r\nOK\r\n';
        log = `Modem: HTTPACTION triggered (Method: ${method === 1 ? 'POST' : 'GET'})`;
        this.handleHttpAction(method);
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid HTTPACTION format: ${cmd}`;
      }
    } else if (upperCmd === 'AT+HTTPREAD') {
      reply = `\r\n+HTTPREAD: ${this.responseBody.length}\r\n${this.responseBody}\r\n\r\nOK\r\n`;
      log = `Modem: HTTPREAD (${this.responseBody.length} bytes returned)`;
    } else if (upperCmd === 'AT+HTTPTERM') {
      this.httpInitialized = false;
      reply = '\r\nOK\r\n';
      log = 'Modem: HTTP service terminated';
    } else if (upperCmd.startsWith('AT+FSCREATE=')) {
      const match = cmd.match(/AT\+FSCREATE="?([^"\s]+)"?/i);
      if (match) {
        const filename = match[1];
        this.files[filename] = '';
        reply = '\r\nOK\r\n';
        log = `Modem: Created file "${filename}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid FSCREATE format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+FSWRITE=')) {
      const match = cmd.match(/AT\+FSWRITE="?([^"\s,]+)"?,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match) {
        this.writeFilename = match[1];
        this.writeFileLength = parseInt(match[3], 10);
        this.mode = 'filewrite';
        this.transparentBuffer = [];
        reply = '\r\n> ';
        log = `Modem: Writing ${this.writeFileLength} bytes to file "${this.writeFilename}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid FSWRITE format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+CSSLCFG=') || upperCmd.startsWith('AT+QSSLCFG=')) {
      const match = cmd.match(/AT\+(?:Q|C)SSLCFG="?([^",\s]+)"?,\s*(\d+)\s*,\s*"?([^"\r\n]+)"?/i);
      if (match) {
        const param = match[1].toLowerCase();
        const value = match[3];
        if (param === 'sslversion') {
          this.sslVersion = parseInt(value, 10);
          log = `Modem: SSL Config -> Version = ${this.sslVersion}`;
        } else if (param === 'authmode') {
          this.sslAuthMode = parseInt(value, 10);
          log = `Modem: SSL Config -> AuthMode = ${this.sslAuthMode}`;
        } else if (param === 'seclevel') {
          const level = parseInt(value, 10);
          this.sslAuthMode = level === 2 ? 3 : level === 1 ? 2 : 0;
          log = `Modem: SSL Config -> SecLevel = ${level} (AuthMode = ${this.sslAuthMode})`;
        } else if (param === 'cacert') {
          this.sslCaCert = value;
          log = `Modem: SSL Config -> CACert = ${this.sslCaCert}`;
        } else if (param === 'clientcert') {
          this.sslClientCert = value;
          log = `Modem: SSL Config -> ClientCert = ${this.sslClientCert}`;
        } else if (param === 'clientkey') {
          this.sslClientKey = value;
          log = `Modem: SSL Config -> ClientKey = ${this.sslClientKey}`;
        } else {
          log = `Modem: SSL Config -> Configured ${param} = ${value}`;
        }
        reply = '\r\nOK\r\n';
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid SSL config format: ${cmd}`;
      }
    } else if (upperCmd === 'AT+FSLS') {
      const fileList = Object.keys(this.files);
      reply = `\r\n+FSLS: ${fileList.join(', ')}\r\n\r\nOK\r\n`;
      log = `Modem: Files listed -> [${fileList.join(', ')}]`;
    } else if (upperCmd.startsWith('AT+FSFLSIZE=')) {
      const match = cmd.match(/AT\+FSFLSIZE="?([^"\s]+)"?/i);
      if (match && this.files[match[1]] !== undefined) {
        const size = this.files[match[1]].length;
        reply = `\r\n+FSFLSIZE: ${size}\r\n\r\nOK\r\n`;
        log = `Modem: Checked size of "${match[1]}" -> ${size} bytes`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: File not found or invalid format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+FSDEL=')) {
      const match = cmd.match(/AT\+FSDEL="?([^"\s]+)"?/i);
      if (match && this.files[match[1]] !== undefined) {
        delete this.files[match[1]];
        reply = '\r\nOK\r\n';
        log = `Modem: Deleted file "${match[1]}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: File not found or invalid format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+FSREAD=')) {
      const match = cmd.match(/AT\+FSREAD="?([^"\s,]+)"?,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match && this.files[match[1]] !== undefined) {
        const filename = match[1];
        const size = parseInt(match[3], 10);
        const offset = parseInt(match[4], 10);
        const data = this.files[filename].substring(offset, offset + size);
        reply = `\r\n+FSREAD: ${data.length}\r\n${data}\r\n\r\nOK\r\n`;
        log = `Modem: Read ${data.length} bytes from file "${filename}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: File not found or invalid format: ${cmd}`;
      }
    } else if (upperCmd === 'AT+CPIN?') {
      reply = '\r\n+CPIN: READY\r\n\r\nOK\r\n';
      log = 'Modem: PIN status query -> READY';
    } else if (upperCmd === 'AT+COPS?') {
      reply = '\r\n+COPS: 0,0,"Turkcell"\r\n\r\nOK\r\n';
      log = 'Modem: Operator query -> Turkcell';
    } else if (upperCmd.startsWith('AT+CGDCONT=')) {
      reply = '\r\nOK\r\n';
      log = `Modem: APN context configured: ${cmd}`;
    } else if (upperCmd === 'AT+CIFSR') {
      reply = '\r\n10.78.12.143\r\n';
      log = 'Modem: Retrieved local IP -> 10.78.12.143';
    } else if (upperCmd.startsWith('AT+MQTTCONN=') || upperCmd.startsWith('AT+QMCONN=')) {
      const match = cmd.match(/(?:MQTTCONN|QMCONN)="?([^",\s]+)"?,\s*(\d+)(?:,\s*(\d+))?/i);
      if (match) {
        this.mqttBroker = match[1];
        const port = parseInt(match[2], 10);
        const sslCtx = match[3] ? parseInt(match[3], 10) : 0;
        
        let sslCheckOk = true;
        let sslLogText = '';
        if (sslCtx > 0 && (this.sslAuthMode === 1 || this.sslAuthMode === 3)) {
          const hasCert = this.sslClientCert && this.files[this.sslClientCert];
          const hasKey = this.sslClientKey && this.files[this.sslClientKey];
          if (!hasCert || !hasKey) {
            sslCheckOk = false;
          } else {
            sslLogText = ` (MQTTS Secure Handshake OK with cert: "${this.sslClientCert}")`;
          }
        }
        
        if (sslCheckOk) {
          this.mqttConnected = true;
          reply = '\r\nOK\r\n';
          log = `Modem: Connected to MQTT Broker -> ${this.mqttBroker}:${port}${sslLogText}`;
        } else {
          reply = '\r\nERROR\r\n';
          log = `Modem: MQTT Secure Connection Failed. Missing client credentials.`;
        }
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid MQTTCONN format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+MQTTPUB=') || upperCmd.startsWith('AT+QMPUB=')) {
      const match = cmd.match(/(?:MQTTPUB|QMPUB)="?([^",\s]+)"?,\s*"([^"]+)"/i);
      if (this.mqttConnected && match) {
        reply = '\r\nOK\r\n';
        log = `Modem: MQTT Published -> Topic: "${match[1]}", Message: "${match[2]}"`;
      } else if (!this.mqttConnected) {
        reply = '\r\nERROR\r\n';
        log = 'Modem: MQTT Publish failed (Not connected to broker)';
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid MQTTPUB format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+MQTTSUB=') || upperCmd.startsWith('AT+QMSUB=')) {
      const match = cmd.match(/(?:MQTTSUB|QMSUB)="?([^"\r\n]+)"?/i);
      if (this.mqttConnected && match) {
        this.mqttSubscribedTopics.push(match[1]);
        reply = '\r\nOK\r\n';
        log = `Modem: MQTT Subscribed -> Topic: "${match[1]}"`;
      } else if (!this.mqttConnected) {
        reply = '\r\nERROR\r\n';
        log = 'Modem: MQTT Subscribe failed (Not connected to broker)';
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid MQTTSUB format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+CMGS=')) {
      const match = cmd.match(/AT\+CMGS="?([^"\s]+)"?/i);
      if (match) {
        this.smsPhone = match[1];
        this.mode = 'smswrite';
        this.transparentBuffer = [];
        reply = '\r\n> ';
        log = `Modem: Preparing SMS to ${this.smsPhone}, waiting for text (Ctrl+Z to send)`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid CMGS format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+CIPSTART=')) {
      const sslMatch = cmd.match(/CIPSTART\s*=\s*"SSL"\s*,\s*"([^"]+)"\s*,\s*"(\d+)"/i);
      const tcpMatch = cmd.match(/CIPSTART\s*=\s*"TCP"\s*,\s*"([^"]+)"\s*,\s*"(\d+)"/i);
      const isSSL = !!sslMatch;
      const hostVal = sslMatch ? sslMatch[1] : tcpMatch ? tcpMatch[1] : '';
      const portVal = sslMatch ? parseInt(sslMatch[2], 10) : tcpMatch ? parseInt(tcpMatch[2], 10) : 0;

      if (hostVal && portVal) {
        this.tcpHost = hostVal;
        this.tcpPort = portVal;
        if (isSSL || portVal === 443) {
          if (this.sslAuthMode === 1 || this.sslAuthMode === 3) {
            const hasCert = this.sslClientCert && this.files[this.sslClientCert];
            const hasKey = this.sslClientKey && this.files[this.sslClientKey];
            if (!hasCert || !hasKey) {
              reply = '\r\nCONNECTION FAILED\r\n';
              log = `Modem: TCP SSL Connection failed. Client credentials missing. Expected Cert: "${this.sslClientCert}", Key: "${this.sslClientKey}"`;
              return { bytes: Array.from(reply).map(c => c.charCodeAt(0)), log };
            }
          }
          reply = '\r\nCONNECT OK\r\n';
          log = `Modem: Secure SSL TCP connection opened to ${this.tcpHost}:${this.tcpPort} (SSL Handshake OK)`;
        } else {
          reply = '\r\nCONNECT OK\r\n';
          log = `Modem: TCP connection opened to ${this.tcpHost}:${this.tcpPort}`;
        }
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid CIPSTART format: ${cmd}`;
      }
    } else if (upperCmd === 'AT+CIPSEND') {
      this.mode = 'transparent';
      this.transparentBuffer = [];
      reply = '\r\n> ';
      log = 'Modem: Entering TCP transparent mode, waiting for data (Ctrl+Z to send)';
    } else {
      reply = '\r\nOK\r\n';
      log = `Modem: Received command: ${cmd}`;
    }

    return {
      bytes: Array.from(reply).map(c => c.charCodeAt(0)),
      log
    };
  }

  private handleHttpAction(method: number) {
    if (!this.url) {
      if (this.onAsyncResponse) {
        this.onAsyncResponse({
          bytes: Array.from(`\r\n+HTTPACTION: ${method},600,0\r\n`).map(c => c.charCodeAt(0)),
          log: 'Modem: HTTP Action Failed (No URL set)'
        });
      }
      return;
    }

    const isSecure = this.url.startsWith('https://');
    if (isSecure && (this.sslAuthMode === 1 || this.sslAuthMode === 3)) {
      const hasCert = this.sslClientCert && this.files[this.sslClientCert];
      const hasKey = this.sslClientKey && this.files[this.sslClientKey];
      if (!hasCert || !hasKey) {
        if (this.onAsyncResponse) {
          this.onAsyncResponse({
            bytes: Array.from(`\r\n+HTTPACTION: ${method},603,0\r\n`).map(c => c.charCodeAt(0)),
            log: `Modem: HTTP SSL Handshake Failed. Client Certificate or Key missing. Expected Cert: "${this.sslClientCert}", Key: "${this.sslClientKey}"`
          });
        }
        return;
      }
    }

    const methodStr = method === 1 ? 'POST' : method === 2 ? 'PUT' : method === 3 ? 'DELETE' : 'GET';
    const fetchOptions: RequestInit = {
      method: methodStr,
      headers: (methodStr === 'POST' || methodStr === 'PUT') ? { 'Content-Type': this.contentType } : undefined,
      body: (methodStr === 'POST' || methodStr === 'PUT') ? this.postData : undefined
    };

    const sslLogText = isSecure && (this.sslAuthMode === 1 || this.sslAuthMode === 3)
      ? ` (Mutual TLS Handshake Completed with cert: "${this.sslClientCert}")`
      : '';

    fetch(this.url, fetchOptions)
      .then(async res => {
        const text = await res.text();
        this.responseStatus = res.status;
        this.responseBody = text;
        if (this.onAsyncResponse) {
          this.onAsyncResponse({
            bytes: Array.from(`\r\n+HTTPACTION: ${method},${res.status},${text.length}\r\n`).map(c => c.charCodeAt(0)),
            log: `Modem: HTTP Async Response -> ${res.status} (Length: ${text.length})${sslLogText}`
          });
        }
      })
      .catch(err => {
        this.responseStatus = 600;
        this.responseBody = '';
        if (this.onAsyncResponse) {
          this.onAsyncResponse({
            bytes: Array.from(`\r\n+HTTPACTION: ${method},600,0\r\n`).map(c => c.charCodeAt(0)),
            log: `Modem: HTTP Action Error -> ${err.message}`
          });
        }
      });
  }

  private handleTransparentSend(payload: string) {
    let method = 'GET';
    let path = '/';
    const headers: Record<string, string> = {};
    let body = '';

    const lines = payload.split(/\r?\n/);
    const firstLine = lines[0];
    const match = firstLine ? firstLine.match(/^(GET|POST|PUT|DELETE)\s+([^\s]+)\s+HTTP/i) : null;

    if (match) {
      method = match[1].toUpperCase();
      path = match[2];
      
      let idx = 1;
      while (idx < lines.length && lines[idx].trim() !== '') {
        const hLine = lines[idx];
        const hMatch = hLine.match(/^([^:]+):\s*(.*)$/);
        if (hMatch) {
          headers[hMatch[1].trim()] = hMatch[2].trim();
        }
        idx++;
      }
      body = lines.slice(idx + 1).join('\n').trim();
    } else {
      method = 'POST';
      body = payload;
    }

    const host = this.tcpHost || 'localhost';
    const port = this.tcpPort || 80;
    const protocol = port === 443 ? 'https' : 'http';

    if (protocol === 'https' && (this.sslAuthMode === 1 || this.sslAuthMode === 3)) {
      const hasCert = this.sslClientCert && this.files[this.sslClientCert];
      const hasKey = this.sslClientKey && this.files[this.sslClientKey];
      if (!hasCert || !hasKey) {
        if (this.onAsyncResponse) {
          const errMsg = `SSL Connection failed. Client credentials missing.`;
          const errorResponse = `HTTP/1.1 403 Forbidden\r\nContent-Length: ${errMsg.length}\r\n\r\n${errMsg}`;
          this.onAsyncResponse({
            bytes: Array.from(errorResponse).map(c => c.charCodeAt(0)),
            log: `Modem: TCP Transparent SSL Error -> Client credentials missing.`
          });
        }
        return;
      }
    }

    const fetchUrl = `${protocol}://${host}:${port}${path}`;
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'text/plain',
        ...headers
      },
      body: method !== 'GET' && method !== 'HEAD' ? body : undefined
    };

    const sslLogText = protocol === 'https' && (this.sslAuthMode === 1 || this.sslAuthMode === 3)
      ? ` (Mutual TLS Handshake Completed with cert: "${this.sslClientCert}")`
      : '';

    fetch(fetchUrl, fetchOptions)
      .then(async res => {
        const text = await res.text();
        const httpResponse = `HTTP/1.1 ${res.status} OK\r\nContent-Type: text/plain\r\nContent-Length: ${text.length}\r\n\r\n${text}`;
        if (this.onAsyncResponse) {
          this.onAsyncResponse({
            bytes: Array.from(httpResponse).map(c => c.charCodeAt(0)),
            log: `Modem: TCP Transparent Response -> Status ${res.status} (Length: ${text.length})${sslLogText}`
          });
        }
      })
      .catch(err => {
        const errorResponse = `HTTP/1.1 500 Internal Server Error\r\nContent-Length: ${err.message.length}\r\n\r\n${err.message}`;
        if (this.onAsyncResponse) {
          this.onAsyncResponse({
            bytes: Array.from(errorResponse).map(c => c.charCodeAt(0)),
            log: `Modem: TCP Transparent Error -> ${err.message}`
          });
        }
      });
  }
}

export class VirtualPeripheralEngine {
  private peripherals: PeripheralDriver[] = [
    new LM75Driver(),
    new EEPROMDriver(),
    new VirtualConsoleDriver(),
    new InfusionPumpDriver(),
    new ClampDriver(),
    new VentilatorDriver(),
    new SimCardDriver()
  ];

  addDriver(driver: PeripheralDriver) {
    this.peripherals = this.peripherals.filter(p => p.id !== driver.id);
    this.peripherals.push(driver);
  }

  removeDriver(id: string) {
    this.peripherals = this.peripherals.filter(p => p.id !== id);
  }

  clearScriptableDrivers() {
    this.peripherals = this.peripherals.filter(p => !(p instanceof ScriptableDriver));
  }

  processIncoming(
    protocol: ProtocolType,
    bytes: number[],
    onAsyncResponse?: (res: PeripheralResponse) => void
  ): PeripheralResponse[] {
    const responses: PeripheralResponse[] = [];
    
    for (const p of this.peripherals) {
      if (p.protocol === protocol) {
        p.onAsyncResponse = onAsyncResponse;
        const res = p.process(bytes);
        if (res) responses.push(res);
      }
    }
    
    return responses;
  }
}
