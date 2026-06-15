/**
 * UART Simulator - Stateful GSM modem emulator
 *
 * Usage:
 *   node mock-receiver.js --tcp --port 5011
 *   node mock-receiver.js --udp --port 5011
 *   node mock-receiver.js --port 5011 --operator Turkcell --signal 24
 *   node mock-receiver.js --port 5011 --urc 30
 *   node mock-receiver.js --port 5011 --real-http
 *
 * --urc N adds a simulated incoming SMS every N seconds.
 */

import net from 'net';
import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let sharedPort = 5011;
try {
  if (process.env.VITE_DEFAULT_TCP_PORT) {
    sharedPort = parseInt(process.env.VITE_DEFAULT_TCP_PORT, 10);
  } else {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envRaw = fs.readFileSync(envPath, 'utf8');
      const match = envRaw.match(/VITE_DEFAULT_TCP_PORT\s*=\s*(\d+)/);
      if (match && match[1]) {
        sharedPort = parseInt(match[1], 10);
      }
    }
  }
} catch (e) {
  // fallback to 5011
}

const COLORS = {
  label: '\x1b[35m',
  rx: '\x1b[34m',
  tx: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  dim: '\x1b[90m',
  reset: '\x1b[0m',
};

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

function readNumberOption(args, name, fallback) {
  const value = Number(readOption(args, name, fallback));
  return Number.isFinite(value) ? value : fallback;
}

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`Stateful GSM modem emulator

Options:
  --tcp                 Listen with TCP (default)
  --udp                 Listen with UDP
  --port N              Listen port (default: ${sharedPort})
  --operator NAME       Network operator (default: UART Mobile)
  --signal N            CSQ value from 0 to 31 (default: 24)
  --imei NUMBER         15-digit modem IMEI
  --urc N               Generate an incoming SMS every N seconds
  --real-http           Send HTTP requests to the configured URL
  --help                Show this help

Examples:
  node mock-receiver.js --port ${sharedPort}
  node mock-receiver.js --udp --port ${sharedPort}
  node mock-receiver.js --port ${sharedPort} --operator Turkcell --signal 28 --urc 30
  node mock-receiver.js --port ${sharedPort} --real-http`);
  process.exit(0);
}

const config = {
  mode: args.includes('--stdio') ? 'stdio' : args.includes('--udp') ? 'udp' : 'tcp',
  port: Math.trunc(readNumberOption(args, '--port', sharedPort)),
  operator: readOption(args, '--operator', 'UART Mobile'),
  signal: Math.min(31, Math.max(0, Math.trunc(readNumberOption(args, '--signal', 24)))),
  imei: readOption(args, '--imei', '359762081234567'),
  urcSeconds: Math.max(0, readNumberOption(args, '--urc', 0)),
  realHttp: args.includes('--real-http'),
};

if (config.port < 1 || config.port > 65535) {
  console.error('Port must be between 1 and 65535.');
  process.exit(1);
}

