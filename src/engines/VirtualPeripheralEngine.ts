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

// ── Modem Dialect Architecture ───────────────────────────────────────────────

export type ModemVendor = 'simcom' | 'quectel';

export interface SmsMessage {
  index: number;
  status: 'REC UNREAD' | 'REC READ' | 'STO UNSENT' | 'STO SENT';
  sender: string;
  timestamp: string;
  body: string;
}

export interface PhonebookEntry {
  index: number;
  number: string;
  type: number; // 129=domestic, 145=international
  name: string;
}

export interface ModemSharedState {
  mode: string;
  transparentBuffer: number[];
  httpInitialized: boolean;
  url: string;
  contentType: string;
  postData: string;
  postDataLength: number;
  responseStatus: number;
  responseBody: string;
  tcpHost: string;
  tcpPort: number;
  files: Record<string, string>;
  writeFilename: string;
  writeFileLength: number;
  sslVersion: number;
  sslAuthMode: number;
  sslCaCert: string;
  sslClientCert: string;
  sslClientKey: string;
  mqttConnected: boolean;
  mqttBroker: string;
  mqttSubscribedTopics: string[];
  cmeeMode: number;
  batteryLevel: number;
  batteryVoltage: number;
  clockOffsetMs: number;
  pdpActive: boolean;
  pdpIp: string;
  cnmiMode: number;
  smsInbox: SmsMessage[];
  smsCmgf: number; // 0=PDU, 1=text
  // PIN
  pinState: 'READY' | 'SIM PIN' | 'SIM PUK';
  pinCode: string;
  pinAttempts: number;
  // Voice call
  callState: 'idle' | 'ringing' | 'active';
  callNumber: string;
  callDirection: 'MO' | 'MT';
  clipEnabled: boolean;
  // PSM / eDRX
  psmEnabled: boolean;
  psmTau: string;
  psmActiveTime: string;
  edrxEnabled: boolean;
  edrxAcT: number;
  edrxCycle: string;
  // Cell info / roaming
  cregN: number; // 0=disabled, 1=URC only, 2=URC+location
  isRoaming: boolean;
  cellLac: string;
  cellCi: string;
  roamingOperator: string;
  // Phonebook
  phonebook: PhonebookEntry[];
  pbStorage: 'SM' | 'ME';
  // USSD
  ussdActive: boolean;
  // GPS/GNSS
  gpsEnabled: boolean;
  gpsFix: boolean;
  gpsLat: number;
  gpsLon: number;
  gpsAlt: number;
  gpsSpeed: number;
  gpsCourse: number;
  gpsSatellites: number;
  subscriberNumber: string;
  onAsyncResponse?: (res: PeripheralResponse) => void;
}

export interface ModemDialect {
  readonly vendorName: ModemVendor;
  handleCommand(cmd: string, state: ModemSharedState): { bytes: number[]; log: string } | null;
  handleIntermediateData(mode: string, input: number[], state: ModemSharedState): { bytes: number[]; log: string } | null;
}

function createInitialModemState(): ModemSharedState {
  return {
    mode: 'command',
    transparentBuffer: [],
    httpInitialized: false,
    url: '',
    contentType: 'application/json',
    postData: '',
    postDataLength: 0,
    responseStatus: 0,
    responseBody: '',
    tcpHost: '',
    tcpPort: 0,
    files: {},
    writeFilename: '',
    writeFileLength: 0,
    sslVersion: 3,
    sslAuthMode: 0,
    sslCaCert: '',
    sslClientCert: '',
    sslClientKey: '',
    mqttConnected: false,
    mqttBroker: '',
    mqttSubscribedTopics: [],
    cmeeMode: 0,
    batteryLevel: 87,
    batteryVoltage: 3952,
    clockOffsetMs: 0,
    pdpActive: false,
    pdpIp: '10.78.12.143',
    cnmiMode: 0,
    smsInbox: [
      { index: 1, status: 'REC UNREAD', sender: '+905551234567', timestamp: '26/06/14,09:15:00+12', body: 'UART Simulator Test Message 1' },
      { index: 2, status: 'REC READ',   sender: '+905557654321', timestamp: '26/06/14,11:30:00+12', body: 'Device remote config: RESET' },
      { index: 3, status: 'REC UNREAD', sender: '+905559876543', timestamp: '26/06/15,08:00:00+12', body: 'STATUS?' },
    ],
    smsCmgf: 1,
    pinState: 'READY',
    pinCode: '1234',
    pinAttempts: 3,
    callState: 'idle',
    callNumber: '',
    callDirection: 'MO',
    clipEnabled: false,
    psmEnabled: false,
    psmTau: '00000001',
    psmActiveTime: '00000001',
    edrxEnabled: false,
    edrxAcT: 4,
    edrxCycle: '0010',
    cregN: 0,
    isRoaming: false,
    cellLac: '00E1',
    cellCi: 'A1B2',
    roamingOperator: 'Turkcell',
    phonebook: [
      { index: 1, number: '+905551234567', type: 145, name: 'Alice' },
      { index: 2, number: '+905559876543', type: 145, name: 'Bob' },
      { index: 3, number: '02125556677',   type: 129, name: 'Office' },
    ],
    pbStorage: 'SM',
    ussdActive: false,
    gpsEnabled: false,
    gpsFix: false,
    gpsLat: 41.0082376,
    gpsLon: 28.9783589,
    gpsAlt: 34.2,
    gpsSpeed: 0.0,
    gpsCourse: 0.0,
    gpsSatellites: 7,
    subscriberNumber: '+905552223344',
  };
}

function toBytes(s: string): number[] {
  return Array.from(s).map(c => c.charCodeAt(0));
}

function applySslConfig(cmd: string, state: ModemSharedState): { bytes: number[]; log: string } {
  const match = cmd.match(/AT\+(?:Q|C)SSLCFG="?([^",\s]+)"?,\s*(\d+)\s*,\s*"?([^"\r\n]+)"?/i);
  if (!match) return { bytes: toBytes('\r\nERROR\r\n'), log: `Modem: Invalid SSL config format: ${cmd}` };
  const param = match[1].toLowerCase();
  const value = match[3];
  let log = '';
  if (param === 'sslversion') {
    state.sslVersion = parseInt(value, 10);
    log = `Modem: SSL Config -> Version = ${state.sslVersion}`;
  } else if (param === 'authmode') {
    state.sslAuthMode = parseInt(value, 10);
    log = `Modem: SSL Config -> AuthMode = ${state.sslAuthMode}`;
  } else if (param === 'seclevel') {
    const level = parseInt(value, 10);
    state.sslAuthMode = level === 2 ? 3 : level === 1 ? 2 : 0;
    log = `Modem: SSL Config -> SecLevel = ${level} (AuthMode = ${state.sslAuthMode})`;
  } else if (param === 'cacert') {
    state.sslCaCert = value;
    log = `Modem: SSL Config -> CACert = ${state.sslCaCert}`;
  } else if (param === 'clientcert') {
    state.sslClientCert = value;
    log = `Modem: SSL Config -> ClientCert = ${state.sslClientCert}`;
  } else if (param === 'clientkey') {
    state.sslClientKey = value;
    log = `Modem: SSL Config -> ClientKey = ${state.sslClientKey}`;
  } else {
    log = `Modem: SSL Config -> Configured ${param} = ${value}`;
  }
  return { bytes: toBytes('\r\nOK\r\n'), log };
}

function nmeaChecksum(sentence: string): string {
  let cs = 0;
  for (const c of sentence) cs ^= c.charCodeAt(0);
  return cs.toString(16).toUpperCase().padStart(2, '0');
}

function gpsNmea(state: ModemSharedState, type: 'GGA' | 'RMC' | 'GSV' = 'GGA'): string {
  const now = new Date(Date.now() + state.clockOffsetMs);
  const hms = `${now.getUTCHours().toString().padStart(2,'0')}${now.getUTCMinutes().toString().padStart(2,'0')}${now.getUTCSeconds().toString().padStart(2,'0')}.00`;
  const latDeg = Math.floor(Math.abs(state.gpsLat));
  const latMin = ((Math.abs(state.gpsLat) - latDeg) * 60).toFixed(4).padStart(7, '0');
  const latStr = `${latDeg.toString().padStart(2,'0')}${latMin}`;
  const latDir = state.gpsLat >= 0 ? 'N' : 'S';
  const lonDeg = Math.floor(Math.abs(state.gpsLon));
  const lonMin = ((Math.abs(state.gpsLon) - lonDeg) * 60).toFixed(4).padStart(7, '0');
  const lonStr = `${lonDeg.toString().padStart(3,'0')}${lonMin}`;
  const lonDir = state.gpsLon >= 0 ? 'E' : 'W';

  if (type === 'GGA') {
    const body = `GPGGA,${hms},${latStr},${latDir},${lonStr},${lonDir},${state.gpsFix ? 1 : 0},${state.gpsSatellites.toString().padStart(2,'0')},1.50,${state.gpsAlt.toFixed(1)},M,37.0,M,,`;
    return `$${body}*${nmeaChecksum(body)}`;
  }
  if (type === 'RMC') {
    const dmy = `${now.getUTCDate().toString().padStart(2,'0')}${(now.getUTCMonth()+1).toString().padStart(2,'0')}${now.getUTCFullYear().toString().slice(2)}`;
    const knots = (state.gpsSpeed / 1.852).toFixed(2);
    const body = `GPRMC,${hms},${state.gpsFix ? 'A' : 'V'},${latStr},${latDir},${lonStr},${lonDir},${knots},${state.gpsCourse.toFixed(2)},${dmy},,`;
    return `$${body}*${nmeaChecksum(body)}`;
  }
  if (type === 'GSV') {
    const body = `GPGSV,1,1,${state.gpsSatellites.toString().padStart(2,'0')},01,72,045,45,02,51,162,43,03,38,287,41,04,29,320,38`;
    return `$${body}*${nmeaChecksum(body)}`;
  }
  return '';
}

function modemClock(state: ModemSharedState): string {
  const d = new Date(Date.now() + state.clockOffsetMs);
  const yy = d.getFullYear().toString().slice(2);
  const MM = (d.getMonth()+1).toString().padStart(2,'0');
  const dd = d.getDate().toString().padStart(2,'0');
  const HH = d.getHours().toString().padStart(2,'0');
  const mm = d.getMinutes().toString().padStart(2,'0');
  const ss = d.getSeconds().toString().padStart(2,'0');
  const tz = Math.round(d.getTimezoneOffset() / -15);
  return `${yy}/${MM}/${dd},${HH}:${mm}:${ss}${tz >= 0 ? '+' : ''}${tz.toString().padStart(2,'0')}`;
}

function pack7bit(text: string): string {
  const bytes: number[] = [];
  let carry = 0;
  let carryBits = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i) & 0x7F;
    bytes.push(((c << carryBits) | carry) & 0xFF);
    carry = c >> (8 - carryBits);
    if (++carryBits === 7) { bytes.push(carry); carry = 0; carryBits = 0; }
  }
  if (carryBits > 0) bytes.push(carry);
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function encodeSmsDeliverPdu(sender: string, message: string): { pdu: string; length: number } {
  const digits = sender.replace(/^\+/, '');
  const isIntl = sender.startsWith('+');
  const addrType = isIntl ? '91' : '81';
  const padded = digits.length % 2 === 1 ? digits + 'F' : digits;
  let addrOctets = '';
  for (let i = 0; i < padded.length; i += 2) addrOctets += padded[i + 1] + padded[i];
  const oa = digits.length.toString(16).padStart(2, '0').toUpperCase() + addrType + addrOctets;
  const udl = message.length.toString(16).padStart(2, '0').toUpperCase();
  const ud = pack7bit(message);
  const pduBody = '04' + oa + '00' + '00' + '00000000000000' + udl + ud;
  return { pdu: '00' + pduBody, length: pduBody.length / 2 };
}

