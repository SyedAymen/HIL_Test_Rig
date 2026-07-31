// ~/.node-red/settings.js  — merge these keys into your existing settings.
//
// What this does:
//   1. Starts the Aedes MQTT broker (port 1883) INSIDE the Node-RED process
//      so you only ever need to run `node-red` — no separate broker process.
//   2. Serves the built Vue dashboard (npm run build → dist/) at /ui/
//   3. Exposes `fs` and the aedes broker instance to function nodes via
//      global.get('fs') / global.get('aedes')
//
// ── Pre-requisite ─────────────────────────────────────────────────────────
//   The aedes-broker package must be reachable from Node-RED's process.
//   Easiest: install aedes into Node-RED's own node_modules:
//
//     cd ~/.node-red
//     npm install aedes
//
//   Then update AEDES_SERVER_PATH below to point at your aedes-server.js.
//
// ── Path to aedes-server.js ───────────────────────────────────────────────
//   Windows example:
//     const AEDES_SERVER_PATH = 'E:/aymen/My_Work/AHU_Control_Panel_Testing/Code/Firmware-002/aedes-broker/aedes-server.js';
//   Linux/Pi example:
//     const AEDES_SERVER_PATH = '/home/pi/aedes-broker/aedes-server.js';

const AEDES_SERVER_PATH = 'E:/aymen/My_Work/AHU_Control_Panel_Testing/Code/Firmware-002/aedes-broker/aedes-server.js';
const MQTT_PORT = 1883;

// Start the Aedes broker immediately when settings.js is loaded by Node-RED.
const aedesServer = require(AEDES_SERVER_PATH);
aedesServer.start(MQTT_PORT);

// Graceful shutdown when Node-RED exits.
process.on('SIGINT',  () => aedesServer.stop().then(() => process.exit(0)));
process.on('SIGTERM', () => aedesServer.stop().then(() => process.exit(0)));

module.exports = {
    // ...existing settings above this line...

    // ── Static file serving ───────────────────────────────────────────────
    // Serves the built Vue dashboard at http://<host>:1880/ui/
    // Build first:  cd Frontend && npm run build
    // Then copy:    cp -r dist /home/pi/ahu-dashboard-dist   (Linux/Pi)
    // Windows path example: 'E:/aymen/My_Work/AHU_Control_Panel_Testing/Code/Firmware-002/Frontend/dist'
    httpStatic: [
        {
            path: '/home/pi/ahu-dashboard-dist',   // ← update to your dist path
            root: '/ui/'
        }
    ],

    // ── URL roots ─────────────────────────────────────────────────────────
    httpAdminRoot: '/admin',
    httpNodeRoot:  '/api',

    // ── Function node globals ─────────────────────────────────────────────
    // Access in function nodes via:
    //   const fs    = global.get('fs');
    //   const aedes = global.get('aedes');   // the live Aedes broker instance
    functionGlobalContext: {
        fs:    require('fs'),
        aedes: aedesServer   // exposes .broker, .start(), .stop()
    },

    // ...rest of existing settings below this line...
};
