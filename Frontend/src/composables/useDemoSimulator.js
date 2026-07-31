import { onMounted, onBeforeUnmount } from 'vue'

/**
 * DEMO ONLY. In production this whole file goes away — Node-RED pushes
 * `telemetry` messages over the real WebSocket instead. This exists so the
 * signal rack and transfer plot have live, causally-related data to render
 * while developing against the template without hardware attached.
 */
export function useDemoSimulator(rig, { intervalMs = 1200, enabled = true } = {}) {
  let timer = null

  function allPoints() {
    return rig.testPlan.sections.flatMap((s) => s.points)
  }

  function drivingStimulusFor(responseId) {
    return rig.drivingStimulusFor(responseId)
  }

  function step(point) {
    if (point.kind === 'digital') {
      if (point.role === 'stimulus' && point.commandedValue != null) {
        // Digital contacts switch instantly — no slew rate, no random delay.
        // Always mirror commandedValue → hmiValue so the lane and status
        // update the moment the tester taps a command button.
        point.hmiValue = point.commandedValue
      }
      rig.recordSample(point)
      return
    }

    const min = point.min ?? 0
    const max = point.max ?? 100
    const noise = () => (Math.random() - 0.5) * (max - min) * 0.006

    if (point.role === 'stimulus') {
      const target = point.commandedValue ?? point.hmiValue ?? (min + max) / 2
      const current = point.hmiValue ?? target
      point.hmiValue = round(current + (target - current) * 0.35 + noise())
    } else {
      // response: drift toward whatever its driving stimulus implies, mapped into this point's own range
      const driver = drivingStimulusFor(point.id)
      let target = point.hmiValue ?? (min + max) / 2
      if (driver && driver.commandedValue != null) {
        const driverSpan = (driver.max ?? 100) - (driver.min ?? 0)
        const ratio = driverSpan ? (driver.commandedValue - (driver.min ?? 0)) / driverSpan : 0
        target = min + ratio * (max - min)
      }
      const current = point.hmiValue ?? target
      point.hmiValue = round(current + (target - current) * 0.25 + noise())
    }
    rig.recordSample(point)
  }

  function round(v) {
    return Math.round(v * 10) / 10
  }

  function tick() {
    for (const point of allPoints()) step(point)
  }

  onMounted(() => {
    rig.initDemoHistory()
    if (enabled) timer = setInterval(tick, intervalMs)
  })
  onBeforeUnmount(() => clearInterval(timer))
}