function cgnsinf(state: ModemSharedState): string {
  if (!state.gpsEnabled) return '+CGNSINF: 0,,,,,,,,,,,,,,,,,,,,';
  if (!state.gpsFix)     return '+CGNSINF: 1,0,,,,,,,,,,,,,,,,,,,,';
  const d = new Date(Date.now() + state.clockOffsetMs);
  const ts = `${d.getUTCFullYear()}${(d.getUTCMonth()+1).toString().padStart(2,'0')}${d.getUTCDate().toString().padStart(2,'0')}${d.getUTCHours().toString().padStart(2,'0')}${d.getUTCMinutes().toString().padStart(2,'0')}${d.getUTCSeconds().toString().padStart(2,'0')}.000`;
  return `+CGNSINF: 1,1,${ts},${state.gpsLat.toFixed(6)},${state.gpsLon.toFixed(6)},${state.gpsAlt.toFixed(3)},${state.gpsSpeed.toFixed(2)},${state.gpsCourse.toFixed(1)},1,,1.5,1.8,1.1,,${state.gpsSatellites},5,,,28,,`;
}

// ── SIMCom Dialect (SIM800 / SIM7600 family) ─────────────────────────────────

class SIMComDialect implements ModemDialect {
  readonly vendorName: ModemVendor = 'simcom';

  handleCommand(cmd: string, state: ModemSharedState): { bytes: number[]; log: string } | null {
    const upperCmd = cmd.toUpperCase();
    let reply = '';
    let log = '';

    if (upperCmd === 'AT+HTTPINIT') {
      state.httpInitialized = true;
      reply = '\r\nOK\r\n';
      log = 'Modem: HTTP service initialized';
    } else if (upperCmd.startsWith('AT+HTTPPARA=')) {
      const urlMatch = cmd.match(/"?URL"?\s*,\s*"([^"]+)"/i);
      const contentMatch = cmd.match(/"?CONTENT"?\s*,\s*"([^"]+)"/i);
      if (urlMatch) {
        state.url = urlMatch[1];
        reply = '\r\nOK\r\n';
        log = `Modem: Set URL -> ${state.url}`;
      } else if (contentMatch) {
        state.contentType = contentMatch[1];
        reply = '\r\nOK\r\n';
        log = `Modem: Set Content-Type -> ${state.contentType}`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Unknown HTTPPARA parameter: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+HTTPDATA=')) {
      const match = upperCmd.match(/AT\+HTTPDATA=(\d+),(\d+)/);
      if (match) {
        state.postDataLength = parseInt(match[1], 10);
        state.mode = 'httpdata';
        state.transparentBuffer = [];
        reply = '\r\nDOWNLOAD\r\n';
        log = `Modem: Waiting for HTTPDATA body (${state.postDataLength} bytes)`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid HTTPDATA format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+HTTPACTION=')) {
      const match = upperCmd.match(/AT\+HTTPACTION=(\d+)/);
      if (match) {
        const method = parseInt(match[1], 10);
        const methodName = ['GET', 'POST', 'PUT', 'DELETE'][method] ?? `UNKNOWN(${method})`;
        reply = '\r\nOK\r\n';
        log = `Modem: HTTPACTION triggered (Method: ${methodName})`;
        this.doHttpAction(method, state);
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid HTTPACTION format: ${cmd}`;
      }
    } else if (upperCmd === 'AT+HTTPREAD') {
      reply = `\r\n+HTTPREAD: ${state.responseBody.length}\r\n${state.responseBody}\r\n\r\nOK\r\n`;
      log = `Modem: HTTPREAD (${state.responseBody.length} bytes returned)`;
    } else if (upperCmd === 'AT+HTTPTERM') {
      state.httpInitialized = false;
      reply = '\r\nOK\r\n';
      log = 'Modem: HTTP service terminated';
    } else if (upperCmd.startsWith('AT+FSCREATE=')) {
      const match = cmd.match(/AT\+FSCREATE="?([^"\s]+)"?/i);
      if (match) {
        state.files[match[1]] = '';
        reply = '\r\nOK\r\n';
        log = `Modem: Created file "${match[1]}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid FSCREATE format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+FSWRITE=')) {
      const match = cmd.match(/AT\+FSWRITE="?([^"\s,]+)"?,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match) {
        state.writeFilename = match[1];
        state.writeFileLength = parseInt(match[3], 10);
        state.mode = 'filewrite';
        state.transparentBuffer = [];
        reply = '\r\n> ';
        log = `Modem: Writing ${state.writeFileLength} bytes to file "${state.writeFilename}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid FSWRITE format: ${cmd}`;
      }
    } else if (upperCmd === 'AT+FSLS') {
      const list = Object.keys(state.files);
      reply = `\r\n+FSLS: ${list.join(', ')}\r\n\r\nOK\r\n`;
      log = `Modem: Files listed -> [${list.join(', ')}]`;
    } else if (upperCmd.startsWith('AT+FSFLSIZE=')) {
      const match = cmd.match(/AT\+FSFLSIZE="?([^"\s]+)"?/i);
      if (match && state.files[match[1]] !== undefined) {
        reply = `\r\n+FSFLSIZE: ${state.files[match[1]].length}\r\n\r\nOK\r\n`;
        log = `Modem: Checked size of "${match[1]}" -> ${state.files[match[1]].length} bytes`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: File not found or invalid format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+FSDEL=')) {
      const match = cmd.match(/AT\+FSDEL="?([^"\s]+)"?/i);
      if (match && state.files[match[1]] !== undefined) {
        delete state.files[match[1]];
        reply = '\r\nOK\r\n';
        log = `Modem: Deleted file "${match[1]}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: File not found or invalid format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+FSREAD=')) {
      const match = cmd.match(/AT\+FSREAD="?([^"\s,]+)"?,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match && state.files[match[1]] !== undefined) {
        const data = state.files[match[1]].substring(parseInt(match[4], 10), parseInt(match[4], 10) + parseInt(match[3], 10));
        reply = `\r\n+FSREAD: ${data.length}\r\n${data}\r\n\r\nOK\r\n`;
        log = `Modem: Read ${data.length} bytes from file "${match[1]}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: File not found or invalid format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+CSSLCFG=') || upperCmd.startsWith('AT+QSSLCFG=')) {
      return applySslConfig(cmd, state);
    } else if (upperCmd.startsWith('AT+MQTTCONN=') || upperCmd.startsWith('AT+QMCONN=')) {
      const match = cmd.match(/(?:MQTTCONN|QMCONN)="?([^",\s]+)"?,\s*(\d+)(?:,\s*(\d+))?/i);
      if (match) {
        state.mqttBroker = match[1];
        const port = parseInt(match[2], 10);
        const sslCtx = match[3] ? parseInt(match[3], 10) : 0;
        const needsCreds = sslCtx > 0 && (state.sslAuthMode === 1 || state.sslAuthMode === 3);
        const hasCert = state.sslClientCert && state.files[state.sslClientCert];
        const hasKey = state.sslClientKey && state.files[state.sslClientKey];
        if (needsCreds && (!hasCert || !hasKey)) {
          reply = '\r\nERROR\r\n';
          log = 'Modem: MQTT Secure Connection Failed. Missing client credentials.';
        } else {
          state.mqttConnected = true;
          reply = '\r\nOK\r\n';
          const sslLog = needsCreds ? ` (MQTTS Handshake OK, cert: "${state.sslClientCert}")` : '';
          log = `Modem: Connected to MQTT Broker -> ${state.mqttBroker}:${port}${sslLog}`;
        }
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid MQTTCONN format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+MQTTPUB=') || upperCmd.startsWith('AT+QMPUB=')) {
      const match = cmd.match(/(?:MQTTPUB|QMPUB)="?([^",\s]+)"?,\s*"([^"]+)"/i);
      if (!state.mqttConnected) {
        reply = '\r\nERROR\r\n';
        log = 'Modem: MQTT Publish failed (Not connected to broker)';
      } else if (match) {
        reply = '\r\nOK\r\n';
        log = `Modem: MQTT Published -> Topic: "${match[1]}", Message: "${match[2]}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid MQTTPUB format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+MQTTSUB=') || upperCmd.startsWith('AT+QMSUB=')) {
      const match = cmd.match(/(?:MQTTSUB|QMSUB)="?([^"\r\n]+)"?/i);
      if (!state.mqttConnected) {
        reply = '\r\nERROR\r\n';
        log = 'Modem: MQTT Subscribe failed (Not connected to broker)';
      } else if (match) {
        state.mqttSubscribedTopics.push(match[1]);
        reply = '\r\nOK\r\n';
        log = `Modem: MQTT Subscribed -> Topic: "${match[1]}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem: Invalid MQTTSUB format: ${cmd}`;
      }
    }
    // ── GPS/GNSS (SIM7600 / A7670 series) ────────────────────────────────
    else if (upperCmd.startsWith('AT+CGNSPWR=')) {
      const match = upperCmd.match(/AT\+CGNSPWR=(\d+)/);
      if (match) {
        state.gpsEnabled = match[1] === '1';
        if (state.gpsEnabled) setTimeout(() => { state.gpsFix = true; }, 2000);
        else state.gpsFix = false;
        reply = '\r\nOK\r\n';
        log = `Modem: GPS power -> ${state.gpsEnabled ? 'ON' : 'OFF'}`;
      } else {
        reply = '\r\nERROR\r\n'; log = `Modem: Invalid CGNSPWR: ${cmd}`;
      }
    } else if (upperCmd === 'AT+CGNSPWR?') {
      reply = `\r\n+CGNSPWR: ${state.gpsEnabled ? 1 : 0}\r\n\r\nOK\r\n`;
      log = 'Modem: GPS power status query';
    } else if (upperCmd === 'AT+CGNSINF') {
      reply = `\r\n${cgnsinf(state)}\r\n\r\nOK\r\n`;
      log = state.gpsFix
        ? `Modem: CGNSINF -> lat=${state.gpsLat.toFixed(6)} lon=${state.gpsLon.toFixed(6)} alt=${state.gpsAlt}m`
        : 'Modem: CGNSINF (no fix)';
    } else if (upperCmd.startsWith('AT+CGNSURC=')) {
      const match = upperCmd.match(/AT\+CGNSURC=(\d+)/);
      const interval = match ? parseInt(match[1], 10) : 0;
      if (interval > 0 && state.gpsEnabled) {
        const timer = setInterval(() => {
          if (!state.gpsEnabled) { clearInterval(timer); return; }
          if (state.gpsFix) {
            state.onAsyncResponse?.({ bytes: toBytes(`\r\n${gpsNmea(state,'GGA')}\r\n${gpsNmea(state,'RMC')}\r\n`), log: 'Modem: GPS URC NMEA' });
          }
        }, interval * 1000);
      }
      reply = '\r\nOK\r\n'; log = `Modem: CGNSURC set (${cmd})`;
    } else if (upperCmd.startsWith('AT+CGNSTST=')) {
      reply = '\r\nOK\r\n'; log = `Modem: CGNSTST set (${cmd})`;
    } else {
      return null;
    }

