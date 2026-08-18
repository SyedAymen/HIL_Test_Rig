import { onMounted, onBeforeUnmount } from 'vue'

/**
 * DEMO ONLY. In production this whole file goes away — Node-RED pushes
 * `telemetry` messages over the real WebSocket instead. This exists so the
 * signal rack has live, moving data to render while developing without hardware.
 *
 * Direction model matches the rig:
 *   output channels (AO/DO) — settle toward whatever the rig is driving out
 *   input channels  (AI/DI) — wander like a real sensed line, proving the
 *                             channel is alive/noisy (there is no UUT link to
 *                             derive a "correct" value from yet)
 */
export function useDemoSimulator(rig, { intervalMs = 1200, enabled = true } = {}) {
  let timer = null

  function allPoints() {
    return rig.testPlan.sections.flatMap((s) => s.points)
  }

  function round(v) {
    return Math.round(v * 100) / 100
  }

  function step(point) {
    if (point.kind === 'digital') {
      if (point.role === 'output' && point.commandedValue != null) {
        // Digital outputs switch instantly — mirror commanded → sensed read-back.
        point.hmiValue = point.commandedValue
      }
      // Digital inputs hold their sensed field state steady in the demo.
      rig.recordSample(point)
      return
    }

    const min = point.min ?? 0
    const max = point.max ?? 10
    const noise = () => (Math.random() - 0.5) * (max - min) * 0.006

    if (point.role === 'output') {
      // Track the voltage the rig is driving out, with a touch of wire noise.
      const target = point.commandedValue ?? point.hmiValue ?? 0
      const current = point.hmiValue ?? target
      point.hmiValue = round(Math.min(max, Math.max(min, current + (target - current) * 0.4 + noise())))
    } else {
      // Input: bounded random walk so the live monitor line visibly moves.
      const current = point.hmiValue ?? (min + max) / 2
      const drift = (Math.random() - 0.5) * (max - min) * 0.03
      point.hmiValue = round(Math.min(max, Math.max(min, current + drift)))
    }
    rig.recordSample(point)
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
