/*
  broker.js
  ---------
  Standalone entrypoint for the Aedes MQTT broker.
  Delegates to aedes-server.js so the same module can also be
  embedded inside Node-RED via settings.js.

  Standalone:   node broker.js
  Embedded:     see ../node-red/settings-static-snippet.js
*/

'use strict';

const aedesServer = require('./aedes-server');
aedesServer.start(1883);