function formatHex(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatAscii(buffer) {
  return buffer.toString('latin1').replace(/[^\x20-\x7E]/g, '.');
}

function logPacket(direction, buffer, peer = '') {
  const color = direction === 'RX' ? COLORS.rx : COLORS.tx;
  const suffix = peer ? ` ${COLORS.dim}(${peer})${COLORS.reset}` : '';
  const previewLimit = 128;
  const preview = buffer.length > previewLimit ? buffer.subarray(0, previewLimit) : buffer;
  const truncated = buffer.length > previewLimit
    ? ` ${COLORS.warn}... (${buffer.length} bytes total)${COLORS.reset}`
    : '';
  console.log(
    `${color}[${direction}]${COLORS.reset} ${formatHex(preview)} ` +
    `${COLORS.dim}| ${formatAscii(preview)}${COLORS.reset}${truncated}${suffix}`,
  );
}

function gsmTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}/${get('month')}/${get('day')},${get('hour')}:${get('minute')}:${get('second')}+12`;
}

function unquote(value = '') {
  return value.trim().replace(/^"|"$/g, '');
}

class GsmSession {
  constructor(send, peer) {
    this.sendTransport = send;
    this.peer = peer;
    this.buffer = Buffer.alloc(0);
    this.flushTimer = null;
    this.nextMessageReference = 1;
    this.reset();
  }

  reset() {
    this.echo = true;
    this.verboseErrors = true;
    this.smsMode = 0;
    this.charset = 'GSM';
    this.registrationUrc = 0;
    this.attached = true;
    this.bearerOpen = false;
    this.apn = 'internet';
    this.pendingSms = null;
    this.pendingHttpData = null;
    this.httpInitialized = false;
    this.httpUrl = '';
    this.httpContentType = 'application/octet-stream';
    this.httpUpload = Buffer.alloc(0);
    this.httpResponse = Buffer.alloc(0);
    this.call = null;
    this.inbox = [
      {
        index: 1,
        status: 'REC UNREAD',
        sender: '+905551234567',
        timestamp: gsmTimestamp(new Date(Date.now() - 120_000)),
        text: 'UART GSM emulator online',
      },
    ];
  }

  sendRaw(value) {
    const payload = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
    logPacket('TX', payload, this.peer);
    this.sendTransport(payload);
  }

  sendResult(lines = [], result = 'OK') {
    const body = [...lines, result].filter(Boolean).join('\r\n');
    this.sendRaw(`\r\n${body}\r\n`);
  }

  sendError(code = 100) {
    this.sendResult([], this.verboseErrors ? `+CME ERROR: ${code}` : 'ERROR');
  }

  addIncomingSms(text = 'Periodic network test message', sender = '+905551112233') {
    const index = Math.max(0, ...this.inbox.map((message) => message.index)) + 1;
    this.inbox.push({
      index,
      status: 'REC UNREAD',
      sender,
      timestamp: gsmTimestamp(),
      text,
    });
    this.sendRaw(`\r\n+CMTI: "SM",${index}\r\n`);
  }

  receive(data, datagram = false) {
    logPacket('RX', data, this.peer);

    if (this.pendingSms) {
      this.consumeSmsBody(data);
      return;
    }
    if (this.pendingHttpData) {
      this.consumeHttpData(data);
      return;
    }

    this.buffer = Buffer.concat([this.buffer, data]);
    this.consumeCompleteCommands();

    if (datagram) {
      this.flushBareCommand();
      return;
    }

    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushBareCommand(), 20);
  }

  consumeCompleteCommands() {
    while (this.buffer.length > 0) {
      const delimiterIndex = this.buffer.findIndex((byte) => byte === 0x0d || byte === 0x0a);
      if (delimiterIndex < 0) return;

      const command = this.buffer.subarray(0, delimiterIndex).toString('utf8').trim();
      let nextIndex = delimiterIndex + 1;
      while (nextIndex < this.buffer.length && (this.buffer[nextIndex] === 0x0d || this.buffer[nextIndex] === 0x0a)) {
        nextIndex += 1;
      }
      this.buffer = this.buffer.subarray(nextIndex);

      if (command) this.execute(command);
      if (this.pendingSms && this.buffer.length > 0) {
        const remaining = this.buffer;
        this.buffer = Buffer.alloc(0);
        this.consumeSmsBody(remaining);
        return;
      }
    }
  }

  flushBareCommand() {
    if (this.buffer.length === 0) return;
    const command = this.buffer.toString('utf8').trim();
    if (!/^AT/i.test(command) && !/^PING$/i.test(command)) return;
    this.buffer = Buffer.alloc(0);
    this.execute(command);
  }

  consumeSmsBody(data) {
    const cancelIndex = data.indexOf(0x1b);
    const submitIndex = data.indexOf(0x1a);
    const endIndex = cancelIndex >= 0 ? cancelIndex : submitIndex;
    const content = endIndex >= 0 ? data.subarray(0, endIndex) : data;

    this.pendingSms.body = Buffer.concat([this.pendingSms.body, content]);
    if (endIndex < 0) return;

    if (cancelIndex >= 0) {
      this.pendingSms = null;
      this.sendResult([], 'ERROR');
      return;
    }

    const message = this.pendingSms;
    this.pendingSms = null;
    const text = message.body.toString('utf8').replace(/[\r\n]+$/, '');
    const reference = this.nextMessageReference++;
    console.log(
      `${COLORS.label}[SMS]${COLORS.reset} To ${message.recipient}: ${text || '(empty message)'}`,
    );
    this.sendResult([`+CMGS: ${reference}`]);

    const remaining = data.subarray(submitIndex + 1);
    if (remaining.length > 0) this.receive(remaining);
  }

  consumeHttpData(data) {
    const pending = this.pendingHttpData;
    const remainingBytes = pending.expectedLength - pending.body.length;
    const accepted = data.subarray(0, remainingBytes);
    pending.body = Buffer.concat([pending.body, accepted]);

    if (pending.body.length < pending.expectedLength) return;

    clearTimeout(pending.timeout);
    this.httpUpload = pending.body;
    this.pendingHttpData = null;
    this.sendResult();

    const remaining = data.subarray(accepted.length);
    if (remaining.length > 0) this.receive(remaining);
  }

  async performHttpAction(method) {
    const methodName = ['GET', 'POST', 'HEAD'][method];
    const requestBody = method === 1 ? this.httpUpload : Buffer.alloc(0);

    console.log(
      `${COLORS.label}[HTTP]${COLORS.reset} ${methodName} ${this.httpUrl} ` +
      `${COLORS.dim}| ${this.httpContentType} | ${requestBody.length} body bytes${COLORS.reset}`,
    );
    this.sendRaw(
      `\r\n+HTTPREQUEST: ${methodName},"${this.httpUrl}",${requestBody.length},"${this.httpContentType}"\r\n`,
    );

    if (config.realHttp) {
      try {
        const url = new URL(this.httpUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported URL protocol');

        const response = await fetch(url, {
          method: methodName,
          headers: { 'content-type': this.httpContentType },
          body: method === 1 ? requestBody : undefined,
        });
        const responseBytes = Buffer.from(await response.arrayBuffer());
        this.httpResponse = responseBytes.subarray(0, 1024 * 1024);
        this.sendRaw(`\r\n+HTTPACTION: ${method},${response.status},${this.httpResponse.length}\r\n`);
        return;
      } catch (error) {
        console.error(`${COLORS.error}[HTTP ERROR]${COLORS.reset} ${error.message}`);
        this.httpResponse = Buffer.alloc(0);
        this.sendRaw(`\r\n+HTTPACTION: ${method},601,0\r\n`);
        return;
      }
    }

    const responseObject = {
      ok: true,
      simulated: true,
      method: methodName,
      url: this.httpUrl,
      contentType: this.httpContentType,
      receivedBytes: requestBody.length,
    };
    const responsePrefix = Buffer.from(`${JSON.stringify(responseObject)}\n`, 'utf8');
    const responseLength = requestBody.length === 8192 ? 8192 : responsePrefix.length;
    this.httpResponse = Buffer.alloc(responseLength, 0x20);
    responsePrefix.copy(this.httpResponse, 0, 0, Math.min(responsePrefix.length, responseLength));
    this.sendRaw(`\r\n+HTTPACTION: ${method},200,${this.httpResponse.length}\r\n`);
  }

  execute(command) {
    const normalized = command.trim();
    const upper = normalized.toUpperCase();

    if (this.echo) this.sendRaw(`${normalized}\r`);

    if (upper === 'PING') {
      this.sendRaw('PONG');
      return;
    }

    if (upper === 'AT') return this.sendResult();
    if (upper === 'ATI') return this.sendResult(['UART GSM-4G Emulator', 'Revision: 1.6.0']);
    if (upper === 'ATZ' || upper === 'AT&F') {
      this.reset();
      return this.sendResult();
    }
    if (upper === 'ATE0') {
      this.echo = false;
      return this.sendResult();
    }
    if (upper === 'ATE1') {
      this.echo = true;
      return this.sendResult();
    }
    if (upper === 'AT+CMEE=0') {
      this.verboseErrors = false;
      return this.sendResult();
    }
    if (upper === 'AT+CMEE=1' || upper === 'AT+CMEE=2') {
      this.verboseErrors = true;
      return this.sendResult();
    }

    if (upper === 'AT+GMI' || upper === 'AT+CGMI') return this.sendResult(['UART Labs']);
    if (upper === 'AT+GMM' || upper === 'AT+CGMM') return this.sendResult(['UART-GSM-4G']);
    if (upper === 'AT+GMR' || upper === 'AT+CGMR') return this.sendResult(['1.6.0']);
    if (upper === 'AT+CGSN' || upper === 'AT+GSN') return this.sendResult([config.imei]);
    if (upper === 'AT+CPIN?') return this.sendResult(['+CPIN: READY']);
    if (upper === 'AT+CIMI') return this.sendResult(['286010123456789']);
    if (upper === 'AT+CNUM') return this.sendResult(['+CNUM: "UART SIM","+905550110001",145']);
    if (upper === 'AT+CSQ') return this.sendResult([`+CSQ: ${config.signal},0`]);
    if (upper === 'AT+CBC') return this.sendResult(['+CBC: 0,87,4072']);
    if (upper === 'AT+CCLK?') return this.sendResult([`+CCLK: "${gsmTimestamp()}"`]);
    if (upper === 'AT+IPR?') return this.sendResult(['+IPR: 115200']);
    if (/^AT\+IPR=\d+$/.test(upper)) return this.sendResult();

    if (upper === 'AT+CREG?') return this.sendResult([`+CREG: ${this.registrationUrc},1`]);
    if (/^AT\+CREG=[012]$/.test(upper)) {
      this.registrationUrc = Number(upper.at(-1));
      return this.sendResult();
    }
    if (upper === 'AT+CGREG?') return this.sendResult(['+CGREG: 0,1']);
    if (upper === 'AT+CEREG?') return this.sendResult(['+CEREG: 0,1']);
    if (upper === 'AT+COPS?') return this.sendResult([`+COPS: 0,0,"${config.operator}",7`]);
    if (upper === 'AT+COPS=?') {
      return this.sendResult([`+COPS: (2,"${config.operator}","UART","28601",7),,(0-4),(0-2)`]);
    }

    if (upper === 'AT+CMGF?') return this.sendResult([`+CMGF: ${this.smsMode}`]);
    if (/^AT\+CMGF=[01]$/.test(upper)) {
      this.smsMode = Number(upper.at(-1));
      return this.sendResult();
    }
    if (upper === 'AT+CSCS?') return this.sendResult([`+CSCS: "${this.charset}"`]);
    if (upper.startsWith('AT+CSCS=')) {
      this.charset = unquote(normalized.split('=').slice(1).join('=')) || 'GSM';
      return this.sendResult();
    }
    if (/^AT\+CNMI=/.test(upper)) return this.sendResult();

    const cmgsMatch = normalized.match(/^AT\+CMGS=(?:"([^"]+)"|(\d+))$/i);
    if (cmgsMatch) {
      if (this.smsMode !== 1) return this.sendError(302);
      this.pendingSms = {
        recipient: cmgsMatch[1] ?? cmgsMatch[2],
        body: Buffer.alloc(0),
      };
      this.sendRaw('\r\n> ');
      return;
    }

    const cmglMatch = normalized.match(/^AT\+CMGL(?:=(?:"([^"]+)"|(\d+)))?$/i);
    if (cmglMatch) {
      if (this.smsMode !== 1) return this.sendError(302);
      const requested = cmglMatch[1]?.toUpperCase() ?? 'ALL';
      const messages = this.inbox.filter((message) => requested === 'ALL' || message.status === requested);
      const lines = messages.flatMap((message) => [
        `+CMGL: ${message.index},"${message.status}","${message.sender}","","${message.timestamp}"`,
        message.text,
      ]);
      return this.sendResult(lines);
    }

    const cmgrMatch = upper.match(/^AT\+CMGR=(\d+)$/);
    if (cmgrMatch) {
      if (this.smsMode !== 1) return this.sendError(302);
      const message = this.inbox.find((item) => item.index === Number(cmgrMatch[1]));
      if (!message) return this.sendError(321);
      const previousStatus = message.status;
      message.status = 'REC READ';
      return this.sendResult([
        `+CMGR: "${previousStatus}","${message.sender}","","${message.timestamp}"`,
        message.text,
      ]);
    }

    const cmgdMatch = upper.match(/^AT\+CMGD=(\d+)(?:,(\d+))?$/);
    if (cmgdMatch) {
      const index = Number(cmgdMatch[1]);
      const deleteFlag = Number(cmgdMatch[2] ?? 0);
      if (deleteFlag === 4) {
        this.inbox = [];
        return this.sendResult();
      }
      const before = this.inbox.length;
      this.inbox = this.inbox.filter((message) => message.index !== index);
      return before === this.inbox.length ? this.sendError(321) : this.sendResult();
    }

    const dialMatch = normalized.match(/^ATD([^;]+);?$/i);
    if (dialMatch) {
      this.call = { number: dialMatch[1], direction: 0, status: 2 };
      this.sendResult();
      setTimeout(() => {
        if (!this.call || this.call.number !== dialMatch[1]) return;
        this.call.status = 0;
        this.sendRaw('\r\nCONNECT\r\n');
      }, 500);
      return;
    }
    if (upper === 'ATA') {
      if (!this.call || this.call.direction !== 1) return this.sendResult([], 'NO CARRIER');
      this.call.status = 0;
      return this.sendResult();
    }
    if (upper === 'ATH' || upper === 'ATH0') {
      this.call = null;
      return this.sendResult();
    }
    if (upper === 'AT+CLCC') {
      if (!this.call) return this.sendResult();
      return this.sendResult([
        `+CLCC: 1,${this.call.direction},${this.call.status},0,0,"${this.call.number}",145`,
      ]);
    }
    if (upper === 'AT+CPAS') {
      const activity = !this.call ? 0 : this.call.status === 4 ? 3 : 4;
      return this.sendResult([`+CPAS: ${activity}`]);
    }

    if (upper === 'AT+CFUN?') return this.sendResult(['+CFUN: 1']);
    if (/^AT\+CFUN=[01](?:,1)?$/.test(upper)) return this.sendResult();
    if (upper === 'AT+CGATT?') return this.sendResult([`+CGATT: ${this.attached ? 1 : 0}`]);
    if (/^AT\+CGATT=[01]$/.test(upper)) {
      this.attached = upper.endsWith('1');
      return this.sendResult();
    }
    if (upper === 'AT+CGDCONT?') {
      return this.sendResult([`+CGDCONT: 1,"IP","${this.apn}","10.23.42.17",0,0`]);
    }
    const contextMatch = normalized.match(/^AT\+CGDCONT=1,"IP","([^"]+)"$/i);
    if (contextMatch) {
      this.apn = contextMatch[1];
      return this.sendResult();
    }
    if (/^AT\+SAPBR=3,1,"(?:CONTYPE|APN)",/.test(upper)) {
      const apnMatch = normalized.match(/^AT\+SAPBR=3,1,"APN","([^"]+)"$/i);
      if (apnMatch) this.apn = apnMatch[1];
      return this.sendResult();
    }
    if (upper === 'AT+SAPBR=1,1') {
      if (!this.attached) return this.sendError(30);
      this.bearerOpen = true;
      return this.sendResult();
    }
    if (upper === 'AT+SAPBR=0,1') {
      this.bearerOpen = false;
      return this.sendResult();
    }
    if (upper === 'AT+SAPBR=2,1') {
      return this.sendResult([
        this.bearerOpen
          ? '+SAPBR: 1,1,"10.23.42.17"'
          : '+SAPBR: 1,3,"0.0.0.0"',
      ]);
    }
    if (upper === 'AT+CIFSR') {
      return this.attached ? this.sendResult(['10.23.42.17']) : this.sendError(30);
    }
    if (upper === 'AT+CIPSTATUS') {
      return this.sendResult([this.attached ? 'STATE: IP STATUS' : 'STATE: IP INITIAL']);
    }

    if (upper === 'AT+HTTPINIT') {
      if (this.httpInitialized) return this.sendError(3);
      this.httpInitialized = true;
      this.httpUrl = '';
      this.httpUpload = Buffer.alloc(0);
      this.httpResponse = Buffer.alloc(0);
      return this.sendResult();
    }
    if (upper === 'AT+HTTPTERM') {
      this.httpInitialized = false;
      this.httpUrl = '';
      this.httpUpload = Buffer.alloc(0);
      this.httpResponse = Buffer.alloc(0);
      return this.sendResult();
    }
    const httpParaMatch = normalized.match(/^AT\+HTTPPARA="([^"]+)","([^"]*)"$/i);
    if (httpParaMatch) {
      if (!this.httpInitialized) return this.sendError(3);
      const key = httpParaMatch[1].toUpperCase();
      const value = httpParaMatch[2];
      if (key === 'URL') this.httpUrl = value;
      if (key === 'CONTENT') this.httpContentType = value;
      return this.sendResult();
    }
    if (upper === 'AT+HTTPPARA?') {
      if (!this.httpInitialized) return this.sendError(3);
      return this.sendResult([
        `+HTTPPARA: "URL","${this.httpUrl}"`,
        `+HTTPPARA: "CONTENT","${this.httpContentType}"`,
      ]);
    }
    const httpDataMatch = upper.match(/^AT\+HTTPDATA=(\d+),(\d+)$/);
    if (httpDataMatch) {
      if (!this.httpInitialized) return this.sendError(3);
      const expectedLength = Number(httpDataMatch[1]);
      const timeoutMs = Number(httpDataMatch[2]);
      if (expectedLength < 0 || expectedLength > 1024 * 1024) return this.sendError(24);

      const pending = {
        expectedLength,
        body: Buffer.alloc(0),
        timeout: null,
      };
      pending.timeout = setTimeout(() => {
        if (this.pendingHttpData !== pending) return;
        this.pendingHttpData = null;
        this.sendError(601);
      }, Math.max(100, timeoutMs));
      this.pendingHttpData = pending;
      this.sendRaw('\r\nDOWNLOAD\r\n');
      if (expectedLength === 0) this.consumeHttpData(Buffer.alloc(0));
      return;
    }
    const httpActionMatch = upper.match(/^AT\+HTTPACTION=([012])$/);
    if (httpActionMatch) {
      if (!this.httpInitialized || !this.httpUrl) return this.sendError(3);
      const method = Number(httpActionMatch[1]);
      this.sendResult();
      setTimeout(() => void this.performHttpAction(method), 100);
      return;
    }
    const httpReadMatch = upper.match(/^AT\+HTTPREAD(?:=(\d+),(\d+))?$/);
    if (httpReadMatch) {
      if (!this.httpInitialized) return this.sendError(3);
      const offset = Number(httpReadMatch[1] ?? 0);
      const requestedLength = Number(httpReadMatch[2] ?? this.httpResponse.length);
      const body = this.httpResponse.subarray(offset, offset + requestedLength);
      this.sendRaw(`\r\n+HTTPREAD: ${body.length}\r\n`);
      this.sendRaw(body);
      this.sendRaw('\r\nOK\r\n');
      return;
    }

    this.sendError(100);
  }

  close() {
    clearTimeout(this.flushTimer);
  }
}

if (import.meta.url !== `file://${process.argv[1]}`) {
  // Imported as module — don't start server
} else {

if (config.mode === 'stdio') {
  // stdio modunda stdout AT stream'i taşır — tüm loglar stderr'e
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  console.log = (...a) => process.stderr.write(a.join(' ') + '\n');
  console.error = (...a) => process.stderr.write(a.join(' ') + '\n');

  process.stderr.write(
    `${COLORS.label}[GSM-MODEM]${COLORS.reset} stdio mode (${config.operator}, CSQ ${config.signal})\n`,
  );

  const session = new GsmSession((payload) => process.stdout.write(payload), 'stdio');

  if (config.urcSeconds > 0) {
    setInterval(() => session.addIncomingSms(), config.urcSeconds * 1000);
  }

  process.stdin.on('data', (data) => session.receive(data));
  process.stdin.on('end', () => { session.close(); process.exit(0); });
  process.on('SIGINT', () => { session.close(); process.exit(0); });

} else if (config.mode === 'tcp') {
  console.log(
    `${COLORS.label}[GSM-MODEM]${COLORS.reset} Starting TCP on port ${config.port} (${config.operator}, CSQ ${config.signal})`,
  );

  const sessions = new Set();
  const server = net.createServer((socket) => {
    const peer = `${socket.remoteAddress}:${socket.remotePort}`;
    const session = new GsmSession((payload) => socket.write(payload), peer);
    sessions.add(session);
    console.log(`${COLORS.tx}[CONN]${COLORS.reset} ${peer}`);

    socket.on('data', (data) => session.receive(data));
    socket.on('end', () => {
      session.close();
      sessions.delete(session);
      console.log(`${COLORS.warn}[DISCO]${COLORS.reset} ${peer}`);
    });
    socket.on('error', (error) => {
      console.error(`${COLORS.error}[TCP ERROR]${COLORS.reset} ${error.message}`);
    });
  });

  let urcTimer;
  if (config.urcSeconds > 0) {
    urcTimer = setInterval(() => {
      sessions.forEach((session) => session.addIncomingSms());
    }, config.urcSeconds * 1000);
  }

  server.listen(config.port, () => {
    console.log(`${COLORS.tx}[LISTEN]${COLORS.reset} TCP modem ready`);
  });
  server.on('error', (error) => {
    console.error(`${COLORS.error}[TCP ERROR]${COLORS.reset} ${error.message}`);
  });

  process.on('SIGINT', () => {
    clearInterval(urcTimer);
    sessions.forEach((session) => session.close());
    server.close(() => process.exit(0));
  });

} else {
  console.log(
    `${COLORS.label}[GSM-MODEM]${COLORS.reset} Starting UDP on port ${config.port} (${config.operator}, CSQ ${config.signal})`,
  );

  const server = dgram.createSocket('udp4');
  const sessions = new Map();

  function getSession(rinfo) {
    const peer = `${rinfo.address}:${rinfo.port}`;
    if (!sessions.has(peer)) {
      sessions.set(
        peer,
        new GsmSession(
          (payload) => server.send(payload, rinfo.port, rinfo.address),
          peer,
        ),
      );
    }
    return sessions.get(peer);
  }

  server.on('message', (message, rinfo) => getSession(rinfo).receive(message, true));
  server.on('error', (error) => {
    console.error(`${COLORS.error}[UDP ERROR]${COLORS.reset} ${error.message}`);
  });
  server.bind(config.port, () => {
    console.log(`${COLORS.tx}[LISTEN]${COLORS.reset} UDP modem ready`);
  });

  let urcTimer;
  if (config.urcSeconds > 0) {
    urcTimer = setInterval(() => {
      sessions.forEach((session) => session.addIncomingSms());
    }, config.urcSeconds * 1000);
  }

  process.on('SIGINT', () => {
    clearInterval(urcTimer);
    sessions.forEach((session) => session.close());
    server.close(() => process.exit(0));
  });
}

}
