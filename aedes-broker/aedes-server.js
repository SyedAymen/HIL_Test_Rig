/*
  aedes-server.js
  ---------------
  Exportable Aedes MQTT broker module.
  Can be started standalone (node broker.js) or required by Node-RED's
  settings.js to embed the broker inside the Node-RED process.

  Usage from settings.js:
    const aedesServer = require('/path/to/aedes-server.js');
    aedesServer.start();          // starts on default port 1883
    aedesServer.start(1883);      // explicit port
    aedesServer.stop();           // graceful shutdown

  Usage standalone:
    node broker.js  (which calls start() itself)
*/

'use strict';

const aedes = require('aedes');
const { createServer } = require('net');

let _broker = null;
let _server = null;
let _port   = null;

// ── Event wiring ─────────────────────────────────────────────────────────────
function wireEvents(broker) {
  broker.on('client', (client) => {
    console.log(`[AEDES] CONNECT    clientId: ${client.id}`);
  });

  broker.on('clientDisconnect', (client) => {
    console.log(`[AEDES] DISCONNECT clientId: ${client.id}`);
  });

  broker.on('clientError', (client, err) => {
    console.error(`[AEDES] CLIENT-ERR clientId: ${client ? client.id : 'unknown'} — ${err.message}`);
  });

  broker.on('connectionError', (_client, err) => {
    console.error(`[AEDES] CONN-ERR  — ${err.message}`);
  });

  broker.on('publish', (packet, client) => {
    if (!client) return; // skip internal broker messages (LWT etc.)
    const payload = packet.payload.toString();
    console.log(`[AEDES] PUBLISH    ${client.id} → ${packet.topic}: ${payload}`);
  });

  broker.on('subscribe', (subscriptions, client) => {
    const topics = subscriptions.map(s => s.topic).join(', ');
    console.log(`[AEDES] SUBSCRIBE  ${client.id} → ${topics}`);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
function start(port = 1883) {
  if (_server) {
    console.warn('[AEDES] Already running on port', _port);
    return { broker: _broker, server: _server };
  }

  _port   = port;
  _broker = aedes();
  _server = createServer(_broker.handle);

  wireEvents(_broker);

  _server.listen(_port, '0.0.0.0', () => {
    console.log('============================================================');
    console.log(` [AEDES] MQTT broker started — port ${_port}`);
    console.log(' [AEDES] Listening on all interfaces (0.0.0.0)');
    console.log(' [AEDES] Node-RED will connect as clientId: node-red-ahu-rig');
    console.log('============================================================');
  });

  _server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[AEDES] Port ${_port} is already in use.`);
      console.error('        Another MQTT broker may be running — stop it first.\n');
    } else {
      console.error('[AEDES] Server error:', err);
    }
    process.exit(1);
  });

  return { broker: _broker, server: _server };
}

function stop() {
  return new Promise((resolve) => {
    if (!_server) { resolve(); return; }
    _broker.close(() => {
      _server.close(() => {
        console.log('[AEDES] Broker stopped.');
        _broker = null;
        _server = null;
        _port   = null;
        resolve();
      });
    });
  });
}

module.exports = { start, stop, get broker() { return _broker; } };
