// Carel controller BMS Modbus map — keys are the EXACT firmware point IDs
// (00_Config.ino points[], all prefixed "CAREL-"). The ESP32 publishes each on
// the standard `ahu-rig/<id>/telemetry {hmiValue}` topic, already scaled to
// engineering units in firmware (raw / carelScale). Writable points (setpoints
// + coils) are commanded on `ahu-rig/<id>/cmd {value}` via the normal io.command
// path — so Carel data rides the existing telemetry/command pipeline; no server
// change is needed.
//
// NOTE: firmware carelScale defaults to 10 (÷10) and is UNVERIFIED. If a reading
// is off by 10×/100× vs the controller's front panel, fix carelScale in the
// firmware per point — the dashboard shows exactly what the firmware sends.
//
// Fields: id, label, unit, type ('analog'|'digital'), access ('r'|'rw'),
//         regType ('input'|'holding'|'coil'|'discrete'), index, group.

const P = (id, label, unit, type, access, regType, index, group) =>
  ({ id, label, unit, type, access, regType, index, group })

export const carelBmsPoints = [
  // ---- Primary sensor readings (Input Registers) ----
  P('CAREL-DPT',      'Differential Pressure', 'Pa',  'analog', 'r', 'input', 0,  'Primary'),
  P('CAREL-RAT',      'Return Air Temp',       '°C',  'analog', 'r', 'input', 1,  'Primary'),
  P('CAREL-RAH',      'Return Air Humidity',   '%',   'analog', 'r', 'input', 2,  'Primary'),
  P('CAREL-CO2',      'CO₂',                   'ppm', 'analog', 'r', 'input', 8,  'Primary'),
  P('CAREL-VELOCITY', 'Air Velocity',          'm/s', 'analog', 'r', 'input', 9,  'Primary'),

  // ---- Modulating outputs (Input Registers, 0–100 %) ----
  P('CAREL-FAN-OUT',  'Fan Output',            '%',   'analog', 'r', 'input', 3,  'Outputs'),
  P('CAREL-CWV-OUT',  'CW Valve Output',       '%',   'analog', 'r', 'input', 4,  'Outputs'),
  P('CAREL-FAD-OUT',  'FAD Output',            '%',   'analog', 'r', 'input', 5,  'Outputs'),
  P('CAREL-FAD-FBK',  'FAD Feedback',          '%',   'analog', 'r', 'input', 26, 'Outputs'),

  // ---- Chilled-water temperatures (Input Registers) ----
  P('CAREL-CW-IN-TEMP',  'CW In Temp',  '°C', 'analog', 'r', 'input', 6, 'Temperatures'),
  P('CAREL-CW-OUT-TEMP', 'CW Out Temp', '°C', 'analog', 'r', 'input', 7, 'Temperatures'),

  // ---- Per-fan bank (Input Registers) — rendered as a compact table ----
  P('CAREL-SPEED-01', 'Fan 1 Speed',   '%',  'analog', 'r', 'input', 10, 'Fan Bank'),
  P('CAREL-SPEED-02', 'Fan 2 Speed',   '%',  'analog', 'r', 'input', 11, 'Fan Bank'),
  P('CAREL-SPEED-03', 'Fan 3 Speed',   '%',  'analog', 'r', 'input', 12, 'Fan Bank'),
  P('CAREL-SPEED-04', 'Fan 4 Speed',   '%',  'analog', 'r', 'input', 13, 'Fan Bank'),
  P('CAREL-CURR-01',  'Fan 1 Current', 'A',  'analog', 'r', 'input', 14, 'Fan Bank'),
  P('CAREL-CURR-02',  'Fan 2 Current', 'A',  'analog', 'r', 'input', 15, 'Fan Bank'),
  P('CAREL-CURR-03',  'Fan 3 Current', 'A',  'analog', 'r', 'input', 16, 'Fan Bank'),
  P('CAREL-CURR-04',  'Fan 4 Current', 'A',  'analog', 'r', 'input', 17, 'Fan Bank'),
  P('CAREL-VOLT-01',  'Fan 1 Voltage', 'V',  'analog', 'r', 'input', 19, 'Fan Bank'),
  P('CAREL-VOLT-02',  'Fan 2 Voltage', 'V',  'analog', 'r', 'input', 18, 'Fan Bank'),
  P('CAREL-VOLT-03',  'Fan 3 Voltage', 'V',  'analog', 'r', 'input', 20, 'Fan Bank'),
  P('CAREL-VOLT-04',  'Fan 4 Voltage', 'V',  'analog', 'r', 'input', 21, 'Fan Bank'),
  P('CAREL-PWR-01',   'Fan 1 Power',   'kW', 'analog', 'r', 'input', 22, 'Fan Bank'),
  P('CAREL-PWR-02',   'Fan 2 Power',   'kW', 'analog', 'r', 'input', 23, 'Fan Bank'),
  P('CAREL-PWR-03',   'Fan 3 Power',   'kW', 'analog', 'r', 'input', 24, 'Fan Bank'),
  P('CAREL-PWR-04',   'Fan 4 Power',   'kW', 'analog', 'r', 'input', 25, 'Fan Bank'),

  // ---- Status (Discrete Inputs, read-only) ----
  P('CAREL-AUTO-MAN',    'Auto/Manual',      null, 'digital', 'r', 'discrete', 0, 'Status'),
  P('CAREL-PRE-FILTER',  'Pre Filter',       null, 'digital', 'r', 'discrete', 1, 'Status'),
  P('CAREL-FINE-FILTER', 'Fine Filter',      null, 'digital', 'r', 'discrete', 2, 'Status'),
  P('CAREL-FIRE-STATUS', 'Fire Status',      null, 'digital', 'r', 'discrete', 4, 'Status'),
  P('CAREL-EC-FAN-TRIP', 'EC Fan Trip',      null, 'digital', 'r', 'discrete', 5, 'Status'),

  // ---- Commands (Coils, read/write) ----
  P('CAREL-ON-OFF-CMD', 'On / Off',          null, 'digital', 'rw', 'coil', 0, 'Commands'),
  P('CAREL-MAN-FAN-EN', 'Manual Fan Enable', null, 'digital', 'rw', 'coil', 7, 'Commands'),
  P('CAREL-MAN-CWV-EN', 'Manual CWV Enable', null, 'digital', 'rw', 'coil', 8, 'Commands'),
  P('CAREL-MAN-FAD-EN', 'Manual FAD Enable', null, 'digital', 'rw', 'coil', 9, 'Commands'),

  // ---- Setpoints & limits (Holding Registers, read/write) ----
  P('CAREL-SETPOINT-DPT',  'Setpoint DPT',       'Pa',  'analog', 'rw', 'holding', 2,  'Setpoints'),
  P('CAREL-SETPOINT-RAT',  'Setpoint RAT',       '°C',  'analog', 'rw', 'holding', 8,  'Setpoints'),
  P('CAREL-SETPOINT-CO2',  'Setpoint CO₂',       'ppm', 'analog', 'rw', 'holding', 10, 'Setpoints'),
  P('CAREL-MAN-FAN-SPEED', 'Manual Fan Speed',   '%',   'analog', 'rw', 'holding', 58, 'Setpoints'),
  P('CAREL-MAX-FAN-SPEED', 'Max Fan Speed',      '%',   'analog', 'rw', 'holding', 60, 'Setpoints'),
  P('CAREL-MIN-FAN-SPEED', 'Min Fan Speed',      '%',   'analog', 'rw', 'holding', 62, 'Setpoints'),
  P('CAREL-MAN-CWV-MOD',   'Manual CWV Mod',     '%',   'analog', 'rw', 'holding', 64, 'Setpoints'),
  P('CAREL-MAX-CWV',       'Max CWV',            '%',   'analog', 'rw', 'holding', 66, 'Setpoints'),
  P('CAREL-MIN-CWV',       'Min CWV',            '%',   'analog', 'rw', 'holding', 68, 'Setpoints'),
  P('CAREL-MAN-FAD-MOD',   'Manual FAD Mod',     '%',   'analog', 'rw', 'holding', 70, 'Setpoints'),
  P('CAREL-MAX-FAD',       'Max FAD',            '%',   'analog', 'rw', 'holding', 72, 'Setpoints'),
  P('CAREL-MIN-FAD',       'Min FAD',            '%',   'analog', 'rw', 'holding', 74, 'Setpoints')
]

// Fast lookup: is this telemetry id a Carel BMS point?
export const carelIdSet = new Set(carelBmsPoints.map((p) => p.id))

export const carelBmsMap = {
  meta: {
    source: 'Carel BMS Modbus map (Toray Mas Apparel AHUM-HY-E2606-6684)',
    serial: { baud: 19200, dataBits: 8, parity: 'none', stopBits: 1 },
    scaleNote: 'Analog values are scaled in firmware (carelScale, default ÷10) and shown as received — UNVERIFIED.'
  },
  points: carelBmsPoints
}
