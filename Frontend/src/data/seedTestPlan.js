// Rig I/O map — Systemair AHU Control Scheme (Monin Syrup Production Plant, rev 1),
// 18-signal I/O list. Point IDs are the RIG-side (ESP32 module) channel ids that
// the firmware publishes on (AO-1..A0-7, AI-1..AI-3, DO-1..DO-8, DI-1..DI-3), so
// telemetry/commands route by exactly these strings — see 00_Config.ino points[].
//
// DIRECTION (matches the bench wiring sketch): the control-scheme I/O list is
// written from the CONTROLLER's terminals, which invert for the rig that drives
// it. So a controller AI (sensor) is driven by a rig AO, a controller AO
// (actuator) is read by a rig AI, a controller DI (contact) is driven by a rig
// DO, and a controller DO (relay) is read by a rig DI:
//
//   Control-scheme type   →  Rig / dashboard tab
//   AI (sensor)           →  AO   (rig drives 0–10 V)
//   AO (actuator)         →  AI   (rig senses 0–10 V)
//   DI (contact)          →  DO   (rig drives)
//   DO (relay)            →  DI   (rig senses)
//
// Each point carries the signal's description and the I/O-list columns
// (From/To, signal level, process range, set point, unit, purpose, alarm) so the
// UI and the report show exactly what the sheet specifies. Analog values stay
// raw 0–10 V in the UI; rangeText/engUnit are the engineering context.
//
// NOTE: the firmware id for Return Air Humidity is literally "A0-7" (digit zero,
// not letter O) — a typo in 00_Config.ino. We match it verbatim so routing works;
// fix both together if you clean it up.
//
// Signal 18, "EC Fan's Data" (RPM/Amps/kW/Voltage), is Modbus SOFT INTEGRATION,
// not a physical rig channel — it's surfaced on the BMS (Carel) tab's Fan Bank.

function analog(id, role, terminal, m, setV = null) {
  return {
    id, terminal, role, kind: 'analog',
    label: m.desc,
    unit: 'V', min: 0, max: 10,
    commandedValue: role === 'output' ? setV : null,
    hmiValue: setV,
    controllerValue: null,
    source: role === 'output' ? 'manual' : null,
    relatedPoints: [],
    // I/O-list metadata (control-scheme sheet)
    sNo: m.sNo, from: m.from, to: m.to, signalLevel: m.level,
    rangeText: m.range, setpoint: m.sp, engUnit: m.unit, purpose: m.purpose, alarm: !!m.alarm,
    ctrlType: m.ctrlType
  }
}
function digital(id, role, terminal, m, state = null) {
  return {
    id, terminal, role, kind: 'digital',
    label: m.desc,
    unit: null,
    commandedValue: role === 'output' ? state : null,
    hmiValue: state,
    controllerValue: null, confirmed: null,
    source: role === 'output' ? 'manual' : null,
    relatedPoints: [],
    sNo: m.sNo, from: m.from, to: m.to, signalLevel: m.level,
    rangeText: m.range, setpoint: m.sp, engUnit: m.unit, purpose: m.purpose, alarm: !!m.alarm,
    ctrlType: m.ctrlType
  }
}

