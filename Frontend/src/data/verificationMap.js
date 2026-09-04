// Verification map — pairs each rig channel (its HMI value on the dashboard)
// with the matching value the Carel controller reports on its Modbus bus, so we
// can decide PASS/FAIL per signal now that the RS485 link exists.
//
// HOW A COMPARISON WORKS
//   • Rig analog values are raw 0–10 V on the dashboard. Each pair says what
//     engineering range that 0–10 V represents (engMin..engMax, matching the
//     Carel value's unit), so the rig volts are converted to engineering units
//     and compared to the Carel reading within `tolerance` (engineering units).
//   • Rig digital values are booleans, compared directly to the Carel bit
//     (set `invert: true` if the wiring makes rig-ON correspond to Carel-OFF).
//   • For rig OUTPUT channels the rig value is what it DRIVES (commandedValue);
//     for INPUT channels it's what it SENSES (hmiValue). The store picks the
//     right one from the point's role.
//
// TUNE THIS TO YOUR RIG. The default pairs below match signals by name across
// the rig I/O map and the Carel BMS map; ranges/tolerances are first-pass
// engineering guesses. Verify each against the controller and adjust. Comment
// out (or delete) any pair that isn't wired on your bench — an unmapped signal
// simply isn't verified. rigId must exist in seedTestPlan.js; carelId in
// carelBmsMap.js.

// a = analog pair, d = digital pair
const a = (rigId, carelId, label, engMin, engMax, unit, tolerance) =>
  ({ rigId, carelId, label, kind: 'analog', engMin, engMax, unit, tolerance })
const d = (rigId, carelId, label, invert = false) =>
  ({ rigId, carelId, label, kind: 'digital', invert })

export const verificationMap = [
  // ---- Analog: rig drives a sensor sim → controller should read it back ----
  a('DPT',       'CAREL-DPT', 'Differential Pressure', 0, 1000, 'Pa', 20),
  a('RAT',       'CAREL-RAT', 'Return Air Temp',       0, 50,   '°C', 1.0),
  a('RAH',       'CAREL-RAH', 'Return Air Humidity',   0, 100,  '%',  3),

  // ---- Analog: rig senses a controller output → controller states the same % ----
  a('EC-FAN',    'CAREL-FAN-OUT', 'EC Fan Output',     0, 100, '%', 3),
  a('CHW-VALVE', 'CAREL-CWV-OUT', 'CW Valve Output',   0, 100, '%', 3),

  // ---- Digital: rig drives a contact → controller status bit ----
  d('AUTO-MAN',    'CAREL-AUTO-MAN',    'Auto/Manual Status'),
  d('FIRE-STATUS', 'CAREL-FIRE-STATUS', 'Fire Status'),
  d('EC-TRIP',     'CAREL-EC-FAN-TRIP', 'EC Fan Trip'),

  // ---- Tentative pairs — confirm the wiring/polarity, then keep or remove ----
  a('CW-VALVE-FBK', 'CAREL-CWV-OUT', 'CW Valve Feedback vs Output', 0, 100, '%', 5),
  d('FILTER-STATUS', 'CAREL-PRE-FILTER', 'Filter Status'),
  d('AHU-CMD',       'CAREL-ON-OFF-CMD', 'AHU On/Off Command')
]
