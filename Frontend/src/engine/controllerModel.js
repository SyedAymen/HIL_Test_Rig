// Software model of the AHU controller, implementing the documented control
// scheme so the rig can be exercised end-to-end without the physical UUT.
//
// It is used two ways:
//   • source 'simulated' — the model IS the controller. Injecting a rig value
//     drives this model, and the runner reads responses back from it. This lets
//     the full 18-signal suite run (and pass) on a bench with no AHU attached.
//   • source 'live' — the model still runs alongside as the REFERENCE: the
//     runner compares the real Carel bus values against what the model says
//     should have happened, so a divergence is what produces a FAIL.
//
// Sections refer to the Systemair AHU Control Scheme.

const SP = { RAT: 25, RAH: 50, DPT: 400 }   // documented setpoints (Sec 2.1, 3, 4)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export function createControllerModel() {
  const s = {
    // rig-driven inputs (what the controller sees on its terminals)
    RAT: 25, RAH: 50, SAT: 20, DPT: 400, CWFBK: 50, HWFBK: 50,
    autoMode: true,        // DO-1  true = Auto
    filterDirty: false,    // DO-2  true = DP switch tripped
    fireHealthy: true,     // DO-3  true = NC closed = normal   (false = FIRE)
    fanHealthy: true,      // DO-4  true = NC closed = healthy  (false = TRIP)
    contactorOn: true,     // DO-5  actual contactor feedback
    // BMS / local commands
    ahuCmd: true,          // DI-1 command
    uvCmd: false,          // DI-2 command
    damperCmd: false,      // DI-3 command
    // controller outputs (what the rig reads back)
    chwValve: 50,          // AI-1 %
    hwValve: 50,           // AI-2 %
    fanSpeed: 40,          // AI-3 %
    manualPot: 40          // fan speed in Manual mode (local potentiometer)
  }

  // An interlock forces the AHU off regardless of the command (Sec 1, 6, 10).
  const interlockTripped = () => !s.fireHealthy || !s.fanHealthy
  const ahuRunning = () => s.ahuCmd && !interlockTripped()

  function tick() {
    // --- CW valve follows RAT vs setpoint (Sec 3) ---
    // proportional modulation toward a target derived from the error
    const ratErr = s.RAT - SP.RAT
    const chwTarget = clamp(50 + ratErr * 10, 0, 100)
    s.chwValve += (chwTarget - s.chwValve) * 0.35

    // --- HW valve follows RAH vs setpoint (Sec 4) ---
    const rahErr = s.RAH - SP.RAH
    const hwTarget = clamp(50 + rahErr * 2.5, 0, 100)
    s.hwValve += (hwTarget - s.hwValve) * 0.35

    // --- EC fan speed (Sec 2.1 / 2.2, forced 0 by interlocks Sec 6, 10) ---
    if (!ahuRunning()) {
      s.fanSpeed = 0
    } else if (s.autoMode) {
      // PID-ish: DPT above setpoint ramps down, below ramps up
      const dptErr = SP.DPT - s.DPT              // >0 → need more fan
      const target = clamp(50 + (dptErr / SP.DPT) * 100, 0, 100)
      s.fanSpeed += (target - s.fanSpeed) * 0.30
    } else {
      // Manual: local potentiometer, ignores DPT entirely (Sec 2.2)
      s.fanSpeed += (s.manualPot - s.fanSpeed) * 0.30
    }
    s.fanSpeed = clamp(s.fanSpeed, 0, 100)
  }

  // Alarm bits surfaced on the display / BMS.
  function alarms() {
    return {
      fire: !s.fireHealthy,                             // Sec 10
      trip: !s.fanHealthy,                              // Sec 6
      filter: s.filterDirty,                            // Sec 9
      // Sec 11 "AHU Offline": commanded ON but contactor feedback says OFF
      ahuOffline: s.ahuCmd && !interlockTripped() && !s.contactorOn
    }
  }

  // EC fan soft-integration telemetry (S.No 18) — derived from actual speed.
  function fanData() {
    const f = s.fanSpeed / 100
    return {
      rpm: Math.round(1450 * f),
      current: +(12.5 * f).toFixed(2),
      voltage: +(400 * (0.3 + 0.7 * f)).toFixed(1),
      power: +(7.5 * f * f).toFixed(2)
    }
  }

  // Value of any signal in rig (ESP32) notation — what the dashboard would show.
  function read(id) {
    switch (id) {
      case 'AO-1': return s.RAT
      case 'AO-2': return s.RAH
      case 'AO-3': return s.SAT
      case 'AO-4': return s.DPT
      case 'AO-5': return s.CWFBK
      case 'AO-6': return s.HWFBK
      case 'AI-1': return s.chwValve
      case 'AI-2': return s.hwValve
      case 'AI-3': return s.fanSpeed
      case 'DO-1': return s.autoMode
      case 'DO-2': return s.filterDirty
      case 'DO-3': return s.fireHealthy
      case 'DO-4': return s.fanHealthy
      case 'DO-5': return s.contactorOn
      case 'DI-1': return ahuRunning()      // feedback follows command unless interlocked
      case 'DI-2': return s.uvCmd
      case 'DI-3': return s.damperCmd
      case 'SI.rpm': return fanData().rpm
      case 'SI.current': return fanData().current
      case 'SI.voltage': return fanData().voltage
      case 'SI.power': return fanData().power
      default: return undefined
    }
  }

  // Apply a rig injection / BMS command, in rig notation.
  function apply(id, value) {
    switch (id) {
      case 'AO-1': s.RAT = +value; break
      case 'AO-2': s.RAH = +value; break
      case 'AO-3': s.SAT = +value; break
      case 'AO-4': s.DPT = +value; break
      case 'AO-5': s.CWFBK = +value; break
      case 'AO-6': s.HWFBK = +value; break
      case 'DO-1': s.autoMode = !!value; break
      case 'DO-2': s.filterDirty = !!value; break
      case 'DO-3': s.fireHealthy = !!value; break
      case 'DO-4': s.fanHealthy = !!value; break
      case 'DO-5': s.contactorOn = !!value; break
      case 'DI-1cmd': s.ahuCmd = !!value; break
      case 'DI-2cmd': s.uvCmd = !!value; break
      case 'DI-3cmd': s.damperCmd = !!value; break
      default: break
    }
  }

  // What the Carel bus should report for a signal (engineering units), used as
  // the reference when comparing against real bus data.
  function carelExpected(id) {
    const v = read(id)
    return typeof v === 'boolean' ? v : v
  }

  return { state: s, tick, alarms, fanData, read, apply, carelExpected, setpoints: SP }
}