    return { bytes: toBytes(reply), log };
  }

  handleIntermediateData(mode: string, input: number[], state: ModemSharedState): { bytes: number[]; log: string } | null {
    if (mode === 'filewrite') {
      for (const b of input) {
        state.transparentBuffer.push(b);
        if (state.transparentBuffer.length >= state.writeFileLength) {
          const data = String.fromCharCode(...state.transparentBuffer);
          state.files[state.writeFilename] = data;
          state.transparentBuffer = [];
          state.mode = 'command';
          return { bytes: toBytes('\r\nOK\r\n'), log: `Modem: Saved file "${state.writeFilename}" (${data.length} bytes)` };
        }
      }
      return { bytes: [], log: 'Modem: Writing file data...' };
    }

    if (mode === 'httpdata') {
      for (const b of input) {
        state.transparentBuffer.push(b);
        if (state.transparentBuffer.length >= state.postDataLength) {
          state.postData = String.fromCharCode(...state.transparentBuffer);
          state.transparentBuffer = [];
          state.mode = 'command';
          return { bytes: toBytes('\r\nOK\r\n'), log: `Modem: HTTPDATA download complete (${state.postData.length} bytes)` };
        }
      }
      return { bytes: [], log: 'Modem: Downloading HTTPDATA...' };
    }

    return null;
  }

  private doHttpAction(method: number, state: ModemSharedState) {
    if (!state.url) {
      state.onAsyncResponse?.({ bytes: toBytes(`\r\n+HTTPACTION: ${method},600,0\r\n`), log: 'Modem: HTTP Action Failed (No URL set)' });
      return;
    }
    const isSecure = state.url.startsWith('https://');
    if (isSecure && (state.sslAuthMode === 1 || state.sslAuthMode === 3)) {
      if (!state.sslClientCert || !state.files[state.sslClientCert] || !state.sslClientKey || !state.files[state.sslClientKey]) {
        state.onAsyncResponse?.({ bytes: toBytes(`\r\n+HTTPACTION: ${method},603,0\r\n`), log: `Modem: HTTP SSL Handshake Failed. Missing client credentials.` });
        return;
      }
    }
    const methodStr = ['GET', 'POST', 'PUT', 'DELETE'][method] ?? 'GET';
    const sslLog = isSecure && (state.sslAuthMode === 1 || state.sslAuthMode === 3) ? ` (Mutual TLS OK, cert: "${state.sslClientCert}")` : '';
    fetch(state.url, {
      method: methodStr,
      headers: (methodStr === 'POST' || methodStr === 'PUT') ? { 'Content-Type': state.contentType } : undefined,
      body: (methodStr === 'POST' || methodStr === 'PUT') ? state.postData : undefined,
    })
      .then(async res => {
        const text = await res.text();
        state.responseStatus = res.status;
        state.responseBody = text;
        state.onAsyncResponse?.({ bytes: toBytes(`\r\n+HTTPACTION: ${method},${res.status},${text.length}\r\n`), log: `Modem: HTTP Response -> ${res.status} (${text.length} bytes)${sslLog}` });
      })
      .catch(err => {
        state.responseStatus = 600;
        state.responseBody = '';
        state.onAsyncResponse?.({ bytes: toBytes(`\r\n+HTTPACTION: ${method},600,0\r\n`), log: `Modem: HTTP Error -> ${err.message}` });
      });
  }
}

// ── Quectel Dialect (EC21 / EC25 / BG96 family) ──────────────────────────────

class QuectelDialect implements ModemDialect {
  readonly vendorName: ModemVendor = 'quectel';

  private q_urlLength = 0;
  private q_openFiles: Record<number, string> = {};
  private q_nextHandle = 1;
  private q_writeHandle = 0;
  private q_writeLength = 0;
  private q_mqttConns: Record<number, { host: string; port: number; connected: boolean }> = {};
  private q_mqttPub: { connId: number; msgId: number; topic: string } | null = null;

