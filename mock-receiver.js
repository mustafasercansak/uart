/**
 * UART Simulator - Mock Target Device
 * 
 * This script acts as the "other end" of the UART communication.
 * It listens for incoming TCP/UDP packets and logs them.
 * 
 * Usage:
 *   node mock-receiver.js --tcp 5000
 *   node mock-receiver.js --udp 5000
 */

import net from 'net';
import dgram from 'dgram';

const args = process.argv.slice(2);
const port = parseInt(args.find((a, i) => i > 0 && args[i-1] === '--port' ) || args.find(a => !a.startsWith('--')) || 5000);
const mode = args.includes('--udp') ? 'udp' : 'tcp';

console.log(`\x1b[35m[MOCK-DEVICE]\x1b[0m Başlatılıyor... Mod: ${mode.toUpperCase()} Port: ${port}`);

function formatHex(buffer) {
  return Array.from(buffer)
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

if (mode === 'tcp') {
  const server = net.createServer((socket) => {
    console.log(`\x1b[32m[CONN]\x1b[0m Yeni bağlantı: ${socket.remoteAddress}:${socket.remotePort}`);

    socket.on('data', (data) => {
      const hex = formatHex(data);
      const ascii = data.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
      console.log(`\x1b[34m[RX]\x1b[0m ${hex} \x1b[90m| ${ascii}\x1b[0m`);
      
      // Echo back if it starts with 'PING' (0x50 0x49 0x4E 0x47)
      if (data[0] === 0x50 && data[1] === 0x49) {
        const response = Buffer.from([0x50, 0x4F, 0x4E, 0x47]); // PONG
        console.log(`\x1b[32m[TX]\x1b[0m Otomatik yanıt gönderiliyor: PONG`);
        socket.write(response);
      }
    });

    socket.on('end', () => console.log('\x1b[33m[DISCO]\x1b[0m Bağlantı kesildi.'));
    socket.on('error', (err) => console.error('\x1b[31m[ERR]\x1b[0m TCP Hatası:', err.message));
  });

  server.listen(port, () => {
    console.log(`\x1b[32m[LISTEN]\x1b[0m TCP Sunucusu dinliyor...`);
  });
} else {
  // UDP Mode
  const server = dgram.createSocket('udp4');

  server.on('message', (msg, rinfo) => {
    const hex = formatHex(msg);
    const ascii = msg.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
    console.log(`\x1b[34m[RX]\x1b[0m ${hex} \x1b[90m| ${ascii}\x1b[0m (kimden: ${rinfo.address}:${rinfo.port})`);
    
    // Auto-reply logic for UDP
    if (msg[0] === 0x50 && msg[1] === 0x49) {
        const response = Buffer.from([0x50, 0x4F, 0x4E, 0x47]);
        server.send(response, rinfo.port, rinfo.address);
    }
  });

  server.on('error', (err) => console.error('\x1b[31m[ERR]\x1b[0m UDP Hatası:', err.message));

  server.bind(port, () => {
    console.log(`\x1b[32m[LISTEN]\x1b[0m UDP Sunucusu dinliyor...`);
  });
}
