/**
 * UART Simulator - WebSocket to TCP/UDP Bridge
 * 
 * Usage:
 * 1. Install dependencies: npm install ws
 * 2. Run: node bridge.js --tcp 192.168.1.50:5000
 * 
 * This script allows the browser-based UART simulator to talk to real 
 * TCP/UDP devices on your network.
 */

import WebSocket, { WebSocketServer } from 'ws';
import net from 'net';
import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let sharedPort = 5000;
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
  // fallback
}

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const mode = args.includes('--udp') ? 'udp' : 'tcp';
const targetStr = args.find(a => a.includes(':')) || `localhost:${sharedPort}`;
const [host, port] = targetStr.split(':');
const wsPortArg = args.find((a, i) => i > 0 && args[i - 1] === '--ws-port');
const wsPort = Number.parseInt(wsPortArg || '8081', 10);

if (help) {
  console.log('UART Bridge Yardım:');
  console.log('  node bridge.js --tcp host:port  (Varsayılan)');
  console.log('  node bridge.js --udp host:port');
  console.log('  node bridge.js --tcp host:port --ws-port 8081');
  process.exit(0);
}

if (!Number.isInteger(wsPort) || wsPort < 1 || wsPort > 65535) {
  console.error('\x1b[31m[ERR]\x1b[0m Geçersiz --ws-port değeri. 1-65535 arası olmalı.');
  process.exit(1);
}

const wss = new WebSocketServer({ port: wsPort });
console.log(`\x1b[32m[BRIDGE]\x1b[0m WebSocket Sunucusu başlatıldı: ws://localhost:${wsPort}`);
console.log(`\x1b[34m[TARGET]\x1b[0m Hedef: ${mode.toUpperCase()} ${host}:${port}`);

wss.on('connection', (ws) => {
  console.log('\x1b[32m[CONN]\x1b[0m Simülatör bağlandı.');
  
  let client;
  if (mode === 'tcp') {
    client = new net.Socket();
    client.connect(port, host, () => {
      console.log('\x1b[34m[TCP]\x1b[0m Hedef cihaza bağlanıldı.');
    });

    client.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    client.on('error', (err) => console.error('\x1b[31m[ERR]\x1b[0m TCP Hatası:', err.message));
    
    ws.on('message', (message) => {
      if (client.writable) client.write(message);
    });

    ws.on('close', () => {
      console.log('\x1b[33m[DISCO]\x1b[0m Simülatör ayrıldı.');
      client.destroy();
    });
  } else {
    // UDP Mode
    client = dgram.createSocket('udp4');
    
    client.on('message', (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });

    ws.on('message', (message) => {
      client.send(message, port, host);
    });

    ws.on('close', () => {
      console.log('\x1b[33m[DISCO]\x1b[0m Simülatör ayrıldı.');
      client.close();
    });
  }
});
