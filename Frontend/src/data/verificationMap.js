// Verification map — pairs each rig channel (its HMI value on the dashboard) with
// the matching value the Carel controller reports on its Modbus bus, to decide
// PASS/FAIL per signal. rigId is the firmware channel id (AO-1.., DI-1.. — see
// seedTestPlan.js); carelId is a CAREL-* id from carelBmsMap.js.
//
//   • analog: the rig's 0–10 V is converted to engineering units via engMin..engMax
//     (matching the Carel unit) and compared within `tolerance`.
//   • digital: booleans compared directly (`invert: true` if rig-ON = Carel-OFF).
//   • rig OUTPUT channels compare what they DRIVE; INPUT channels what they SENSE.
//
// TUNE TO YOUR BENCH. Ranges/tolerances are first-pass; comment out any pair not
// wired. A few tentative pairs are flagged.

const a = (rigId, carelId, label, engMin, engMax, unit, tolerance) =>
  ({ rigId, carelId, label, kind: 'analog', engMin, engMax, unit, tolerance })
const d = (rigId, carelId, label, invert = false) =>
  ({ rigId, carelId, label, kind: 'digital', invert })

export const verificationMap = [
  // Analog — rig drives a sensor sim → controller should read it back
  a('AO-1', 'CAREL-DPT', 'Differential Pressure', 0, 1000, 'Pa', 20),
  a('AO-6', 'CAREL-RAT', 'Return Air Temperature', 0, 50, '°C', 1.0),
  a('A0-7', 'CAREL-RAH', 'Return Air Humidity', 0, 100, '%', 3),

  // Analog — rig senses a controller output → controller states the same %
  a('AI-1', 'CAREL-FAN-OUT', 'EC Fan Output', 0, 100, '%', 3),
  a('AI-2', 'CAREL-CWV-OUT', 'CW Valve Output', 0, 100, '%', 3),

  // Digital — rig drives a contact → controller status bit
  d('DO-1', 'CAREL-AUTO-MAN', 'Auto/Manual Status'),
  d('DO-5', 'CAREL-FIRE-STATUS', 'Fire Status'),
  d('DO-4', 'CAREL-EC-FAN-TRIP', 'EC Fan Trip'),

  // Tentative — confirm wiring/polarity, then keep or remove
  a('AO-3', 'CAREL-CWV-OUT', 'CW Valve Feedback vs Output', 0, 100, '%', 5),
  d('DO-3', 'CAREL-PRE-FILTER', 'Filter Status'),
  d('DI-1', 'CAREL-ON-OFF-CMD', 'AHU On/Off Command')
]
