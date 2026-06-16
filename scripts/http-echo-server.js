/**
 * Local HTTP echo server for testing AT+HTTPACTION / AT+QHTTPGET commands.
 *
 * Usage:
 *   node scripts/http-echo-server.js [--port 8080]
 *
 * Then in the simulator send:
 *   AT+HTTPPARA="URL","http://localhost:8080/test"
 *   AT+HTTPACTION=0
 *
 * or Quectel:
 *   AT+QHTTPURL=26,30   → http://localhost:8080/test
 *   AT+QHTTPGET=30
 */

import http from 'http';

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 8080;

const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[34m', M = '\x1b[35m', N = '\x1b[0m';
let reqCount = 0;

const server = http.createServer((req, res) => {
  reqCount++;
  const id = String(reqCount).padStart(3, '0');
  const ts = new Date().toISOString();

  console.log(`\n${M}[${ id }]${N} ${Y}${ts}${N}`);
  console.log(`${B}Method :${N} ${req.method}`);
  console.log(`${B}Path   :${N} ${req.url}`);
  console.log(`${B}Headers:${N}`);
  for (const [k, v] of Object.entries(req.headers)) {
    console.log(`         ${k}: ${v}`);
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    if (body) {
      console.log(`${B}Body   :${N} ${body}`);
    }

    const responseBody = JSON.stringify({
      ok: true,
      echo: {
        method: req.method,
        path: req.url,
        body: body || null,
      },
      server: 'uart-sim-echo',
      request: reqCount,
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(responseBody),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    res.end(responseBody);
    console.log(`${G}→ 200 OK${N} (${Buffer.byteLength(responseBody)} bytes)`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`${G}[HTTP ECHO SERVER]${N} Listening on http://localhost:${PORT}`);
  console.log(`${Y}Simulator'de kullanım:${N}`);
  console.log(`  SIMCom  : AT+HTTPPARA="URL","http://localhost:${PORT}/test"`);
  console.log(`            AT+HTTPACTION=0`);
  console.log(`  Quectel : AT+QHTTPURL=${`http://localhost:${PORT}/test`.length},30`);
  console.log(`            → URL gir, OK bekle`);
  console.log(`            AT+QHTTPGET=30`);
  console.log(`\n${M}Bekleniyor...${N}\n`);
});
