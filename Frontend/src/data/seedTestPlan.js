// Rig I/O map for the MONIN SYRUP PRODUCTION PLANT AHU (EC fans), parsed from
// the Systemair AHU Control Scheme I/O list (rev 1, 23-Aug-2025). Nothing
// downstream (rack, spotlight, tabs, snapshot export) hardcodes channel counts —
// change this file and the whole dashboard reflows.
//
// DIRECTION CONVENTION (the important bit):
// Every heading describes the RIG's signal direction, NOT the controller's
// terminals. The control-scheme I/O list is written from the CONTROLLER's point
// of view, so it inverts for the rig that tests it:
//
//   Control-scheme column   Field device            Rig role   Dashboard tab
//   ---------------------   --------------------    --------   -------------
//   Controller AI (sensor)  rig SIMULATES sensor    output  →  AO  (rig drives)
//   Controller AO (actuator)rig READS actuator cmd  input   →  AI  (rig senses)
//   Controller DI (contact) rig SIMULATES contact   output  →  DO  (rig drives)
//   Controller DO (relay)   rig READS relay state   input   →  DI  (rig senses)
//
// SCALING (firmware speaks raw Modbus counts, the UI speaks volts):
//   • Analog values are RAW VOLTAGE, 0–10 V, in the UI. The Waveshare modules
//     use 0–10000 mV counts, so the rig-server bridge divides AI telemetry by
//     1000 (mV→V for display) and multiplies AO commands by 1000 (V→mV) before
//     handing them to the firmware. The process ranges (Pa, °C, %) shown in each
//     label are context only — no eng-unit conversion happens in the dashboard.
//
// POINT IDs ARE THE HARDWARE CONTRACT. Each `id` matches a pointId in the ESP32
// firmware's points[] table (00_Config.ino) and the rig-server routes MQTT on
// `ahu-rig/<id>/telemetry` and `ahu-rig/<id>/cmd` by exactly this string.
//
// Signal #18 in the sheet — "EC Fan's Data" (RPM/Amps/kW/Voltage) — is a Modbus
// SOFT-INTEGRATION point, not a physical rig channel, so it is not in this map.

// --- Analog OUTPUT: rig sets a 0–10 V level, ESP32 forwards it out (Modbus AO) ---
function analogOut(id, terminal, label, setV = null) {
  return {
    id, terminal, label,
    role: 'output', kind: 'analog',
    unit: 'V', min: 0, max: 10,
    commandedValue: setV,                  // the voltage the rig is driving out
    hmiValue: setV,                        // read-back of what's on the wire
    controllerValue: null,                 // dormant — manual verification entry
    source: 'manual', relatedPoints: []
  }
}

// --- Analog INPUT: rig continuously senses the channel (live monitor / Modbus AI) ---
function analogIn(id, terminal, label, sensedV = null) {
  return {
    id, terminal, label,
    role: 'input', kind: 'analog',
    unit: 'V', min: 0, max: 10,
    commandedValue: null,                  // nothing to command — read-only
    hmiValue: sensedV,                     // the voltage the rig is sensing
    controllerValue: null,
    source: null, relatedPoints: []
  }
}

// --- Digital OUTPUT: rig sets ON/OFF, forwarded to ESP32 relay (settable button) ---
function digitalOut(id, terminal, label, state = null) {
  return {
    id, terminal, label,
    role: 'output', kind: 'digital',
    unit: null,
    commandedValue: state,                 // the state the rig is driving
    hmiValue: state,                       // mirrors commanded (instant switch)
    controllerValue: null,
    source: 'manual', relatedPoints: []
  }
}

// --- Digital INPUT: rig senses ON/OFF from the field (read-only indicator / GPIO DI) ---
function digitalIn(id, terminal, label, sensedState = null) {
  return {
    id, terminal, label,
    role: 'input', kind: 'digital',
    unit: null,
    commandedValue: null,                  // nothing to command — read-only
    hmiValue: sensedState,                 // the state the rig is sensing
    controllerValue: null, confirmed: null,
    source: null, relatedPoints: []
  }
}

export function seedTestPlan() {
  // AO — Analog Output (rig simulates the sensors the controller reads on its AI).
  // Firmware MODBUS_AO, slave 3, ch 0–5. Seed volts derive from each sheet setpoint.
  const aoPoints = [
    analogOut('DPT',          'AO0', 'Differential Pressure Transmitter (0–1000 Pa, sp 400)', 4.00),
    analogOut('RAT',          'AO1', 'Return Air Temperature (0–50 °C, sp 25)',                5.00),
    analogOut('RAH',          'AO2', 'Return Air Humidity (0–100 %, sp 50)',                   5.00),
    analogOut('SAT',          'AO3', 'Supply Air Temperature (0–50 °C)',                       4.00),
    analogOut('CW-VALVE-FBK', 'AO4', 'CW Valve Feedback (0–100 %)',                            0.00),
    analogOut('HW-VALVE-FBK', 'AO5', 'HW Valve Feedback (0–100 %)',                            0.00)
  ]

  // AI — Analog Input (rig reads the actuator commands the controller drives on its AO).
  // Firmware MODBUS_AI, slave 2, ch 0–2.
  const aiPoints = [
    analogIn('CHW-VALVE', 'AI0', 'CHW Valve Control (0–100 %)', 3.00),
    analogIn('HW-VALVE',  'AI1', 'HW Valve Control (0–100 %)',  0.00),
    analogIn('EC-FAN',    'AI2', 'EC Fan Speed (0–100 %)',      6.50)
  ]

  // DO — Digital Output (rig simulates the dry contacts the controller reads on its DI).
  // Firmware LOCAL_RELAY via TCA9554 bits 0–4.
  const doPoints = [
    digitalOut('AUTO-MAN',      'RLY1', 'Auto/Manual Status (auto/manual switch)', true),
    digitalOut('FILTER-STATUS', 'RLY2', 'Filter Status (DP switch)',               false),
    digitalOut('FIRE-STATUS',   'RLY3', 'Fire Status (client fire panel)',         false),
    digitalOut('EC-TRIP',       'RLY4', 'EC Fan Trip Status (MPCB NC)',            false),
    digitalOut('AHU-STATUS',    'RLY5', 'AHU Status (contactor NC)',               true)
  ]

  // DI — Digital Input (rig reads the on/off command relays the controller drives on its DO).
  // Firmware LOCAL_DI on GPIO 4/5/6.
  const diPoints = [
    digitalIn('AHU-CMD',    'DI1', 'AHU On/Off Command (Relay-2)',      true),
    digitalIn('UV-CMD',     'DI2', 'UV Lamp On/Off Command (Relay-3)',  false),
    digitalIn('DAMPER-CMD', 'DI3', 'Damper On/Off Command (Relay-4)',   true)
  ]

  return {
    job: {
      name: 'Monin Syrup Production Plant — AHU with EC Fans',
      drawingNo: 'AHU Control Scheme rev.1',
      ahuSlNo: '-',
      panel: 'CONTROLLER WITH EC FAN'
    },
    // Tab order follows the rig's own layout: outputs first, then inputs.
    sections: [
      { id: 'AO', label: 'Analog Output',  points: aoPoints },
      { id: 'AI', label: 'Analog Input',   points: aiPoints },
      { id: 'DO', label: 'Digital Output', points: doPoints },
      { id: 'DI', label: 'Digital Input',  points: diPoints }
    ]
  }
}
