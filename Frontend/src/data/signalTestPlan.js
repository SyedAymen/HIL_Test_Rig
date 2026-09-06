// Signal test plan — one entry per row of the AHU Signal I/O Interlink Reference.
// Each test declares what to INJECT and what must then be TRUE (assertions), so the
// runner can decide PASS/FAIL automatically instead of relying on a human verdict.
//
// NOTATION: ESP32/rig notation exactly as the reference table uses it.
//   rig OUTPUT channels (AO-*, DO-*) are what the rig DRIVES into the controller.
//   rig INPUT channels  (AI-*, DI-*) are what the rig SENSES from the controller.
//   The "Signal Type" column of the table is the CONTROLLER's view (inverted).
//
// ANALOG UNITS: rig analog channels are 0–10 V on the wire; `eng` gives the
// engineering range that maps onto it, so we inject in real units (°C/%/Pa) and
// the runner converts to volts.
//
// ACTIVE-LOW CONTACTS: Fire (DO-3) and EC Fan Trip (DO-4) are NC contacts — the
// wire is CLOSED when healthy and OPENS on the event. `activeLow: true` means
// "asserted/alarm = contact open = false on the wire", so the UI can label the
// injected state FIRE/TRIP instead of true/false.
//
// ASSERTION TYPES (evaluated by autoTestEngine):
//   carel   — the Carel counterpart register matches what we injected (± tol)
//   value   — a signal equals / is above / below a number (± tol)
//   trend   — a signal moved up / down / stayed flat since the previous sample
//   alarm   — a named controller alarm bit is (or isn't) active
//   echo    — a rig input reflects the commanded state
//   present — telemetry field exists and is numeric (read-only diagnostics)

export const ENG = {
  RAT: { min: 0, max: 50, unit: '°C' },
  RAH: { min: 0, max: 100, unit: '%' },
  SAT: { min: 0, max: 50, unit: '°C' },
  DPT: { min: 0, max: 1000, unit: 'Pa' },
  PCT: { min: 0, max: 100, unit: '%' }
}

