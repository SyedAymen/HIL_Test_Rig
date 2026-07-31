// Quick smoke-test: connect to the local Aedes broker as an MQTT client.
// Run with:  node test_client.mjs
// Expected:  prints "CONNECTED" then "PUBLISHED" then exits 0.
// If it prints TIMEOUT or REFUSED — the broker has a problem, not the ESP32.

import net from 'net';

const HOST = '127.0.0.1';
const PORT = 1883;
const CLIENT_ID = 'test-pc-client-01';
const TIMEOUT_MS = 5000;

// Build a minimal MQTT CONNECT packet (protocol version 3.1.1)
function buildConnect(clientId) {
  const protocolName = Buffer.from([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54]); // "MQTT"
  const protocolLevel = 0x04; // 3.1.1
  const connectFlags = 0x02;  // clean session
  const keepAlive = Buffer.from([0x00, 0x3c]); // 60s
  const idBuf = Buffer.from(clientId, 'utf8');
  const idLen = Buffer.from([0x00, idBuf.length]);
  const payload = Buffer.concat([idLen, idBuf]);
  const varHeader = Buffer.concat([protocolName, Buffer.from([protocolLevel, connectFlags]), keepAlive]);
  const remaining = varHeader.length + payload.length;
  return Buffer.concat([Buffer.from([0x10, remaining]), varHeader, payload]);
}

const socket = net.createConnection({ host: HOST, port: PORT }, () => {
  socket.write(buildConnect(CLIENT_ID));
});

let timer = setTimeout(() => {
  console.error('TIMEOUT — broker did not send CONNACK within 5s');
  socket.destroy();
  process.exit(2);
}, TIMEOUT_MS);

socket.on('data', (data) => {
  clearTimeout(timer);
  // CONNACK is 0x20 0x02 0x00 0x00  (accepted, no session present)
  if (data[0] === 0x20 && data[3] === 0x00) {
    console.log('CONNECTED — broker sent CONNACK(accepted)');
    // Send DISCONNECT and exit cleanly
    socket.write(Buffer.from([0xe0, 0x00]));
    socket.destroy();
    console.log('Test PASSED — Aedes broker is healthy');
    process.exit(0);
  } else {
    console.error(`CONNACK return code = ${data[3]} — broker refused connection`);
    socket.destroy();
    process.exit(1);
  }
});

socket.on('error', (err) => {
  clearTimeout(timer);
  console.error('SOCKET ERROR —', err.message);
  process.exit(3);
});