  handleCommand(cmd: string, state: ModemSharedState): { bytes: number[]; log: string } | null {
    const upperCmd = cmd.toUpperCase();
    let reply = '';
    let log = '';

    // ── HTTP ─────────────────────────────────────────────────────────────
    if (upperCmd.startsWith('AT+QHTTPURL=')) {
      const match = upperCmd.match(/AT\+QHTTPURL=(\d+),(\d+)/);
      if (match) {
        this.q_urlLength = parseInt(match[1], 10);
        state.mode = 'q_urlwrite';
        state.transparentBuffer = [];
        reply = '\r\nCONNECT\r\n';
        log = `Modem [Quectel]: QHTTPURL ready, expecting ${this.q_urlLength} bytes`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QHTTPURL format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QHTTPGET=')) {
      reply = '\r\nOK\r\n';
      log = `Modem [Quectel]: QHTTPGET triggered -> ${state.url}`;
      this.doHttpFetch('GET', state);
    } else if (upperCmd.startsWith('AT+QHTTPPOST=')) {
      const match = upperCmd.match(/AT\+QHTTPPOST=(\d+),(\d+),(\d+)/);
      if (match) {
        state.postDataLength = parseInt(match[1], 10);
        state.mode = 'q_httppostdata';
        state.transparentBuffer = [];
        reply = '\r\nCONNECT\r\n';
        log = `Modem [Quectel]: QHTTPPOST ready, expecting ${state.postDataLength} bytes`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QHTTPPOST format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QHTTPREAD=')) {
      reply = `\r\n+QHTTPREAD: ${state.responseBody.length}\r\n${state.responseBody}\r\n\r\nOK\r\n`;
      log = `Modem [Quectel]: QHTTPREAD (${state.responseBody.length} bytes)`;
    } else if (upperCmd === 'AT+QHTTPSTOP' || upperCmd === 'AT+QHTTPTERM') {
      state.httpInitialized = false;
      reply = '\r\nOK\r\n';
      log = 'Modem [Quectel]: HTTP service stopped';
    }
    // ── Filesystem ───────────────────────────────────────────────────────
    else if (upperCmd === 'AT+QFLST' || upperCmd.startsWith('AT+QFLST=')) {
      const list = Object.keys(state.files);
      const lines = list.map(f => `+QFLST: "${f}",${state.files[f].length}`).join('\r\n');
      reply = `\r\n${lines}\r\n\r\nOK\r\n`;
      log = `Modem [Quectel]: FS listed -> [${list.join(', ')}]`;
    } else if (upperCmd.startsWith('AT+QFOPEN=')) {
      const match = cmd.match(/AT\+QFOPEN="([^"]+)",(\d+)/i);
      if (match) {
        const filename = match[1];
        const mode = parseInt(match[2], 10);
        if (mode === 2 || !state.files[filename]) state.files[filename] = '';
        const handle = this.q_nextHandle++;
        this.q_openFiles[handle] = filename;
        reply = `\r\n+QFOPEN: ${handle}\r\n\r\nOK\r\n`;
        log = `Modem [Quectel]: QFOPEN "${filename}" -> handle ${handle}`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QFOPEN format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QFWRITE=')) {
      const match = upperCmd.match(/AT\+QFWRITE=(\d+),(\d+)/);
      if (match) {
        this.q_writeHandle = parseInt(match[1], 10);
        this.q_writeLength = parseInt(match[2], 10);
        state.mode = 'q_filewrite';
        state.transparentBuffer = [];
        reply = '\r\nCONNECT\r\n';
        log = `Modem [Quectel]: QFWRITE handle=${this.q_writeHandle}, expecting ${this.q_writeLength} bytes`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QFWRITE format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QFREAD=')) {
      const match = upperCmd.match(/AT\+QFREAD=(\d+),(\d+)/);
      if (match) {
        const handle = parseInt(match[1], 10);
        const size = parseInt(match[2], 10);
        const filename = this.q_openFiles[handle];
        if (filename !== undefined && state.files[filename] !== undefined) {
          const data = state.files[filename].substring(0, size);
          reply = `\r\nCONNECT\r\n${data}\r\n+QFREAD: ${data.length}\r\n\r\nOK\r\n`;
          log = `Modem [Quectel]: QFREAD handle=${handle} -> ${data.length} bytes from "${filename}"`;
        } else {
          reply = '\r\nERROR\r\n';
          log = `Modem [Quectel]: QFREAD failed: handle ${handle} not open`;
        }
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QFREAD format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QFCLOSE=')) {
      const match = upperCmd.match(/AT\+QFCLOSE=(\d+)/);
      if (match) {
        const handle = parseInt(match[1], 10);
        const filename = this.q_openFiles[handle];
        delete this.q_openFiles[handle];
        reply = '\r\nOK\r\n';
        log = `Modem [Quectel]: QFCLOSE handle=${handle} ("${filename ?? '?'}")`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QFCLOSE format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QFDEL=')) {
      const match = cmd.match(/AT\+QFDEL="([^"]+)"/i);
      if (match && state.files[match[1]] !== undefined) {
        delete state.files[match[1]];
        reply = '\r\nOK\r\n';
        log = `Modem [Quectel]: QFDEL deleted "${match[1]}"`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: QFDEL failed, file not found: ${cmd}`;
      }
    }
    // ── SSL ──────────────────────────────────────────────────────────────
    else if (upperCmd.startsWith('AT+QSSLCFG=')) {
      return applySslConfig(cmd, state);
    }
    // ── MQTT ─────────────────────────────────────────────────────────────
    else if (upperCmd.startsWith('AT+QMTOPEN=')) {
      const match = cmd.match(/AT\+QMTOPEN=(\d+),"([^"]+)",(\d+)/i);
      if (match) {
        const connId = parseInt(match[1], 10);
        this.q_mqttConns[connId] = { host: match[2], port: parseInt(match[3], 10), connected: false };
        reply = '\r\nOK\r\n';
        log = `Modem [Quectel]: QMTOPEN connId=${connId} -> ${match[2]}:${match[3]}`;
        setTimeout(() => state.onAsyncResponse?.({ bytes: toBytes(`\r\n+QMTOPEN: ${connId},0\r\n`), log: `Modem [Quectel]: QMTOPEN URC connId=${connId} opened` }), 50);
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QMTOPEN format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QMTCONN=')) {
      const match = cmd.match(/AT\+QMTCONN=(\d+),"([^"]+)"/i);
      if (match) {
        const connId = parseInt(match[1], 10);
        const conn = this.q_mqttConns[connId];
        if (!conn) {
          reply = '\r\nERROR\r\n';
          log = `Modem [Quectel]: QMTCONN failed: connId=${connId} not opened`;
        } else {
          const ssl = this.checkMqttSsl(connId, state);
          if (!ssl.ok) {
            reply = '\r\nERROR\r\n';
            log = `Modem [Quectel]: QMTCONN SSL failed: ${ssl.reason}`;
          } else {
            conn.connected = true;
            state.mqttConnected = true;
            state.mqttBroker = conn.host;
            reply = '\r\nOK\r\n';
            log = `Modem [Quectel]: QMTCONN connId=${connId} clientId="${match[2]}"${ssl.log}`;
            setTimeout(() => state.onAsyncResponse?.({ bytes: toBytes(`\r\n+QMTCONN: ${connId},0,0\r\n`), log: `Modem [Quectel]: QMTCONN URC connId=${connId} connected` }), 50);
          }
        }
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QMTCONN format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QMTSUB=')) {
      const match = cmd.match(/AT\+QMTSUB=(\d+),(\d+),"([^"]+)",(\d+)/i);
      if (match) {
        const connId = parseInt(match[1], 10);
        const msgId = parseInt(match[2], 10);
        const topic = match[3];
        const qos = parseInt(match[4], 10);
        if (!this.q_mqttConns[connId]?.connected) {
          reply = '\r\nERROR\r\n';
          log = `Modem [Quectel]: QMTSUB failed: connId=${connId} not connected`;
        } else {
          state.mqttSubscribedTopics.push(topic);
          reply = '\r\nOK\r\n';
          log = `Modem [Quectel]: QMTSUB connId=${connId} topic="${topic}" qos=${qos}`;
          setTimeout(() => state.onAsyncResponse?.({ bytes: toBytes(`\r\n+QMTSUB: ${connId},${msgId},0,${qos}\r\n`), log: `Modem [Quectel]: QMTSUB URC subscribed to "${topic}"` }), 50);
        }
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QMTSUB format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QMTPUB=')) {
      const match = cmd.match(/AT\+QMTPUB=(\d+),(\d+),(\d+),(\d+),"([^"]+)"/i);
      if (match) {
        const connId = parseInt(match[1], 10);
        if (!this.q_mqttConns[connId]?.connected) {
          reply = '\r\nERROR\r\n';
          log = `Modem [Quectel]: QMTPUB failed: connId=${connId} not connected`;
        } else {
          this.q_mqttPub = { connId, msgId: parseInt(match[2], 10), topic: match[5] };
          state.mode = 'q_mqttpub';
          state.transparentBuffer = [];
          reply = '\r\n> ';
          log = `Modem [Quectel]: QMTPUB ready, connId=${connId} topic="${match[5]}", waiting for payload (Ctrl+Z)`;
        }
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QMTPUB format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QMTCLOSE=')) {
      const match = upperCmd.match(/AT\+QMTCLOSE=(\d+)/);
      if (match) {
        const connId = parseInt(match[1], 10);
        delete this.q_mqttConns[connId];
        if (Object.keys(this.q_mqttConns).length === 0) state.mqttConnected = false;
        reply = '\r\nOK\r\n';
        log = `Modem [Quectel]: QMTCLOSE connId=${connId}`;
      } else {
        reply = '\r\nERROR\r\n';
        log = `Modem [Quectel]: Invalid QMTCLOSE format: ${cmd}`;
      }
    }
    // ── GPS/GNSS (BG96 / EC21 series) ────────────────────────────────────
    else if (upperCmd.startsWith('AT+QGPS=')) {
      const match = upperCmd.match(/AT\+QGPS=(\d+)/);
      if (match) {
        state.gpsEnabled = match[1] !== '0';
        if (state.gpsEnabled) setTimeout(() => { state.gpsFix = true; }, 2000);
        else state.gpsFix = false;
        reply = '\r\nOK\r\n';
        log = `Modem [Quectel]: GPS power -> ${state.gpsEnabled ? 'ON' : 'OFF'}`;
      } else {
        reply = '\r\nERROR\r\n'; log = `Modem [Quectel]: Invalid QGPS: ${cmd}`;
      }
    } else if (upperCmd === 'AT+QGPS?') {
      reply = `\r\n+QGPS: ${state.gpsEnabled ? 1 : 0}\r\n\r\nOK\r\n`;
      log = 'Modem [Quectel]: GPS status query';
    } else if (upperCmd === 'AT+QGPSEND') {
      state.gpsEnabled = false; state.gpsFix = false;
      reply = '\r\nOK\r\n'; log = 'Modem [Quectel]: GPS powered off';
    } else if (upperCmd.startsWith('AT+QGPSLOC')) {
      if (!state.gpsEnabled || !state.gpsFix) {
        reply = '\r\n+CME ERROR: 516\r\n';
        log = 'Modem [Quectel]: QGPSLOC failed (no fix yet)';
      } else {
        const d = new Date(Date.now() + state.clockOffsetMs);
        const hms = `${d.getUTCHours().toString().padStart(2,'0')}${d.getUTCMinutes().toString().padStart(2,'0')}${d.getUTCSeconds().toString().padStart(2,'0')}.00`;
        const dmy = `${d.getUTCDate().toString().padStart(2,'0')}${(d.getUTCMonth()+1).toString().padStart(2,'0')}${d.getUTCFullYear().toString().slice(2)}`;
        reply = `\r\n+QGPSLOC: ${hms},${state.gpsLat.toFixed(6)},${state.gpsLon.toFixed(6).padStart(10,'0')},1.50,${state.gpsAlt.toFixed(1)},1,${state.gpsCourse.toFixed(2)},${state.gpsSpeed.toFixed(2)},0.0,${dmy},${state.gpsSatellites.toString().padStart(2,'0')}\r\n\r\nOK\r\n`;
        log = `Modem [Quectel]: QGPSLOC -> lat=${state.gpsLat.toFixed(6)} lon=${state.gpsLon.toFixed(6)}`;
      }
    } else if (upperCmd.startsWith('AT+QGPSGNMEA=')) {
      const match = cmd.match(/AT\+QGPSGNMEA="([^"]+)"/i);
      if (!state.gpsEnabled || !state.gpsFix) {
        reply = '\r\n+CME ERROR: 516\r\n'; log = 'Modem [Quectel]: QGPSGNMEA failed (no fix)';
      } else if (match) {
        const type = match[1].toUpperCase() as 'GGA' | 'RMC' | 'GSV';
        const nmea = gpsNmea(state, type);
        reply = `\r\n+QGPSGNMEA: "${nmea}"\r\n\r\nOK\r\n`;
        log = `Modem [Quectel]: QGPSGNMEA ${type} -> ${nmea}`;
      } else {
        reply = '\r\nERROR\r\n'; log = `Modem [Quectel]: Invalid QGPSGNMEA: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+QGPSCFG=')) {
      reply = '\r\nOK\r\n'; log = `Modem [Quectel]: QGPSCFG set (${cmd})`;
    } else {
      return null;
    }

    return { bytes: toBytes(reply), log };
  }

  handleIntermediateData(mode: string, input: number[], state: ModemSharedState): { bytes: number[]; log: string } | null {
    if (mode === 'q_urlwrite') {
      for (const b of input) {
        state.transparentBuffer.push(b);
        if (state.transparentBuffer.length >= this.q_urlLength) {
          state.url = String.fromCharCode(...state.transparentBuffer).trim();
          state.transparentBuffer = [];
          state.mode = 'command';
          return { bytes: toBytes('\r\nOK\r\n'), log: `Modem [Quectel]: URL set -> ${state.url}` };
        }
      }
      return { bytes: [], log: 'Modem [Quectel]: Collecting URL data...' };
    }

    if (mode === 'q_httppostdata') {
      for (const b of input) {
        state.transparentBuffer.push(b);
        if (state.transparentBuffer.length >= state.postDataLength) {
          state.postData = String.fromCharCode(...state.transparentBuffer);
          state.transparentBuffer = [];
          state.mode = 'command';
          this.doHttpFetch('POST', state);
          return { bytes: toBytes('\r\nOK\r\n'), log: `Modem [Quectel]: QHTTPPOST data received (${state.postData.length} bytes)` };
        }
      }
      return { bytes: [], log: 'Modem [Quectel]: Collecting POST data...' };
    }

    if (mode === 'q_filewrite') {
      for (const b of input) {
        state.transparentBuffer.push(b);
        if (state.transparentBuffer.length >= this.q_writeLength) {
          const data = String.fromCharCode(...state.transparentBuffer);
          const filename = this.q_openFiles[this.q_writeHandle];
          if (filename !== undefined) state.files[filename] = (state.files[filename] ?? '') + data;
          state.transparentBuffer = [];
          state.mode = 'command';
          return { bytes: toBytes(`\r\n+QFWRITE: ${data.length}\r\n\r\nOK\r\n`), log: `Modem [Quectel]: QFWRITE ${data.length} bytes to "${filename}"` };
        }
      }
      return { bytes: [], log: 'Modem [Quectel]: Writing file data...' };
    }

    if (mode === 'q_mqttpub') {
      for (const b of input) {
        if (b === 0x1A) {
          const payload = String.fromCharCode(...state.transparentBuffer).trim();
          state.transparentBuffer = [];
          state.mode = 'command';
          const pub = this.q_mqttPub;
          this.q_mqttPub = null;
          if (pub) {
            setTimeout(() => state.onAsyncResponse?.({ bytes: toBytes(`\r\n+QMTPUB: ${pub.connId},${pub.msgId},0\r\n`), log: `Modem [Quectel]: QMTPUB URC connId=${pub.connId} topic="${pub.topic}" payload="${payload}"` }), 50);
          }
          return { bytes: toBytes('\r\nOK\r\n'), log: `Modem [Quectel]: MQTT Published to "${pub?.topic}"` };
        }
        state.transparentBuffer.push(b);
      }
      return { bytes: [], log: 'Modem [Quectel]: Collecting MQTT publish payload...' };
    }

    return null;
  }

  private doHttpFetch(method: 'GET' | 'POST', state: ModemSharedState) {
    if (!state.url) {
      const urc = method === 'GET' ? '+QHTTPGET' : '+QHTTPPOST';
      state.onAsyncResponse?.({ bytes: toBytes(`\r\n${urc}: 0,600,0\r\n`), log: `Modem [Quectel]: ${urc} Failed (No URL set)` });
      return;
    }
    const urc = method === 'GET' ? '+QHTTPGET' : '+QHTTPPOST';
    fetch(state.url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': state.contentType } : undefined,
      body: method === 'POST' ? state.postData : undefined,
    })
      .then(async res => {
        const text = await res.text();
        state.responseStatus = res.status;
        state.responseBody = text;
        state.onAsyncResponse?.({ bytes: toBytes(`\r\n${urc}: 0,${res.status},${text.length}\r\n`), log: `Modem [Quectel]: ${urc} -> ${res.status} (${text.length} bytes)` });
      })
      .catch(err => {
        state.onAsyncResponse?.({ bytes: toBytes(`\r\n${urc}: 0,600,0\r\n`), log: `Modem [Quectel]: ${urc} Error -> ${err.message}` });
      });
  }

  private checkMqttSsl(connId: number, state: ModemSharedState): { ok: boolean; reason: string; log: string } {
    const conn = this.q_mqttConns[connId];
    if (!conn) return { ok: false, reason: 'Connection not found', log: '' };
    if (conn.port === 8883 && (state.sslAuthMode === 1 || state.sslAuthMode === 3)) {
      if (!state.sslClientCert || !state.files[state.sslClientCert] || !state.sslClientKey || !state.files[state.sslClientKey]) {
        return { ok: false, reason: `Missing credentials. Expected cert: "${state.sslClientCert}"`, log: '' };
      }
      return { ok: true, reason: '', log: ` (MQTTS Handshake OK, cert: "${state.sslClientCert}")` };
    }
    return { ok: true, reason: '', log: '' };
  }
}

// ── SIM Card / Modem Simulator (UART) ──────────
export class SimCardDriver extends PeripheralDriver {
  id = 'simcard';
  name = 'SIM Card Modem';
  protocol: ProtocolType = 'UART';

  private rxBuffer: number[] = [];
  private echo = true;
  private smsPhone = '';
  private smsIndex = 1;

  private sharedState: ModemSharedState = createInitialModemState();
  private dialect: ModemDialect;
  private gpsWalkTimer: ReturnType<typeof setInterval> | null = null;

  constructor(vendor: ModemVendor = 'simcom') {
    super({});
    this.dialect = vendor === 'quectel' ? new QuectelDialect() : new SIMComDialect();
    this.name = `SIM Card Modem [${vendor.toUpperCase()}]`;
  }

  setAsyncResponseCallback(callback: ((res: PeripheralResponse) => void) | undefined) {
    this.onAsyncResponse = callback;
    this.sharedState.onAsyncResponse = callback;
  }

  get vendor(): ModemVendor {
    return this.dialect.vendorName;
  }

  setVendor(vendor: ModemVendor) {
    this.dialect = vendor === 'quectel' ? new QuectelDialect() : new SIMComDialect();
    this.sharedState = createInitialModemState();
    this.sharedState.onAsyncResponse = this.onAsyncResponse;
    this.rxBuffer = [];
    this.echo = true;
    this.name = `SIM Card Modem [${vendor.toUpperCase()}]`;
  }

  setGpsPosition(lat: number, lon: number, alt: number) {
    this.sharedState.gpsLat = lat;
    this.sharedState.gpsLon = lon;
    this.sharedState.gpsAlt = alt;
  }

  setGpsWalkMode(enabled: boolean) {
    if (enabled && !this.gpsWalkTimer) {
      this.gpsWalkTimer = setInterval(() => {
        this.sharedState.gpsLat += (Math.random() - 0.5) * 0.0002;
        this.sharedState.gpsLon += (Math.random() - 0.5) * 0.0002;
        this.sharedState.gpsSpeed = Math.random() * 5;
        this.sharedState.gpsCourse = (this.sharedState.gpsCourse + (Math.random() - 0.5) * 10 + 360) % 360;
      }, 1000);
    } else if (!enabled && this.gpsWalkTimer) {
      clearInterval(this.gpsWalkTimer);
      this.gpsWalkTimer = null;
    }
  }

  process(input: number[]): PeripheralResponse | null {
    if (input.length === 0) return null;

    this.sharedState.onAsyncResponse = this.onAsyncResponse;

    const mode = this.sharedState.mode;

    if (mode === 'command') {
      const firstByte = this.rxBuffer.length > 0 ? this.rxBuffer[0] : input[0];
      if (firstByte !== 0x41 && firstByte !== 0x61 && firstByte !== 0x0D && firstByte !== 0x0A) {
        return null;
      }
    }

    let responseBytes: number[] = [];
    let logMsg = '';

    if (this.echo && mode === 'command') {
      responseBytes.push(...input);
    }

    // ── Core intermediate modes ───────────────────────────────────────────
    if (mode === 'smswrite') {
      for (const b of input) {
        if (b === 0x1A) {
          const message = String.fromCharCode(...this.sharedState.transparentBuffer);
          this.sharedState.transparentBuffer = [];
          this.sharedState.mode = 'command';
          responseBytes.push(...toBytes(`\r\n+CMGS: ${this.smsIndex}\r\n\r\nOK\r\n`));
          logMsg = `Modem: Sent SMS to ${this.smsPhone} (Message: "${message.trim()}") (Index: ${this.smsIndex++})`;
          break;
        } else {
          this.sharedState.transparentBuffer.push(b);
        }
      }
      return { bytes: responseBytes, log: logMsg || 'Modem: Collecting SMS data...' };
    }

    if (mode === 'transparent') {
      for (const b of input) {
        if (b === 0x1A) {
          const payload = String.fromCharCode(...this.sharedState.transparentBuffer);
          this.sharedState.transparentBuffer = [];
          this.sharedState.mode = 'command';
          logMsg = `Modem: Sending transparent data to ${this.sharedState.tcpHost}:${this.sharedState.tcpPort}`;
          this.handleTransparentSend(payload);
          break;
        } else {
          this.sharedState.transparentBuffer.push(b);
        }
      }
      return { bytes: responseBytes, log: logMsg || 'Modem: Collecting transparent TCP data...' };
    }

    // ── Dialect intermediate modes ────────────────────────────────────────
    if (mode !== 'command') {
      const res = this.dialect.handleIntermediateData(mode, input, this.sharedState);
      if (res) return { bytes: [...responseBytes, ...res.bytes], log: res.log };
      return { bytes: responseBytes, log: `Modem: Unknown mode "${mode}"` };
    }

    // ── Command mode: accumulate until \r or \n ───────────────────────────
    for (const b of input) {
      if (b === 0x0D || b === 0x0A) {
        if (this.rxBuffer.length > 0) {
          const cmdLine = String.fromCharCode(...this.rxBuffer).trim();
          this.rxBuffer = [];
          const res = this.dispatchCommand(cmdLine);
          if (res) {
            responseBytes.push(...res.bytes);
            logMsg = res.log;
          }
        }
      } else {
        this.rxBuffer.push(b);
      }
    }

    if (responseBytes.length > 0 || logMsg) return { bytes: responseBytes, log: logMsg };
    return null;
  }

  private dispatchCommand(cmd: string): { bytes: number[]; log: string } | null {
    const upperCmd = cmd.toUpperCase();
    let reply = '';
    let log = '';

    if (upperCmd === 'AT') {
      reply = '\r\nOK\r\n'; log = 'Modem: AT OK';
    } else if (upperCmd === 'ATE0') {
      this.echo = false; reply = '\r\nOK\r\n'; log = 'Modem: Echo Off';
    } else if (upperCmd === 'ATE1') {
      this.echo = true; reply = '\r\nOK\r\n'; log = 'Modem: Echo On';
    } else if (upperCmd === 'ATI' || upperCmd === 'AT+GMI' || upperCmd === 'AT+CGMI') {
      const mfr = this.dialect.vendorName === 'quectel' ? 'Quectel' : 'SIMCOM INCORPORATED';
      reply = `\r\n${mfr}\r\n\r\nOK\r\n`; log = `Modem: Manufacturer ID -> ${mfr}`;
    } else if (upperCmd === 'AT+GMM' || upperCmd === 'AT+CGMM') {
      const model = this.dialect.vendorName === 'quectel' ? 'EC21' : 'SIM800L';
      reply = `\r\n${model}\r\n\r\nOK\r\n`; log = `Modem: Model ID -> ${model}`;
    } else if (upperCmd === 'AT+GMR' || upperCmd === 'AT+CGMR') {
      const rev = this.dialect.vendorName === 'quectel' ? 'EC21EFAR06A01M4G' : 'R14.18';
      reply = `\r\n${rev}\r\n\r\nOK\r\n`; log = `Modem: Firmware revision -> ${rev}`;
    } else if (upperCmd === 'AT+GSN' || upperCmd === 'AT+CGSN') {
      reply = '\r\n867012345678901\r\n\r\nOK\r\n'; log = 'Modem: IMEI -> 867012345678901';
    } else if (upperCmd === 'AT+CNUM') {
      reply = `\r\n+CNUM: "My Number","${this.sharedState.subscriberNumber}",145\r\n\r\nOK\r\n`; log = `Modem: Subscriber number query -> ${this.sharedState.subscriberNumber}`;
    } else if (upperCmd === 'AT+CIMI') {
      reply = '\r\n286011234567890\r\n\r\nOK\r\n'; log = 'Modem: IMSI -> 286011234567890';
    } else if (upperCmd === 'AT+CCID' || upperCmd === 'AT+ICCID') {
      reply = '\r\n+CCID: 8990011234567890123\r\n\r\nOK\r\n'; log = 'Modem: ICCID -> 8990011234567890123';
    } else if (upperCmd.startsWith('AT+CMGF=')) {
      const fmatch = upperCmd.match(/AT\+CMGF=(\d+)/);
      if (fmatch) this.sharedState.smsCmgf = parseInt(fmatch[1], 10);
      reply = '\r\nOK\r\n'; log = `Modem: SMS format set -> ${this.sharedState.smsCmgf === 0 ? 'PDU' : 'Text'}`;
    } else if (upperCmd.startsWith('AT+CMEE=')) {
      reply = '\r\nOK\r\n'; log = `Modem: Error report mode set (${cmd})`;
    } else if (upperCmd.startsWith('AT+CFUN=')) {
      reply = '\r\nOK\r\n'; log = `Modem: Functionality set (${cmd})`;
    } else if (upperCmd === 'AT+CFUN?') {
      reply = '\r\n+CFUN: 1\r\n\r\nOK\r\n'; log = 'Modem: Functionality query -> 1 (full)';
    } else if (upperCmd === 'AT+CPAS') {
      const cpas = this.sharedState.callState === 'ringing' ? 3 : this.sharedState.callState === 'active' ? 4 : 0;
      reply = `\r\n+CPAS: ${cpas}\r\n\r\nOK\r\n`; log = `Modem: Phone activity status -> ${cpas}`;
    } else if (upperCmd === 'AT+CSQ') {
      reply = '\r\n+CSQ: 31,99\r\n\r\nOK\r\n'; log = 'Modem: Signal Quality query';
    } else if (upperCmd.startsWith('AT+CREG=')) {
      const nm = upperCmd.match(/AT\+CREG=(\d+)/);
      if (nm) this.sharedState.cregN = parseInt(nm[1], 10);
      reply = '\r\nOK\r\n'; log = `Modem: CREG mode set -> ${this.sharedState.cregN}`;
    } else if (upperCmd === 'AT+CREG?') {
      const s = this.sharedState;
      const stat = s.isRoaming ? 5 : 1;
      const locInfo = s.cregN === 2 ? `,"${s.cellLac}","${s.cellCi}"` : '';
      reply = `\r\n+CREG: ${s.cregN},${stat}${locInfo}\r\n\r\nOK\r\n`;
      log = `Modem: CREG -> stat=${stat}${s.isRoaming ? ' (roaming)' : ''}${s.cregN === 2 ? ` LAC=${s.cellLac} CI=${s.cellCi}` : ''}`;
    } else if (upperCmd === 'AT+CGREG?') {
      const s = this.sharedState;
      const stat = s.isRoaming ? 5 : 1;
      const locInfo = s.cregN === 2 ? `,"${s.cellLac}","${s.cellCi}"` : '';
      reply = `\r\n+CGREG: ${s.cregN},${stat}${locInfo}\r\n\r\nOK\r\n`;
      log = `Modem: CGREG -> stat=${stat}${s.isRoaming ? ' (roaming)' : ''}`;
    } else if (upperCmd === 'AT+CEREG?') {
      const s = this.sharedState;
      const stat = s.isRoaming ? 5 : 1;
      const locInfo = s.cregN === 2 ? `,"${s.cellLac}","${s.cellCi}"` : '';
      reply = `\r\n+CEREG: ${s.cregN},${stat}${locInfo}\r\n\r\nOK\r\n`;
      log = `Modem: CEREG -> stat=${stat}${s.isRoaming ? ' (roaming)' : ''}`;
    } else if (upperCmd === 'AT+CGATT?') {
      reply = `\r\n+CGATT: ${this.sharedState.pdpActive ? 1 : 0}\r\n\r\nOK\r\n`; log = `Modem: GPRS attachment status query -> ${this.sharedState.pdpActive ? 'attached' : 'detached'}`;
    } else if (upperCmd.startsWith('AT+CGATT=')) {
      const match = upperCmd.match(/AT\+CGATT=(\d)/);
      if (match) this.sharedState.pdpActive = match[1] === '1';
      reply = '\r\nOK\r\n'; log = `Modem: GPRS attachment -> ${this.sharedState.pdpActive ? 'ATTACH' : 'DETACH'}`;
    } else if (upperCmd === 'AT+CPMS?') {
      const count = this.sharedState.smsInbox.length;
      reply = `\r\n+CPMS: "SM",${count},50,"SM",${count},50,"SM",${count},50\r\n\r\nOK\r\n`;
      log = `Modem: SMS storage query -> "SM" (${count}/50)`;
    } else if (upperCmd.startsWith('AT+CPMS=')) {
      const count = this.sharedState.smsInbox.length;
      reply = `\r\n+CPMS: ${count},50,${count},50,${count},50\r\n\r\nOK\r\n`;
      log = `Modem: SMS storage selected (${cmd})`;
    } else if (upperCmd.startsWith('AT+SAPBR=')) {
      reply = '\r\nOK\r\n'; log = `Modem: Bearer config command: ${cmd}`;
    } else if (upperCmd === 'AT+CPIN?') {
      reply = `\r\n+CPIN: ${this.sharedState.pinState}\r\n\r\nOK\r\n`;
      log = `Modem: PIN status -> ${this.sharedState.pinState}`;
    } else if (upperCmd.startsWith('AT+CPIN=')) {
      const pm = cmd.match(/AT\+CPIN="?(\d{4,8})"?/i);
      if (!pm) {
        reply = '\r\n+CME ERROR: 10\r\n'; log = 'Modem: CPIN invalid format';
      } else if (this.sharedState.pinState === 'READY') {
        reply = '\r\nOK\r\n'; log = 'Modem: CPIN already READY';
      } else if (pm[1] === this.sharedState.pinCode) {
        this.sharedState.pinState = 'READY';
        this.sharedState.pinAttempts = 3;
        reply = '\r\nOK\r\n'; log = 'Modem: PIN accepted -> READY';
        setTimeout(() => {
          this.sharedState.onAsyncResponse?.({ bytes: toBytes('\r\n+CPIN: READY\r\n'), log: 'Modem: URC PIN READY' });
        }, 200);
      } else {
        this.sharedState.pinAttempts--;
        if (this.sharedState.pinAttempts <= 0) {
          this.sharedState.pinState = 'SIM PUK';
          reply = '\r\n+CME ERROR: 12\r\n'; log = 'Modem: PIN wrong x3 -> SIM PUK';
        } else {
          reply = '\r\n+CME ERROR: 16\r\n';
          log = `Modem: Wrong PIN (${this.sharedState.pinAttempts} attempts left)`;
        }
      }
    } else if (upperCmd.startsWith('AT+CLCK=')) {
      const lm = cmd.match(/AT\+CLCK="SC",(\d+),"?(\d+)"?/i);
      if (!lm) {
        reply = '\r\nERROR\r\n'; log = `Modem: Invalid CLCK format: ${cmd}`;
      } else if (lm[2] !== this.sharedState.pinCode) {
        reply = '\r\n+CME ERROR: 16\r\n'; log = 'Modem: CLCK wrong PIN';
      } else if (lm[1] === '1') {
        this.sharedState.pinState = 'SIM PIN';
        reply = '\r\nOK\r\n'; log = 'Modem: SIM lock enabled';
      } else {
        this.sharedState.pinState = 'READY';
        reply = '\r\nOK\r\n'; log = 'Modem: SIM lock disabled';
      }
    } else if (upperCmd === 'AT+COPS?') {
      const s = this.sharedState;
      const op = s.isRoaming ? s.roamingOperator : 'Turkcell';
      reply = `\r\n+COPS: 0,0,"${op}"\r\n\r\nOK\r\n`; log = `Modem: Operator -> ${op}${s.isRoaming ? ' (roaming)' : ''}`;
    } else if (upperCmd === 'AT+COPS=?') {
      reply = '\r\n+COPS: (1,"Turkcell","TRKC","28601",0),(1,"Vodafone TR","VODA","28602",0),(1,"Turk Telekom","TTUR","28603",0)\r\n\r\nOK\r\n';
      log = 'Modem: COPS scan -> 3 operators found';
    } else if (upperCmd.startsWith('AT+CGDCONT=')) {
      reply = '\r\nOK\r\n'; log = `Modem: APN context configured: ${cmd}`;
    } else if (upperCmd === 'AT+CIFSR') {
      reply = `\r\n${this.sharedState.pdpIp}\r\n`; log = `Modem: Retrieved local IP -> ${this.sharedState.pdpIp}`;
    } else if (upperCmd === 'AT+CBC') {
      const s = this.sharedState;
      reply = `\r\n+CBC: 0,${s.batteryLevel},${s.batteryVoltage}\r\n\r\nOK\r\n`;
      log = `Modem: Battery -> ${s.batteryLevel}% / ${s.batteryVoltage}mV`;
    } else if (upperCmd === 'AT+CCLK?') {
      const clk = modemClock(this.sharedState);
      reply = `\r\n+CCLK: "${clk}"\r\n\r\nOK\r\n`; log = `Modem: Clock -> ${clk}`;
    } else if (upperCmd.startsWith('AT+CCLK=')) {
      const match = cmd.match(/AT\+CCLK="([^"]+)"/i);
      if (match) {
        // Parse "yy/MM/dd,HH:mm:ss+tz" and compute offset from system time
        const parts = match[1].match(/(\d{2})\/(\d{2})\/(\d{2}),(\d{2}):(\d{2}):(\d{2})/);
        if (parts) {
          const d = new Date(2000+parseInt(parts[1]), parseInt(parts[2])-1, parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6]));
          this.sharedState.clockOffsetMs = d.getTime() - Date.now();
        }
        reply = '\r\nOK\r\n'; log = `Modem: Clock set -> ${match[1]}`;
      } else {
        reply = '\r\nERROR\r\n'; log = `Modem: Invalid CCLK format: ${cmd}`;
      }
    } else if (upperCmd.startsWith('AT+CGACT=')) {
      const match = upperCmd.match(/AT\+CGACT=(\d+),(\d+)/);
      if (match) {
        this.sharedState.pdpActive = match[1] === '1';
        reply = '\r\nOK\r\n'; log = `Modem: PDP context ${match[1] === '1' ? 'activated' : 'deactivated'}`;
      } else {
        reply = '\r\nERROR\r\n'; log = `Modem: Invalid CGACT: ${cmd}`;
      }
    } else if (upperCmd === 'AT+CGACT?') {
      reply = `\r\n+CGACT: 1,${this.sharedState.pdpActive ? 1 : 0}\r\n\r\nOK\r\n`;
      log = `Modem: PDP context status -> ${this.sharedState.pdpActive ? 'active' : 'inactive'}`;
    } else if (upperCmd.startsWith('AT+CGPADDR')) {
      reply = `\r\n+CGPADDR: 1,"${this.sharedState.pdpIp}"\r\n\r\nOK\r\n`;
      log = `Modem: PDP address -> ${this.sharedState.pdpIp}`;
    } else if (upperCmd.startsWith('AT+CNMI=')) {
      const match = upperCmd.match(/AT\+CNMI=(\d+),(\d+)/);
      this.sharedState.cnmiMode = match ? parseInt(match[2], 10) : 1;
      reply = '\r\nOK\r\n'; log = `Modem: CNMI configured (${cmd})`;
      if (this.sharedState.cnmiMode > 0) this.scheduleIncomingSms();
    } else if (upperCmd.startsWith('AT+CMGS=')) {
      if (this.sharedState.smsCmgf === 0) {
        // PDU mode: AT+CMGS=<length> (PDU octets)
        this.smsPhone = '';
        this.sharedState.mode = 'smswrite';
        this.sharedState.transparentBuffer = [];
        reply = '\r\n> ';
        log = 'Modem: PDU mode SMS, waiting for PDU data (Ctrl+Z to send)';
      } else {
        const match = cmd.match(/AT\+CMGS="?([^"\s,]+)"?/i);
        if (match) {
          this.smsPhone = match[1];
          this.sharedState.mode = 'smswrite';
          this.sharedState.transparentBuffer = [];
          reply = '\r\n> ';
          log = `Modem: Preparing SMS to ${this.smsPhone}, waiting for text (Ctrl+Z to send)`;
        } else {
          reply = '\r\nERROR\r\n'; log = `Modem: Invalid CMGS format: ${cmd}`;
        }
      }
    } else if (upperCmd.startsWith('AT+CMGL')) {
      const s = this.sharedState;
      if (s.smsCmgf === 0) {
        // PDU mode listing
        const filterMatch = cmd.match(/AT\+CMGL(?:=(\d+))?/i);
        const statFilter = filterMatch?.[1] ? parseInt(filterMatch[1], 10) : 4;
        const statusMap: Record<number, string> = { 0: 'REC UNREAD', 1: 'REC READ', 2: 'STO UNSENT', 3: 'STO SENT', 4: 'ALL' };
        const filterStatus = statusMap[statFilter] ?? 'ALL';
        const msgs = filterStatus === 'ALL' ? s.smsInbox : s.smsInbox.filter(m => m.status.toUpperCase() === filterStatus.toUpperCase());
        const listing = msgs.map(m => {
          const { pdu, length } = encodeSmsDeliverPdu(m.sender, m.body);
          const stat = m.status === 'REC UNREAD' ? 0 : m.status === 'REC READ' ? 1 : m.status === 'STO UNSENT' ? 2 : 3;
          return `+CMGL: ${m.index},${stat},,${length}\r\n${pdu}`;
        }).join('\r\n');
        reply = msgs.length > 0 ? `\r\n${listing}\r\n\r\nOK\r\n` : '\r\nOK\r\n';
        s.smsInbox.forEach(m => { if (m.status === 'REC UNREAD') m.status = 'REC READ'; });
        log = `Modem: CMGL PDU (${msgs.length} messages)`;
      } else {
        const filterMatch = cmd.match(/AT\+CMGL(?:=?"?([^"\r\n]*)"?)?/i);
        const filter = (filterMatch?.[1] ?? 'ALL').trim().toUpperCase();
        const msgs = filter === 'ALL' ? s.smsInbox : s.smsInbox.filter(m => m.status.toUpperCase() === filter);
        const listing = msgs.map(m => `+CMGL: ${m.index},"${m.status}","${m.sender}",,"${m.timestamp}"\r\n${m.body}`).join('\r\n');
        reply = msgs.length > 0 ? `\r\n${listing}\r\n\r\nOK\r\n` : '\r\nOK\r\n';
        s.smsInbox.forEach(m => { if (m.status === 'REC UNREAD') m.status = 'REC READ'; });
        log = `Modem: CMGL text (${msgs.length} messages listed)`;
      }
    } else if (upperCmd.startsWith('AT+CMGR=')) {
      const s = this.sharedState;
      const match = upperCmd.match(/AT\+CMGR=(\d+)/);
      const idx = match ? parseInt(match[1], 10) : -1;
      const msg = s.smsInbox.find(m => m.index === idx);
      if (msg) {
        if (s.smsCmgf === 0) {
          const { pdu, length } = encodeSmsDeliverPdu(msg.sender, msg.body);
          const stat = msg.status === 'REC UNREAD' ? 0 : 1;
          reply = `\r\n+CMGR: ${stat},,${length}\r\n${pdu}\r\n\r\nOK\r\n`;
        } else {
          reply = `\r\n+CMGR: "${msg.status}","${msg.sender}",,"${msg.timestamp}"\r\n${msg.body}\r\n\r\nOK\r\n`;
        }
        msg.status = 'REC READ'; log = `Modem: CMGR index=${idx} from ${msg.sender}`;
      } else {
        reply = '\r\nERROR\r\n'; log = `Modem: CMGR index=${idx} not found`;
      }
    } else if (upperCmd.startsWith('AT+CMGD=')) {
      const match = upperCmd.match(/AT\+CMGD=(\d+)/);
      const idx = match ? parseInt(match[1], 10) : -1;
      const before = this.sharedState.smsInbox.length;
      this.sharedState.smsInbox = this.sharedState.smsInbox.filter(m => m.index !== idx);
      if (this.sharedState.smsInbox.length < before) {
        reply = '\r\nOK\r\n'; log = `Modem: CMGD deleted index=${idx}`;
      } else {
        reply = '\r\nERROR\r\n'; log = `Modem: CMGD index=${idx} not found`;
      }
    } else if (upperCmd.startsWith('AT+CLIP=')) {
      const cm = upperCmd.match(/AT\+CLIP=(\d)/);
      this.sharedState.clipEnabled = cm ? cm[1] === '1' : false;
      reply = '\r\nOK\r\n'; log = `Modem: CLIP ${this.sharedState.clipEnabled ? 'enabled' : 'disabled'}`;
    } else if (upperCmd === 'AT+CLCC') {
      const s = this.sharedState;
      if (s.callState === 'idle') {
        reply = '\r\nOK\r\n'; log = 'Modem: CLCC -> no active calls';
      } else {
        const dir = s.callDirection === 'MT' ? 1 : 0;
        const stat = s.callState === 'ringing' ? (dir === 1 ? 4 : 3) : 0;
        reply = `\r\n+CLCC: 1,${dir},${stat},0,0,"${s.callNumber}",145\r\n\r\nOK\r\n`;
        log = `Modem: CLCC -> 1 call, state=${s.callState}`;
      }
    } else if (upperCmd.startsWith('ATD')) {
      const dialMatch = cmd.match(/ATD([+\d]+);?/i);
      if (dialMatch) {
        this.sharedState.callState = 'active';
        this.sharedState.callNumber = dialMatch[1];
        this.sharedState.callDirection = 'MO';
        reply = '\r\nOK\r\n'; log = `Modem: Dialing ${dialMatch[1]}`;
        setTimeout(() => {
          this.sharedState.onAsyncResponse?.({ bytes: toBytes(`\r\n+COLP: "${dialMatch[1]}",145\r\n`), log: `Modem: Call connected to ${dialMatch[1]}` });
        }, 800);
      } else {
        reply = '\r\nNO DIALTONE\r\n'; log = 'Modem: ATD invalid number';
      }
    } else if (upperCmd === 'ATA') {
      if (this.sharedState.callState === 'ringing') {
        this.sharedState.callState = 'active';
        reply = '\r\nOK\r\n'; log = `Modem: Answered call from ${this.sharedState.callNumber}`;
      } else {
        reply = '\r\nNO CARRIER\r\n'; log = 'Modem: ATA -> no incoming call';
      }
    } else if (upperCmd === 'ATH' || upperCmd === 'ATH0') {
      const wasActive = this.sharedState.callState !== 'idle';
      this.sharedState.callState = 'idle';
      this.sharedState.callNumber = '';
      reply = wasActive ? '\r\nOK\r\n\r\nNO CARRIER\r\n' : '\r\nOK\r\n';
      log = wasActive ? 'Modem: Call ended' : 'Modem: ATH (no active call)';
    } else if (upperCmd.startsWith('AT+CPSMS=') || upperCmd === 'AT+CPSMS?') {
      if (upperCmd === 'AT+CPSMS?') {
        const s = this.sharedState;
        reply = `\r\n+CPSMS: ${s.psmEnabled ? 1 : 0},,"","${s.psmTau}","${s.psmActiveTime}"\r\n\r\nOK\r\n`;
        log = `Modem: PSM query -> ${s.psmEnabled ? 'enabled' : 'disabled'} TAU=${s.psmTau}`;
      } else {
        const pm = cmd.match(/AT\+CPSMS=(\d)(?:,,,?"?([01]{8})?"?,?"?([01]{8})?"?)?/i);
        if (pm) {
          this.sharedState.psmEnabled = pm[1] === '1';
          if (pm[2]) this.sharedState.psmTau = pm[2];
          if (pm[3]) this.sharedState.psmActiveTime = pm[3];
          reply = '\r\nOK\r\n'; log = `Modem: PSM ${this.sharedState.psmEnabled ? 'enabled' : 'disabled'} TAU=${this.sharedState.psmTau}`;
          if (this.sharedState.psmEnabled) {
            setTimeout(() => {
              this.sharedState.onAsyncResponse?.({ bytes: toBytes(`\r\n+CPSMS: 1,"${this.sharedState.psmTau}","${this.sharedState.psmActiveTime}"\r\n`), log: 'Modem: PSM parameters confirmed' });
            }, 300);
          }
        } else {
          reply = '\r\nERROR\r\n'; log = `Modem: Invalid CPSMS format: ${cmd}`;
        }
      }
    } else if (upperCmd.startsWith('AT+CEDRXS=') || upperCmd === 'AT+CEDRXS?' || upperCmd === 'AT+CEDRXRDP') {
      if (upperCmd === 'AT+CEDRXRDP') {
        const s = this.sharedState;
        reply = s.edrxEnabled
          ? `\r\n+CEDRXRDP: ${s.edrxAcT},"${s.edrxCycle}","${s.edrxCycle}","0000"\r\n\r\nOK\r\n`
          : '\r\n+CEDRXRDP: 0\r\n\r\nOK\r\n';
        log = 'Modem: eDRX dynamic params query';
      } else if (upperCmd === 'AT+CEDRXS?') {
        const s = this.sharedState;
        reply = s.edrxEnabled
          ? `\r\n+CEDRXS: ${s.edrxAcT},"${s.edrxCycle}"\r\n\r\nOK\r\n`
          : '\r\nOK\r\n';
        log = 'Modem: eDRX query';
      } else {
        const em = cmd.match(/AT\+CEDRXS=(\d+)(?:,(\d+),"?([01]{4})?"?)?/i);
        if (em) {
          this.sharedState.edrxEnabled = em[1] !== '0';
          if (em[2]) this.sharedState.edrxAcT = parseInt(em[2], 10);
          if (em[3]) this.sharedState.edrxCycle = em[3];
          reply = '\r\nOK\r\n'; log = `Modem: eDRX ${this.sharedState.edrxEnabled ? `enabled (AcT=${this.sharedState.edrxAcT} cycle=${this.sharedState.edrxCycle})` : 'disabled'}`;
          if (this.sharedState.edrxEnabled) {
            setTimeout(() => {
              const s = this.sharedState;
              s.onAsyncResponse?.({ bytes: toBytes(`\r\n+CEDRXP: ${s.edrxAcT},"${s.edrxCycle}","${s.edrxCycle}","0000"\r\n`), log: 'Modem: eDRX parameters confirmed' });
            }, 300);
          }
        } else {
          reply = '\r\nERROR\r\n'; log = `Modem: Invalid CEDRXS format: ${cmd}`;
        }
      }
    } else if (upperCmd.startsWith('AT+CUSD=')) {
      const um = cmd.match(/AT\+CUSD=(\d)(?:,"([^"]+)")?(?:,(\d+))?/i);
      if (!um) {
        reply = '\r\nERROR\r\n'; log = `Modem: Invalid CUSD format: ${cmd}`;
      } else if (um[1] === '2') {
        this.sharedState.ussdActive = false;
        reply = '\r\nOK\r\n'; log = 'Modem: USSD session cancelled';
      } else {
        const ussdCode = um[2] ?? '';
        this.sharedState.ussdActive = true;
        reply = '\r\nOK\r\n'; log = `Modem: USSD sent: ${ussdCode}`;
        const ussdResponses: Record<string, string> = {
          '*100#': 'Bakiyeniz: 45,50 TL. Son kullanim: 26/06/15',
          '*101#': 'Kalan internet: 2.3 GB (01/07/26 gecerli)',
          '*102#': 'Kalan dakika: 120 dk (01/07/26 gecerli)',
          '*123#': 'Ana Menu: 1-Bakiye 2-Internet 3-Dakika',
        };
        const responseText = ussdResponses[ussdCode] ?? `USSD Yaniti: ${ussdCode} islendi`;
        setTimeout(() => {
          this.sharedState.ussdActive = false;
          this.sharedState.onAsyncResponse?.({ bytes: toBytes(`\r\n+CUSD: 0,"${responseText}",15\r\n`), log: `Modem: USSD response -> ${responseText}` });
        }, 800);
      }
    } else if (upperCmd === 'AT+CPBS?' || upperCmd.startsWith('AT+CPBS=')) {
      if (upperCmd === 'AT+CPBS?') {
        const used = this.sharedState.phonebook.length;
        reply = `\r\n+CPBS: "${this.sharedState.pbStorage}",${used},250\r\n\r\nOK\r\n`;
        log = `Modem: Phonebook storage -> ${this.sharedState.pbStorage} (${used}/250)`;
      } else {
        const sm = cmd.match(/AT\+CPBS="([^"]+)"/i);
        if (sm && (sm[1] === 'SM' || sm[1] === 'ME')) {
          this.sharedState.pbStorage = sm[1] as 'SM' | 'ME';
          reply = '\r\nOK\r\n'; log = `Modem: Phonebook storage set -> ${sm[1]}`;
        } else {
          reply = '\r\n+CME ERROR: 21\r\n'; log = `Modem: Invalid phonebook storage: ${cmd}`;
        }
      }
    } else if (upperCmd.startsWith('AT+CPBR=')) {
      const rm = upperCmd.match(/AT\+CPBR=(\d+)(?:,(\d+))?/);
      if (!rm) {
        reply = '\r\nERROR\r\n'; log = `Modem: Invalid CPBR format: ${cmd}`;
      } else {
        const from = parseInt(rm[1], 10);
        const to = rm[2] ? parseInt(rm[2], 10) : from;
        const entries = this.sharedState.phonebook.filter(e => e.index >= from && e.index <= to);
        if (entries.length === 0) {
          reply = '\r\n+CME ERROR: 22\r\n'; log = `Modem: CPBR no entries ${from}-${to}`;
        } else {
          const lines = entries.map(e => `+CPBR: ${e.index},"${e.number}",${e.type},"${e.name}"`).join('\r\n');
          reply = `\r\n${lines}\r\n\r\nOK\r\n`; log = `Modem: CPBR ${from}-${to} -> ${entries.length} entries`;
        }
      }
    } else if (upperCmd.startsWith('AT+CPBW=')) {
      const wm = cmd.match(/AT\+CPBW=(\d+)(?:,"([^"]*)",(\d+),"([^"]*)")?/i);
      if (!wm) {
        reply = '\r\nERROR\r\n'; log = `Modem: Invalid CPBW format: ${cmd}`;
      } else {
        const idx = parseInt(wm[1], 10);
        if (!wm[2]) {
          // Delete entry
          this.sharedState.phonebook = this.sharedState.phonebook.filter(e => e.index !== idx);
          reply = '\r\nOK\r\n'; log = `Modem: Phonebook entry ${idx} deleted`;
        } else {
          const existing = this.sharedState.phonebook.findIndex(e => e.index === idx);
          const entry: PhonebookEntry = { index: idx, number: wm[2], type: parseInt(wm[3], 10), name: wm[4] };
          if (existing >= 0) {
            this.sharedState.phonebook[existing] = entry;
            log = `Modem: Phonebook entry ${idx} updated -> "${wm[4]}" ${wm[2]}`;
          } else {
            this.sharedState.phonebook.push(entry);
            this.sharedState.phonebook.sort((a, b) => a.index - b.index);
            log = `Modem: Phonebook entry ${idx} written -> "${wm[4]}" ${wm[2]}`;
          }
          reply = '\r\nOK\r\n';
        }
      }
    } else if (upperCmd.startsWith('AT+CIPSTART=')) {
      const sslMatch = cmd.match(/CIPSTART\s*=\s*"SSL"\s*,\s*"([^"]+)"\s*,\s*"(\d+)"/i);
      const tcpMatch = cmd.match(/CIPSTART\s*=\s*"TCP"\s*,\s*"([^"]+)"\s*,\s*"(\d+)"/i);
      const isSSL = !!sslMatch;
      const hostVal = sslMatch?.[1] ?? tcpMatch?.[1] ?? '';
      const portVal = sslMatch ? parseInt(sslMatch[2], 10) : tcpMatch ? parseInt(tcpMatch[2], 10) : 0;
      if (hostVal && portVal) {
        this.sharedState.tcpHost = hostVal;
        this.sharedState.tcpPort = portVal;
        const s = this.sharedState;
        if (isSSL || portVal === 443) {
          if ((s.sslAuthMode === 1 || s.sslAuthMode === 3) && (!s.sslClientCert || !s.files[s.sslClientCert] || !s.sslClientKey || !s.files[s.sslClientKey])) {
            return { bytes: toBytes('\r\nCONNECTION FAILED\r\n'), log: `Modem: TCP SSL Connection failed. Missing credentials.` };
          }
          reply = '\r\nCONNECT OK\r\n'; log = `Modem: Secure SSL TCP connection opened to ${hostVal}:${portVal} (SSL Handshake OK)`;
        } else {
          reply = '\r\nCONNECT OK\r\n'; log = `Modem: TCP connection opened to ${hostVal}:${portVal}`;
        }
      } else {
        reply = '\r\nERROR\r\n'; log = `Modem: Invalid CIPSTART format: ${cmd}`;
      }
    } else if (upperCmd === 'AT+CIPSEND') {
      this.sharedState.mode = 'transparent';
      this.sharedState.transparentBuffer = [];
      reply = '\r\n> ';
      log = 'Modem: Entering TCP transparent mode, waiting for data (Ctrl+Z to send)';
    } else {
      const res = this.dialect.handleCommand(cmd, this.sharedState);
      if (res) return res;
      reply = '\r\nOK\r\n'; log = `Modem: Received command: ${cmd}`;
    }

    return { bytes: toBytes(reply), log };
  }

  simulateIncomingCall(number = '+905559998877') {
    const s = this.sharedState;
    if (s.callState !== 'idle') return;
    s.callState = 'ringing';
    s.callNumber = number;
    s.callDirection = 'MT';
    const ringUrc = toBytes('\r\nRING\r\n');
    const clipUrc = s.clipEnabled ? toBytes(`\r\n+CLIP: "${number}",145\r\n`) : [];
    s.onAsyncResponse?.({ bytes: [...ringUrc, ...clipUrc], log: `Modem: Incoming call from ${number}` });
    // Send RING again every 3s while still ringing
    const ringTimer = setInterval(() => {
      if (s.callState !== 'ringing') { clearInterval(ringTimer); return; }
      s.onAsyncResponse?.({ bytes: [...ringUrc, ...clipUrc], log: `Modem: RING from ${number}` });
    }, 3000);
    // Auto-reject after 30s
    setTimeout(() => {
      if (s.callState === 'ringing') {
        clearInterval(ringTimer);
        s.callState = 'idle';
        s.callNumber = '';
        s.onAsyncResponse?.({ bytes: toBytes('\r\nNO CARRIER\r\n'), log: 'Modem: Unanswered call -> NO CARRIER' });
      }
    }, 30000);
  }

  setRoaming(enabled: boolean, operator = 'Vodafone DE') {
    this.sharedState.isRoaming = enabled;
    this.sharedState.roamingOperator = operator;
    if (this.sharedState.cregN > 0) {
      const stat = enabled ? 5 : 1;
      const locInfo = this.sharedState.cregN === 2 ? `,"${this.sharedState.cellLac}","${this.sharedState.cellCi}"` : '';
      this.sharedState.onAsyncResponse?.({ bytes: toBytes(`\r\n+CREG: ${stat}${locInfo}\r\n`), log: `Modem: Roaming URC -> ${enabled ? `roaming (${operator})` : 'home'}` });
    }
  }

  simulateIncomingSms(sender = '+905551111222', body = 'Simulated SMS') {
    const s = this.sharedState;
    const ts = modemClock(s);
    const msg: SmsMessage = { index: s.smsInbox.length + 1, status: 'REC UNREAD', sender, timestamp: ts, body };
    s.smsInbox.push(msg);
    if (s.smsCmgf === 0) {
      s.onAsyncResponse?.({ bytes: toBytes(`\r\n+CMTI: "SM",${msg.index}\r\n`), log: `Modem: Incoming SMS URC (PDU) index=${msg.index} from ${sender}` });
    } else {
      s.onAsyncResponse?.({ bytes: toBytes(`\r\n+CMT: "${sender}",,"${ts}"\r\n${body}\r\n`), log: `Modem: Incoming SMS URC from ${sender}` });
    }
  }

  private scheduleIncomingSms() {
    setTimeout(() => {
      const s = this.sharedState;
      if (s.cnmiMode === 0) return;
      const sender = '+905551111222';
      const ts = modemClock(s);
      const body = 'PING from remote device';
      const msg: SmsMessage = { index: s.smsInbox.length + 1, status: 'REC UNREAD', sender, timestamp: ts, body };
      s.smsInbox.push(msg);
      if (s.smsCmgf === 0) {
        s.onAsyncResponse?.({ bytes: toBytes(`\r\n+CMTI: "SM",${msg.index}\r\n`), log: `Modem: Incoming SMS URC (PDU) index=${msg.index} from ${sender}` });
      } else {
        s.onAsyncResponse?.({ bytes: toBytes(`\r\n+CMT: "${sender}",,"${ts}"\r\n${body}\r\n`), log: `Modem: Incoming SMS URC from ${sender}` });
      }
    }, 3000);
  }

  private handleTransparentSend(payload: string) {
    const s = this.sharedState;
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
        const hMatch = lines[idx].match(/^([^:]+):\s*(.*)$/);
        if (hMatch) headers[hMatch[1].trim()] = hMatch[2].trim();
        idx++;
      }
      body = lines.slice(idx + 1).join('\n').trim();
    } else {
      method = 'POST';
      body = payload;
    }

    const host = s.tcpHost || 'localhost';
    const port = s.tcpPort || 80;
    const protocol = port === 443 ? 'https' : 'http';

    if (protocol === 'https' && (s.sslAuthMode === 1 || s.sslAuthMode === 3)) {
      if (!s.sslClientCert || !s.files[s.sslClientCert] || !s.sslClientKey || !s.files[s.sslClientKey]) {
        const errMsg = 'SSL Connection failed. Client credentials missing.';
        s.onAsyncResponse?.({ bytes: toBytes(`HTTP/1.1 403 Forbidden\r\nContent-Length: ${errMsg.length}\r\n\r\n${errMsg}`), log: 'Modem: TCP Transparent SSL Error -> Client credentials missing.' });
        return;
      }
    }

    const sslLog = protocol === 'https' && (s.sslAuthMode === 1 || s.sslAuthMode === 3) ? ` (Mutual TLS OK, cert: "${s.sslClientCert}")` : '';

    fetch(`${protocol}://${host}:${port}${path}`, { method, headers: { 'Content-Type': 'text/plain', ...headers }, body: method !== 'GET' && method !== 'HEAD' ? body : undefined })
      .then(async res => {
        const text = await res.text();
        s.onAsyncResponse?.({ bytes: toBytes(`HTTP/1.1 ${res.status} OK\r\nContent-Type: text/plain\r\nContent-Length: ${text.length}\r\n\r\n${text}`), log: `Modem: TCP Transparent Response -> ${res.status} (${text.length} bytes)${sslLog}` });
      })
      .catch(err => {
        s.onAsyncResponse?.({ bytes: toBytes(`HTTP/1.1 500 Internal Server Error\r\nContent-Length: ${err.message.length}\r\n\r\n${err.message}`), log: `Modem: TCP Transparent Error -> ${err.message}` });
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
    new SimCardDriver('simcom')
  ];

  get modemVendor(): ModemVendor {
    return (this.peripherals.find(p => p.id === 'simcard') as SimCardDriver | undefined)?.vendor ?? 'simcom';
  }

  public onAsyncResponse?: (res: PeripheralResponse) => void;

  setOnAsyncResponse(callback: (res: PeripheralResponse) => void) {
    this.onAsyncResponse = callback;
    for (const p of this.peripherals) {
      p.onAsyncResponse = callback;
      if (p.id === 'simcard') {
        (p as SimCardDriver).setAsyncResponseCallback(callback);
      }
    }
  }

  setModemVendor(vendor: ModemVendor) {
    const existing = this.peripherals.find(p => p.id === 'simcard') as SimCardDriver | undefined;
    if (existing) {
      existing.setVendor(vendor);
      if (this.onAsyncResponse) {
        existing.setAsyncResponseCallback(this.onAsyncResponse);
      }
    } else {
      const driver = new SimCardDriver(vendor);
      this.addDriver(driver);
    }
  }

  setGpsPosition(lat: number, lon: number, alt: number) {
    (this.peripherals.find(p => p.id === 'simcard') as SimCardDriver | undefined)?.setGpsPosition(lat, lon, alt);
  }

  setGpsWalkMode(enabled: boolean) {
    (this.peripherals.find(p => p.id === 'simcard') as SimCardDriver | undefined)?.setGpsWalkMode(enabled);
  }

  simulateIncomingCall(number?: string) {
    (this.peripherals.find(p => p.id === 'simcard') as SimCardDriver | undefined)?.simulateIncomingCall(number);
  }

  simulateIncomingSms(number: string, text: string) {
    (this.peripherals.find(p => p.id === 'simcard') as SimCardDriver | undefined)?.simulateIncomingSms(number, text);
  }

  setRoaming(enabled: boolean, operator?: string) {
    (this.peripherals.find(p => p.id === 'simcard') as SimCardDriver | undefined)?.setRoaming(enabled, operator);
  }

  addDriver(driver: PeripheralDriver) {
    this.peripherals = this.peripherals.filter(p => p.id !== driver.id);
    if (this.onAsyncResponse) {
      driver.onAsyncResponse = this.onAsyncResponse;
      if (driver.id === 'simcard') {
        (driver as SimCardDriver).setAsyncResponseCallback(this.onAsyncResponse);
      }
    }
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
        if (onAsyncResponse) {
          p.onAsyncResponse = onAsyncResponse;
        }
        const res = p.process(bytes);
        if (res) responses.push(res);
      }
    }
    
    return responses;
  }
}