export const signalTests = [
  // ---------------------------------------------------------------- 1 · DO-1
  {
    sno: 1, id: 'DO-1', ctrlType: 'DI', kind: 'digital', rigRole: 'output',
    desc: 'Auto/Manual Status', purpose: 'Monitoring',
    carelId: 'CAREL-AUTO-MAN', carelLabel: 'Discrete Input 0 AUTO/MANUAL STATUS',
    interlinks: ['AI-3', 'AO-4'],
    logic: 'Auto: EC Fan Speed follows DPT PID loop (Sec 2.1). Manual: fan runs from local potentiometer, ignores DPT (Sec 2.2).',
    testText: 'Toggle Auto/Manual while varying DPT (AO-4)',
    expectText: 'In Auto, EC Fan Speed (AI-3) tracks DPT changes. In Manual, EC Fan Speed stays constant regardless of DPT.',
    steps: [
      { name: 'Auto mode · DPT low → fan ramps up',
        setup: { 'DO-1': true }, inject: { 'AO-4': 200 }, settle: 6,
        assert: [
          { type: 'carel', target: 'DO-1', equals: true },
          { type: 'trend', target: 'AI-3', dir: 'up', minDelta: 2 }
        ] },
      { name: 'Auto mode · DPT high → fan ramps down',
        inject: { 'AO-4': 600 }, settle: 6,
        assert: [{ type: 'trend', target: 'AI-3', dir: 'down', minDelta: 2 }] },
      { name: 'Switch to Manual · fan settles on potentiometer',
        setup: { 'DO-1': false }, settle: 12,
        assert: [{ type: 'carel', target: 'DO-1', equals: false }] },
      { name: 'Manual mode · DPT change ignored',
        inject: { 'AO-4': 200 }, settle: 8,
        assert: [{ type: 'trend', target: 'AI-3', dir: 'flat', tol: 1 }] }
    ]
  },

  // ---------------------------------------------------------------- 2 · DO-2
  {
    sno: 2, id: 'DO-2', ctrlType: 'DI', kind: 'digital', rigRole: 'output',
    desc: 'Filter Status', purpose: 'Monitoring', alarmName: 'filter',
    carelId: 'CAREL-PRE-FILTER', carelLabel: 'Discrete Input 1 PRE FILTER STATUS or 2 FINE FILTER STATUS',
    interlinks: [],
    logic: 'When filter DP exceeds client-set threshold, Filter Dirty Alarm raised on display & BMS (Sec 9).',
    testText: 'Toggle contact to simulate DP switch trip',
    expectText: 'Filter Dirty Alarm appears on controller display and is readable via BMS.',
    steps: [
      { name: 'Filter clean → no alarm', inject: { 'DO-2': false }, settle: 2,
        assert: [{ type: 'alarm', name: 'filter', expect: false }] },
      { name: 'DP switch trips → Filter Dirty Alarm', inject: { 'DO-2': true }, settle: 2,
        assert: [
          { type: 'carel', target: 'DO-2', equals: true },
          { type: 'alarm', name: 'filter', expect: true }
        ] }
    ]
  },

  // ---------------------------------------------------------------- 3 · DO-3
  {
    sno: 3, id: 'DO-3', ctrlType: 'DI', kind: 'digital', rigRole: 'output',
    desc: 'Fire Status', purpose: 'Interlock', activeLow: true, alarmName: 'fire',
    stateLabels: { true: 'NORMAL (NC closed)', false: 'FIRE (contact open)' },
    carelId: 'CAREL-FIRE-STATUS', carelLabel: 'Discrete Input 4 FIRE STATUS',
    interlinks: ['DI-1', 'AI-3', 'AI-1', 'AI-2'],
    logic: 'NC in normal condition; acts as NO in fire → AHU power shut down (Sec 10). Soft alarm raised on display & BMS.',
    testText: 'Open the Fire Status contact (simulate fire = NO)',
    expectText: 'AHU On/Off Command goes OFF, EC Fan Speed drops to 0%, soft fire alarm active on display/BMS.',
    steps: [
      { name: 'Normal · AHU running',
        setup: { 'DO-3': true, 'DO-4': true, 'DO-1': true, 'DI-1cmd': true }, inject: { 'AO-4': 200 }, settle: 6,
        assert: [{ type: 'echo', target: 'DI-1', equals: true }, { type: 'alarm', name: 'fire', expect: false }] },
      { name: 'FIRE · contact opens → AHU off, fan 0 %',
        inject: { 'DO-3': false }, settle: 4,
        assert: [
          { type: 'alarm', name: 'fire', expect: true },
          { type: 'echo', target: 'DI-1', equals: false },
          { type: 'value', target: 'AI-3', op: '==', value: 0, tol: 0.5 }
        ] },
      { name: 'Reset · fire cleared', inject: { 'DO-3': true }, settle: 4,
        assert: [{ type: 'alarm', name: 'fire', expect: false }] }
    ]
  },

  // ---------------------------------------------------------------- 4 · DO-4
  {
    sno: 4, id: 'DO-4', ctrlType: 'DI', kind: 'digital', rigRole: 'output',
    desc: 'EC Fan Trip status', purpose: 'Interlock', activeLow: true, alarmName: 'trip',
    stateLabels: { true: 'HEALTHY (NC closed)', false: 'TRIPPED (contact open)' },
    carelId: 'CAREL-EC-FAN-TRIP', carelLabel: 'Discrete Input 5 EC FAN TRIP STATUS',
    interlinks: ['AI-3', 'DO-5'],
    logic: 'MPCB NC contact opens on trip → controller stops commanding fan, raises alarm (Sec 6).',
    testText: 'Open MPCB contact simulation (trip)',
    expectText: 'EC Fan Speed command drops to 0 / fan stop commanded; alarm on display & BMS.',
    steps: [
      { name: 'Healthy · fan commanded',
        setup: { 'DO-3': true, 'DO-4': true, 'DO-1': true, 'DI-1cmd': true }, inject: { 'AO-4': 200 }, settle: 6,
        assert: [{ type: 'alarm', name: 'trip', expect: false }, { type: 'value', target: 'AI-3', op: '>', value: 0 }] },
      { name: 'TRIP · MPCB opens → fan stops',
        inject: { 'DO-4': false }, settle: 4,
        assert: [
          // Carel discrete STATUS registers are event-active (1 = tripped), the
          // same convention ALARM_SOURCES uses. Confirm polarity on the controller.
          { type: 'carel', target: 'DO-4', equals: true },
          { type: 'alarm', name: 'trip', expect: true },
          { type: 'value', target: 'AI-3', op: '==', value: 0, tol: 0.5 }
        ] },
      { name: 'Reset · trip cleared', inject: { 'DO-4': true }, settle: 4,
        assert: [{ type: 'alarm', name: 'trip', expect: false }] }
    ]
  },

  // ---------------------------------------------------------------- 5 · DO-5
  {
    sno: 5, id: 'DO-5', ctrlType: 'DI', kind: 'digital', rigRole: 'output',
    autoVerifiable: false,
    manualReason: 'No "AHU Offline" alarm register on Carel map page 1 — confirm the alarm on the controller display and record the verdict.',
    desc: 'AHU status', purpose: 'Interlock', alarmName: 'ahuOffline',
    carelId: null, carelLabel: '— no counterpart on Carel map page 1',
    interlinks: ['DI-1'],
    logic: 'Reflects actual contactor state. Sec 11 lists "AHU Offline" as a BMS alarm.',
    testText: 'Toggle independently of AHU On/Off Command to simulate a contactor-feedback mismatch',
    expectText: 'If commanded ON but status shows OFF, expect an "AHU Offline" alarm.',
    steps: [
      { name: 'Agreement · commanded ON, contactor ON',
        setup: { 'DO-3': true, 'DO-4': true, 'DI-1cmd': true }, inject: { 'DO-5': true }, settle: 3,
        assert: [{ type: 'alarm', name: 'ahuOffline', expect: false }] },
      { name: 'Mismatch · commanded ON, contactor OFF → AHU Offline',
        inject: { 'DO-5': false }, settle: 3,
        assert: [{ type: 'alarm', name: 'ahuOffline', expect: true }] },
      { name: 'Restore · agreement again', inject: { 'DO-5': true }, settle: 3,
        assert: [{ type: 'alarm', name: 'ahuOffline', expect: false }] }
    ]
  },

  // ---------------------------------------------------------------- 6 · DI-1
  {
    sno: 6, id: 'DI-1', ctrlType: 'DO', kind: 'digital', rigRole: 'input',
    desc: 'AHU On/Off Command', purpose: 'Monitoring & Command',
    carelId: 'CAREL-ON-OFF-CMD', carelLabel: 'Coil 0 ON/OFF COMMAND',
    interlinks: ['DO-3', 'DO-4', 'DO-5'],
    logic: 'Enabled by BMS/local command; controller checks fan fault, fire signal, door status before starting (Sec 1). Forced OFF by active Fire or Fan-trip interlock regardless of command.',
    testText: 'Send ON/OFF via Carel Coil 0, or trigger an interlock (Fire/Trip)',
    expectText: 'DI-1 reading follows the command unless an active interlock forces OFF.',
    steps: [
      { name: 'Command ON (healthy) → DI-1 ON',
        setup: { 'DO-3': true, 'DO-4': true }, command: { 'DI-1cmd': true }, settle: 3,
        assert: [{ type: 'echo', target: 'DI-1', equals: true }] },
      { name: 'Command OFF → DI-1 OFF',
        command: { 'DI-1cmd': false }, settle: 3,
        assert: [{ type: 'echo', target: 'DI-1', equals: false }] },
      { name: 'Command ON but FIRE active → forced OFF',
        command: { 'DI-1cmd': true }, inject: { 'DO-3': false }, settle: 3,
        assert: [{ type: 'echo', target: 'DI-1', equals: false }] },
      { name: 'Clear fire → command honoured again',
        inject: { 'DO-3': true }, settle: 3,
        assert: [{ type: 'echo', target: 'DI-1', equals: true }] }
    ]
  },

  // ---------------------------------------------------------------- 7 · DI-2
  {
    sno: 7, id: 'DI-2', ctrlType: 'DO', kind: 'digital', rigRole: 'input',
    autoVerifiable: false,
    manualReason: 'No UV-lamp coil on Carel map page 1 — command Relay-3 and confirm DI-2 feedback physically.',
    desc: 'UV Lamp On/Off Command', purpose: 'Monitoring & Command',
    carelId: null, carelLabel: '— no UV counterpart on Carel map page 1',
    interlinks: [],
    logic: 'Direct ON/OFF via Relay-3, BMS-writable (Sec 7).',
    testText: 'Command Relay-3 ON/OFF via BMS write',
    expectText: 'DI-2 feedback reflects the commanded state.',
    steps: [
      { name: 'Relay-3 ON → DI-2 ON', command: { 'DI-2cmd': true }, settle: 2,
        assert: [{ type: 'echo', target: 'DI-2', equals: true }] },
      { name: 'Relay-3 OFF → DI-2 OFF', command: { 'DI-2cmd': false }, settle: 2,
        assert: [{ type: 'echo', target: 'DI-2', equals: false }] }
    ]
  },

  // ---------------------------------------------------------------- 8 · DI-3
  {
    sno: 8, id: 'DI-3', ctrlType: 'DO', kind: 'digital', rigRole: 'input',
    autoVerifiable: false,
    manualReason: 'Carel FAD coil is only a low-confidence match for this damper — confirm physically before trusting an automatic verdict.',
    desc: 'Damper On/Off Command', purpose: 'Monitoring & Command',
    carelId: null, carelLabel: '— Carel FAD coil is a low-confidence match',
    interlinks: [],
    logic: 'Direct ON/OFF via Relay-4, BMS-writable (Sec 7).',
    testText: 'Command Relay-4 via BMS',
    expectText: 'DI-3 feedback reflects the commanded state.',
    steps: [
      { name: 'Relay-4 ON → DI-3 ON', command: { 'DI-3cmd': true }, settle: 2,
        assert: [{ type: 'echo', target: 'DI-3', equals: true }] },
      { name: 'Relay-4 OFF → DI-3 OFF', command: { 'DI-3cmd': false }, settle: 2,
        assert: [{ type: 'echo', target: 'DI-3', equals: false }] }
    ]
  },

  // ---------------------------------------------------------------- 9 · AO-1
  {
    sno: 9, id: 'AO-1', ctrlType: 'AI', kind: 'analog', rigRole: 'output', eng: ENG.RAT,
    desc: 'Return Air Temperature', purpose: 'Monitoring & Command',
    carelId: 'CAREL-RAT', carelLabel: 'Input Register 1 RETURN AIR TEMP',
    interlinks: ['AI-1'],
    logic: 'RAT > 25 °C setpoint → CW Valve modulates OPEN. RAT < 25 °C → CW Valve modulates CLOSE (Sec 3).',
    testText: 'Inject 30 °C (above setpoint), then 20 °C (below setpoint)',
    expectText: 'At 30 °C, CHW Valve Control (AI-1) increases/opens. At 20 °C, it decreases/closes.',
    steps: [
      { name: 'Baseline at setpoint (25 °C)', inject: { 'AO-1': 25 }, settle: 4,
        assert: [{ type: 'carel', target: 'AO-1', tol: 1 }] },
      { name: 'Inject 30 °C → CW valve opens', inject: { 'AO-1': 30 }, settle: 5,
        assert: [
          { type: 'carel', target: 'AO-1', tol: 1 },
          { type: 'trend', target: 'AI-1', dir: 'up', minDelta: 2 }
        ] },
      { name: 'Inject 20 °C → CW valve closes', inject: { 'AO-1': 20 }, settle: 5,
        assert: [
          { type: 'carel', target: 'AO-1', tol: 1 },
          { type: 'trend', target: 'AI-1', dir: 'down', minDelta: 2 }
        ] }
    ]
  },

  // --------------------------------------------------------------- 10 · AO-2
  {
    sno: 10, id: 'AO-2', ctrlType: 'AI', kind: 'analog', rigRole: 'output', eng: ENG.RAH,
    desc: 'Return Air Humidity', purpose: 'Monitoring & Command',
    carelId: 'CAREL-RAH', carelLabel: 'Input Register 2 RETURN AIR HUMI',
    interlinks: ['AI-2'],
    logic: 'RAH > 50 % setpoint → HW Valve modulates OPEN. RAH < 50 % → HW Valve modulates CLOSE (Sec 4).',
    testText: 'Inject 70 % (above setpoint), then 30 % (below setpoint)',
    expectText: 'At 70 %, HW Valve Control (AI-2) opens/increases. At 30 %, it closes/decreases.',
    steps: [
      { name: 'Baseline at setpoint (50 %)', inject: { 'AO-2': 50 }, settle: 4,
        assert: [{ type: 'carel', target: 'AO-2', tol: 2 }] },
      { name: 'Inject 70 % → HW valve opens', inject: { 'AO-2': 70 }, settle: 5,
        assert: [
          { type: 'carel', target: 'AO-2', tol: 2 },
          { type: 'trend', target: 'AI-2', dir: 'up', minDelta: 2 }
        ] },
      { name: 'Inject 30 % → HW valve closes', inject: { 'AO-2': 30 }, settle: 5,
        assert: [
          { type: 'carel', target: 'AO-2', tol: 2 },
          { type: 'trend', target: 'AI-2', dir: 'down', minDelta: 2 }
        ] }
    ]
  },

  // --------------------------------------------------------------- 11 · AO-3
  {
    sno: 11, id: 'AO-3', ctrlType: 'AI', kind: 'analog', rigRole: 'output', eng: ENG.SAT,
    autoVerifiable: false,
    manualReason: 'No Supply-Air-Temp register on Carel map page 1 — read the value on the controller display and record the verdict.',
    desc: 'Supply Air Temperature', purpose: 'Monitoring',
    carelId: null, carelLabel: '— no SAT register on Carel map page 1',
    interlinks: [],
    logic: 'Pure monitoring — no control response described (Sec 5).',
    testText: 'Inject any value across 0–50 °C',
    expectText: 'Value displays correctly and is readable via BMS; no secondary control action expected.',
    steps: [
      { name: 'Inject 18 °C · read-back only', inject: { 'AO-3': 18 }, settle: 3,
        assert: [{ type: 'value', target: 'AO-3', op: '==', value: 18, tol: 0.5 }] },
      { name: 'Inject 35 °C · no control action',
        inject: { 'AO-3': 35 }, settle: 4,
        assert: [
          { type: 'value', target: 'AO-3', op: '==', value: 35, tol: 0.5 },
          { type: 'trend', target: 'AI-1', dir: 'flat', tol: 1 },
          { type: 'trend', target: 'AI-3', dir: 'flat', tol: 1 }
        ] }
    ]
  },

  // --------------------------------------------------------------- 12 · AO-4
  {
    sno: 12, id: 'AO-4', ctrlType: 'AI', kind: 'analog', rigRole: 'output', eng: ENG.DPT,
    desc: 'Differential Pressure Transmitter (DPT)', purpose: 'Monitoring & Command',
    carelId: 'CAREL-DPT', carelLabel: 'Input Register 0 DPT',
    interlinks: ['AI-3', 'DO-1'],
    logic: 'In Auto mode only: DPT > 400 Pa → fan ramps down (PID). DPT < 400 Pa → fan ramps up (PID) (Sec 2.1).',
    testText: 'With Auto/Manual = Auto, inject 600 Pa then 200 Pa',
    expectText: 'At 600 Pa, EC Fan Speed (AI-3) ramps down over time. At 200 Pa, it ramps up.',
    steps: [
      { name: 'Auto mode · baseline 400 Pa',
        setup: { 'DO-1': true, 'DO-3': true, 'DO-4': true, 'DI-1cmd': true }, inject: { 'AO-4': 400 }, settle: 5,
        assert: [{ type: 'carel', target: 'AO-4', tol: 20 }] },
      { name: 'Inject 600 Pa → fan ramps DOWN', inject: { 'AO-4': 600 }, settle: 8,
        assert: [
          { type: 'carel', target: 'AO-4', tol: 20 },
          { type: 'trend', target: 'AI-3', dir: 'down', minDelta: 3 }
        ] },
      { name: 'Inject 200 Pa → fan ramps UP', inject: { 'AO-4': 200 }, settle: 8,
        assert: [{ type: 'trend', target: 'AI-3', dir: 'up', minDelta: 3 }] }
    ]
  },

  // --------------------------------------------------------------- 13 · AO-5
  {
    sno: 13, id: 'AO-5', ctrlType: 'AI', kind: 'analog', rigRole: 'output', eng: ENG.PCT,
    desc: 'CW Valve FBK', purpose: 'Monitoring',
    carelId: 'CAREL-CWV-OUT', carelLabel: 'Input Register 4 CW VALVE OUTPUT % (Medium confidence)',
    interlinks: ['AI-1'],
    logic: 'Independent actuator feedback for diagnostic comparison, not a closed-loop control input.',
    testText: 'Inject an FBK value that diverges from the current CHW Valve Control command',
    expectText: 'No direct control action expected; BMS/display show a mismatch for diagnostics only.',
    steps: [
      { name: 'FBK agrees with command', inject: { 'AO-5': 50 }, settle: 3,
        assert: [{ type: 'value', target: 'AO-5', op: '==', value: 50, tol: 1 }] },
      { name: 'Diverge FBK → no control action (diagnostic only)',
        inject: { 'AO-5': 10 }, settle: 5,
        assert: [
          { type: 'value', target: 'AO-5', op: '==', value: 10, tol: 1 },
          { type: 'trend', target: 'AI-1', dir: 'flat', tol: 1 }
        ] }
    ]
  },

  // --------------------------------------------------------------- 14 · AO-6
  {
    sno: 14, id: 'AO-6', ctrlType: 'AI', kind: 'analog', rigRole: 'output', eng: ENG.PCT,
    autoVerifiable: false,
    manualReason: 'No HW-valve-feedback register on Carel map page 1 — confirm on the controller display.',
    desc: 'HW Valve FBK', purpose: 'Monitoring',
    carelId: null, carelLabel: '— no HW valve register on Carel map page 1',
    interlinks: ['AI-2'],
    logic: 'Same pattern as CW Valve FBK — independent actuator feedback for diagnostic comparison.',
    testText: 'Inject a diverging FBK value',
    expectText: 'No direct control action expected; diagnostic comparison only.',
    steps: [
      { name: 'FBK agrees with command', inject: { 'AO-6': 50 }, settle: 3,
        assert: [{ type: 'value', target: 'AO-6', op: '==', value: 50, tol: 1 }] },
      { name: 'Diverge FBK → no control action',
        inject: { 'AO-6': 90 }, settle: 5,
        assert: [
          { type: 'value', target: 'AO-6', op: '==', value: 90, tol: 1 },
          { type: 'trend', target: 'AI-2', dir: 'flat', tol: 1 }
        ] }
    ]
  },

  // --------------------------------------------------------------- 15 · AI-1
  {
    sno: 15, id: 'AI-1', ctrlType: 'AO', kind: 'analog', rigRole: 'input', eng: ENG.PCT,
    desc: 'CHW Valve Control', purpose: 'Monitoring & Command',
    carelId: 'CAREL-CWV-OUT', carelLabel: 'Input Register 4 CW VALVE OUTPUT % (High confidence)',
    interlinks: ['AO-1', 'AO-5'],
    logic: 'Driven by RAT vs. 25 °C setpoint (Sec 3).',
    testText: 'Vary AO-1 (RAT) and observe this output',
    expectText: 'Tracks RAT per Sec 3 logic; rig reads it directly as AI-1.',
    steps: [
      { name: 'RAT 30 °C → AI-1 opens', inject: { 'AO-1': 30 }, settle: 6,
        assert: [
          { type: 'trend', target: 'AI-1', dir: 'up', minDelta: 2 },
          { type: 'carel', target: 'AI-1', tol: 3 }
        ] },
      { name: 'RAT 20 °C → AI-1 closes', inject: { 'AO-1': 20 }, settle: 6,
        assert: [
          { type: 'trend', target: 'AI-1', dir: 'down', minDelta: 2 },
          { type: 'carel', target: 'AI-1', tol: 3 }
        ] }
    ]
  },

  // --------------------------------------------------------------- 16 · AI-2
  {
    sno: 16, id: 'AI-2', ctrlType: 'AO', kind: 'analog', rigRole: 'input', eng: ENG.PCT,
    autoVerifiable: false,
    manualReason: 'No HW-valve-control register on Carel map page 1 — confirm on the controller display.',
    desc: 'HW Valve Control', purpose: 'Monitoring & Command',
    carelId: null, carelLabel: '— no HW valve register on Carel map page 1',
    interlinks: ['AO-2', 'AO-6'],
    logic: 'Driven by RAH vs. 50 % setpoint (Sec 4).',
    testText: 'Vary AO-2 (RAH) and observe this output',
    expectText: 'Tracks RAH per Sec 4 logic; rig reads it directly as AI-2.',
    steps: [
      { name: 'RAH 70 % → AI-2 opens', inject: { 'AO-2': 70 }, settle: 6,
        assert: [{ type: 'trend', target: 'AI-2', dir: 'up', minDelta: 2 }] },
      { name: 'RAH 30 % → AI-2 closes', inject: { 'AO-2': 30 }, settle: 6,
        assert: [{ type: 'trend', target: 'AI-2', dir: 'down', minDelta: 2 }] }
    ]
  },

  // --------------------------------------------------------------- 17 · AI-3
  {
    sno: 17, id: 'AI-3', ctrlType: 'AO', kind: 'analog', rigRole: 'input', eng: ENG.PCT,
    desc: "EC Fan's Speed", purpose: 'Monitoring & Command',
    carelId: 'CAREL-FAN-OUT', carelLabel: 'Input Register 3 FAN OUTPUT %',
    interlinks: ['AO-4', 'DO-1', 'DO-3', 'DO-4'],
    logic: 'Auto: follows DPT PID loop (Sec 2.1). Manual: local potentiometer (Sec 2.2). Forced to 0 on Fire or Fan-trip (Sec 6, 10).',
    testText: 'Vary DPT in Auto mode; separately trigger Fire/Fan-trip interlocks',
    expectText: 'Tracks DPT per PID in Auto; drops to 0 immediately on Fire/Trip regardless of DPT.',
    steps: [
      { name: 'Auto · DPT 200 Pa → speed rises',
        setup: { 'DO-1': true, 'DO-3': true, 'DO-4': true, 'DI-1cmd': true, 'AO-4': 700 }, inject: { 'AO-4': 200 }, settle: 8,
        assert: [
          { type: 'trend', target: 'AI-3', dir: 'up', minDelta: 3 },
          { type: 'carel', target: 'AI-3', tol: 3 }
        ] },
      { name: 'FIRE interlock → speed forced to 0',
        inject: { 'DO-3': false }, settle: 4,
        assert: [{ type: 'value', target: 'AI-3', op: '==', value: 0, tol: 0.5 }] },
      { name: 'Clear fire, TRIP interlock → speed forced to 0',
        inject: { 'DO-3': true, 'DO-4': false }, settle: 4,
        assert: [{ type: 'value', target: 'AI-3', op: '==', value: 0, tol: 0.5 }] },
      { name: 'Clear trip → speed recovers',
        inject: { 'DO-4': true }, settle: 8,
        assert: [{ type: 'value', target: 'AI-3', op: '>', value: 0 }] }
    ]
  },

  // --------------------------------------------------------------- 18 · SI
  {
    sno: 18, id: 'SI', ctrlType: 'SI', kind: 'soft', rigRole: 'soft',
    desc: "EC Fan's Data", purpose: 'Monitoring',
    carelId: 'CAREL-SPEED-01', carelLabel: 'Input Registers 10–25 (fan speed / current / voltage / power)',
    interlinks: ['AI-3'],
    logic: 'Read-only diagnostic telemetry over Modbus soft integration; follows EC Fan Speed.',
    testText: 'N/A — read-only diagnostic telemetry, not independently injectable',
    expectText: 'Fan RPM / A / kW / V are present on the bus and track fan speed.',
    steps: [
      { name: 'Fan running → telemetry present and non-zero',
        setup: { 'DO-1': true, 'DO-3': true, 'DO-4': true, 'DI-1cmd': true }, inject: { 'AO-4': 200 }, settle: 8,
        assert: [
          { type: 'present', target: 'SI.rpm' }, { type: 'present', target: 'SI.current' },
          { type: 'present', target: 'SI.power' }, { type: 'present', target: 'SI.voltage' },
          { type: 'value', target: 'SI.rpm', op: '>', value: 0 }
        ] },
      { name: 'Fan stopped (fire) → telemetry drops to zero',
        inject: { 'DO-3': false }, settle: 5,
        assert: [{ type: 'value', target: 'SI.rpm', op: '==', value: 0, tol: 1 }] },
      { name: 'Reset', inject: { 'DO-3': true }, settle: 3, assert: [] }
    ]
  }
]

export const testById = Object.fromEntries(signalTests.map((t) => [t.id, t]))