export function seedTestPlan() {
  // AO — rig drives the sensors the controller reads on its AI (6 signals)
  const aoPoints = [
    analog('AO-1', 'output', 'AO ch0 · 0–10 VDC', { sNo: 12, desc: 'Differential Pressure Transmitter', from: 'DPT Sensor', to: 'Controller', level: '0–10 VDC', range: '0–1000', sp: '400', unit: 'Pa', purpose: 'Monitoring & Control', ctrlType: 'AI' }, 4.00),
    analog('AO-2', 'output', 'AO ch1 · 0–10 VDC', { sNo: 11, desc: 'Supply Air Temperature',           from: 'Temp. sensor', to: 'Controller', level: '0–10 VDC', range: '0–50', sp: '—', unit: '°C', purpose: 'Monitoring', ctrlType: 'AI' }, 4.00),
    analog('AO-3', 'output', 'AO ch2 · 0–10 VDC', { sNo: 13, desc: 'CW Valve Feedback',                 from: 'CW Valve & Actuator', to: 'Controller', level: '0–10 VDC', range: '0–100', sp: '—', unit: '%', purpose: 'Monitoring', ctrlType: 'AI' }, 0.00),
    analog('AO-4', 'output', 'AO ch3 · 0–10 VDC', { sNo: 14, desc: 'HW Valve Feedback',                 from: 'HW Valve & Actuator', to: 'Controller', level: '0–10 VDC', range: '0–100', sp: '—', unit: '%', purpose: 'Monitoring', ctrlType: 'AI' }, 0.00),
    analog('AO-6', 'output', 'AO ch5 · 0–10 VDC', { sNo: 9,  desc: 'Return Air Temperature',            from: '—', to: 'Controller', level: '0–10 VDC', range: '0–50', sp: '25', unit: '°C', purpose: 'Monitoring & Control', ctrlType: 'AI' }, 5.00),
    analog('A0-7', 'output', 'AO ch6 · 0–10 VDC', { sNo: 10, desc: 'Return Air Humidity',               from: '—', to: 'Controller', level: '0–10 VDC', range: '0–100', sp: '50', unit: '%', purpose: 'Monitoring & Control', ctrlType: 'AI' }, 5.00)
  ]

  // AI — rig senses the actuator commands the controller drives on its AO (3 signals)
  const aiPoints = [
    analog('AI-1', 'input', 'AI ch0 · 0–10 VDC', { sNo: 17, desc: "EC Fan's Speed",     from: 'Controller', to: 'EC Fan', level: '0–10 VDC', range: '0–100', sp: '—', unit: '%', purpose: 'Monitoring & Control', ctrlType: 'AO' }, 6.50),
    analog('AI-2', 'input', 'AI ch1 · 0–10 VDC', { sNo: 15, desc: 'CHW Valve Control',  from: 'Controller', to: 'CHW Valve Actuator', level: '0–10 VDC', range: '0–100', sp: '—', unit: '%', purpose: 'Monitoring & Control', ctrlType: 'AO' }, 3.00),
    analog('AI-3', 'input', 'AI ch2 · 0–10 VDC', { sNo: 16, desc: 'HW Valve Control',   from: 'Controller', to: 'HW Valve Actuator', level: '0–10 VDC', range: '0–100', sp: '—', unit: '%', purpose: 'Monitoring & Control', ctrlType: 'AO' }, 0.00)
  ]

  // DO — rig drives the dry contacts the controller reads on its DI (5 signals)
  const doPoints = [
    digital('DO-1', 'output', 'Relay bit 0 · Dry', { sNo: 1, desc: 'Auto/Manual Status', from: 'Auto/Manual Switch', to: 'Controller', level: 'Dry', range: '—', sp: '—', unit: '—', purpose: 'Monitoring', ctrlType: 'DI' }, true),
    digital('DO-2', 'output', 'Relay bit 1 · Dry', { sNo: 5, desc: 'AHU Status',         from: 'Contactor (NC)', to: 'Controller', level: 'Dry', range: '—', sp: '—', unit: '—', purpose: 'Interlock', alarm: true, ctrlType: 'DI' }, true),
    digital('DO-3', 'output', 'Relay bit 2 · Dry', { sNo: 2, desc: 'Filter Status',      from: 'DP Switch', to: 'Controller', level: 'Dry', range: '50–500', sp: '—', unit: 'Pa', purpose: 'Monitoring', alarm: true, ctrlType: 'DI' }, false),
    digital('DO-4', 'output', 'Relay bit 3 · Dry', { sNo: 4, desc: 'EC Fan Trip Status', from: 'MPCB (NC)', to: 'Controller', level: 'Dry', range: '—', sp: '—', unit: '—', purpose: 'Interlock', alarm: true, ctrlType: 'DI' }, false),
    digital('DO-5', 'output', 'Relay bit 4 · Dry', { sNo: 3, desc: 'Fire Status',        from: 'Client Fire Alarm Panel', to: 'Controller', level: 'Dry', range: '—', sp: '—', unit: '—', purpose: 'Interlock', alarm: true, ctrlType: 'DI' }, false)
  ]

  // DI — rig senses the command relays the controller drives on its DO (3 signals)
  const diPoints = [
    digital('DI-1', 'input', 'GPIO4 · 24 VDC', { sNo: 6, desc: 'AHU On/Off Command',      from: 'Controller', to: 'Relay-2 (Marshalling Box)', level: '24 VDC', range: '—', sp: '—', unit: '—', purpose: 'Monitoring & Control', ctrlType: 'DO' }, true),
    digital('DI-2', 'input', 'GPIO5 · 24 VDC', { sNo: 7, desc: 'UV Lamp On/Off Command',  from: 'Controller', to: 'Relay-3 (Marshalling Box)', level: '24 VDC', range: '—', sp: '—', unit: '—', purpose: 'Monitoring & Control', ctrlType: 'DO' }, false),
    digital('DI-3', 'input', 'GPIO6 · 24 VDC', { sNo: 8, desc: 'Damper On/Off Command',   from: 'Controller', to: 'Relay-4 (Marshalling Box)', level: '24 VDC', range: '—', sp: '—', unit: '—', purpose: 'Monitoring & Control', ctrlType: 'DO' }, true)
  ]

  return {
    job: {
      name: '',
      drawingNo: '',
      ahuSlNo: '',
      panel: ''
    },
    sections: [
      { id: 'AO', label: 'Analog Output',  points: aoPoints },
      { id: 'AI', label: 'Analog Input',   points: aiPoints },
      { id: 'DO', label: 'Digital Output', points: doPoints },
      { id: 'DI', label: 'Digital Input',  points: diPoints }
    ]
  }
}
