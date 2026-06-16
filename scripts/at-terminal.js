/**
 * Interactive AT terminal for UART Simulator.
 * Connects to the simulator TCP server and shows TX/RX clearly.
 *
 * Usage:
 *   node scripts/at-terminal.js [--port 5011]
 */

import net from 'net';
import readline from 'readline';

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 5011;

const TX = '\x1b[34m[TX]\x1b[0m';
const RX = '\x1b[32m[RX]\x1b[0m';
const ER = '\x1b[31m[!!]\x1b[0m';
const IN = '\x1b[33m[--]\x1b[0m';

const client = new net.Socket();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl.setPrompt('AT> ');

client.connect(PORT, 'localhost', () => {
  console.log(`${IN} Bağlandı → localhost:${PORT}`);
  console.log(`${IN} Çıkmak için: .exit veya Ctrl+C\n`);
  rl.prompt();
});

client.on('data', (data) => {
  const lines = data.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    if (line.trim()) {
      const color = line.includes('ERROR') ? '\x1b[31m' : line.startsWith('+') ? '\x1b[36m' : '\x1b[32m';
      process.stdout.write(`\r${RX} ${color}${line}\x1b[0m\n`);
    }
  }
  rl.prompt(true);
});

client.on('close', () => {
  console.log(`\n${IN} Bağlantı kapandı.`);
  process.exit(0);
});

client.on('error', (err) => {
  console.error(`${ER} ${err.message}`);
  console.error(`${IN} Simülatör TCP Server açık mı? (port ${PORT})`);
  process.exit(1);
});

rl.on('line', (line) => {
  const cmd = line.trim();
  if (!cmd) { rl.prompt(); return; }
  if (cmd === '.exit') { client.destroy(); process.exit(0); }

  console.log(`${TX} \x1b[34m${cmd}\x1b[0m`);
  client.write(cmd + '\r\n');
  setTimeout(() => rl.prompt(), 100);
});

rl.on('close', () => { client.destroy(); process.exit(0); });
