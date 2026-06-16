/**
 * Extended Test client for UART SIM Card Module Simulator
 * 
 * Usage:
 *   1. Start the UART Simulator app.
 *   2. Start TCP Server inside the app (e.g. port 5011, UART mode).
 *   3. Run: node scripts/test-modem-client.js --port 5011
 */

import net from 'net';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? parseInt(args[portIndex + 1], 10) : 5011;

console.log(`\x1b[35m[CLIENT]\x1b[0m Connecting to SIM Card Simulator TCP Server on localhost:${port}...`);

const client = new net.Socket();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

client.connect(port, 'localhost', async () => {
  console.log('\x1b[32m[CONNECTED]\x1b[0m Connection established successfully.');
  
  // Helper to send command and wait for response
  const send = (cmd) => {
    console.log(`\x1b[34m[TX]\x1b[0m ${cmd.trim()}`);
    client.write(cmd);
  };

  // 1. Send AT
  send('AT\r\n');
  await delay(500);

  // 2. SIM / Network Queries
  console.log('\n\x1b[35m[TEST]\x1b[0m Running SIM & Network operator queries...');
  send('AT+CPIN?\r\n');
  await delay(500);
  send('AT+COPS?\r\n');
  await delay(500);
  send('AT+CNUM\r\n');
  await delay(500);
  send('AT+CGATT=1\r\n');
  await delay(500);
  send('AT+CGATT?\r\n');
  await delay(500);
  send('AT+CPMS?\r\n');
  await delay(500);
  send('AT+CPMS="SM","SM","SM"\r\n');
  await delay(500);
  send('AT+CGDCONT=1,"IP","internet"\r\n');
  await delay(500);
  send('AT+CIFSR\r\n');
  await delay(500);

  // 3. Upload client certificate
  console.log('\n\x1b[35m[TEST]\x1b[0m Uploading certificates to virtual modem filesystem...');
  send('AT+FSCREATE="client.pem"\r\n');
  await delay(500);
  send('AT+FSWRITE="client.pem",0,30,5\r\n');
  await delay(200);
  send('-----BEGIN CERTIFICATE-----xyz'); // Exactly 30 bytes
  await delay(500);

  // 4. Upload client private key
  send('AT+FSCREATE="client.key"\r\n');
  await delay(500);
  send('AT+FSWRITE="client.key",0,30,5\r\n');
  await delay(200);
  send('-----BEGIN PRIVATE KEY-----abc'); // Exactly 30 bytes
  await delay(500);

  // 5. Filesystem Queries
  console.log('\n\x1b[35m[TEST]\x1b[0m Querying uploaded files...');
  send('AT+FSLS\r\n');
  await delay(500);
  send('AT+FSFLSIZE="client.pem"\r\n');
  await delay(500);
  send('AT+FSREAD="client.pem",0,30,0\r\n');
  await delay(500);

  // 6. Configure SSL context 1
  console.log('\n\x1b[35m[TEST]\x1b[0m Configuring SSL security context...');
  send('AT+CSSLCFG="sslversion",1,3\r\n');
  await delay(500);
  send('AT+CSSLCFG="authmode",1,3\r\n');
  await delay(500);
  send('AT+CSSLCFG="clientcert",1,"client.pem"\r\n');
  await delay(500);
  send('AT+CSSLCFG="clientkey",1,"client.key"\r\n');
  await delay(500);

  // 7. Test MQTTCONN and MQTTS Operations
  console.log('\n\x1b[35m[TEST]\x1b[0m Simulating MQTTS secure connection, subscribe, and publish...');
  send('AT+MQTTCONN="broker.hivemq.com",8883,1\r\n'); // port 8883 with SSL ctx 1
  await delay(800);
  send('AT+MQTTSUB="telemetry/temperature"\r\n');
  await delay(500);
  send('AT+MQTTPUB="telemetry/temperature","temp=24.5C"\r\n');
  await delay(800);

  // 8. Test SMS CMGS
  console.log('\n\x1b[35m[TEST]\x1b[0m Sending SMS...');
  send('AT+CMGS="+905553332211"\r\n');
  await delay(300);
  send('Hello from UART SIM Card Module Simulator!'); // SMS Body
  client.write(Buffer.from([0x1A])); // Ctrl+Z to send
  await delay(1000);

  // 9. Initialize HTTP & REST methods
  console.log('\n\x1b[35m[TEST]\x1b[0m Running HTTP REST actions (GET, POST, PUT, DELETE)...');
  send('AT+HTTPINIT\r\n');
  await delay(500);

  // GET
  send('AT+HTTPPARA="URL","https://jsonplaceholder.typicode.com/todos/1"\r\n');
  await delay(500);
  send('AT+HTTPACTION=0\r\n');
  await delay(3000);
  send('AT+HTTPREAD\r\n');
  await delay(1000);

  // POST
  send('AT+HTTPPARA="URL","https://jsonplaceholder.typicode.com/posts"\r\n');
  await delay(500);
  send('AT+HTTPPARA="CONTENT","application/json"\r\n');
  await delay(500);
  send('AT+HTTPDATA=39,5\r\n');
  await delay(200);
  send('{"title":"foo","body":"bar","userId":1}'); // Exactly 39 bytes
  await delay(500);
  send('AT+HTTPACTION=1\r\n');
  await delay(3000);
  send('AT+HTTPREAD\r\n');
  await delay(1000);

  // PUT
  send('AT+HTTPPARA="URL","https://jsonplaceholder.typicode.com/posts/1"\r\n');
  await delay(500);
  send('AT+HTTPDATA=48,5\r\n');
  await delay(200);
  send('{"id":1,"title":"foo2","body":"bar2","userId":1}'); // Exactly 48 bytes
  await delay(500);
  send('AT+HTTPACTION=2\r\n');
  await delay(3000);
  send('AT+HTTPREAD\r\n');
  await delay(1000);

  // DELETE
  send('AT+HTTPPARA="URL","https://jsonplaceholder.typicode.com/posts/1"\r\n');
  await delay(500);
  send('AT+HTTPACTION=3\r\n');
  await delay(3000);
  send('AT+HTTPREAD\r\n');
  await delay(1000);

  // HTTP Terminate
  send('AT+HTTPTERM\r\n');
  await delay(500);

  // 10. Clean up files
  console.log('\n\x1b[35m[TEST]\x1b[0m Cleaning up virtual filesystem...');
  send('AT+FSDEL="client.pem"\r\n');
  await delay(500);
  send('AT+FSDEL="client.key"\r\n');
  await delay(500);
  send('AT+FSLS\r\n');
  await delay(500);

  console.log('\n\x1b[35m[CLIENT]\x1b[0m Test pipeline completed. Closing connection.');
  client.destroy();
});

client.on('data', (data) => {
  console.log(`\x1b[32m[RX]\x1b[0m ${data.toString('utf8').trim()}`);
});

client.on('close', () => {
  console.log('\x1b[31m[CLOSED]\x1b[0m Connection closed.');
});

client.on('error', (err) => {
  console.error('\x1b[31m[ERROR]\x1b[0m', err.message);
});