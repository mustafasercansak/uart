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

import WebSocket from 'ws';
import net from 'net';
import dgram from 'dgram';

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const mode = args.includes('--udp') ? 'udp' : 'tcp';
const targetStr = args.find(a => a.includes(':')) || 'localhost:5000';
const [host, port] = targetStr.split(':');
const wsPort = 8080;

if (help) {
  console.log('UART Bridge Yardım:');
  console.log('  node bridge.js --tcp host:port  (Varsayılan)');
  console.log('  node bridge.js --udp host:port');
  process.exit(0);
}

const wss = new WebSocket.Server({ port: wsPort });
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
