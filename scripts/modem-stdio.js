import { GsmSession } from './mock-receiver.js';

const session = new GsmSession(
  (data) => process.stdout.write(data),
  'stdio'
);

process.stdin.on('data', (chunk) => session.receive(chunk.toString('binary')));
process.stdin.resume();
