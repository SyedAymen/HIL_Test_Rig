// Test engine — drives the 18-signal suite against the REAL hardware.
//
// DESIGN RULE: the only thing this software simulates is the RIG SIDE — it
// generates and injects the test stimulus a technician would otherwise dial in
// by hand. The AHU/Carel controller is NEVER simulated. Every value used to
// judge a step is read back from real hardware:
//   • the rig's own channels (ESP32 read-back, via the store's points), and
//   • the Carel controller's Modbus registers (store.bmsValues).
//
// Consequently a test can only PASS when real data is present. If the dashboard
// is not connected, the Carel bus is silent, or a signal has no register that
// can evidence it, the result is NO DATA / MANUAL — never PASS. A green result
// therefore always means "the hardware actually did this".
//
// Verdicts: pass | fail | no-data | manual | aborted

import { signalTests } from '../data/signalTestPlan'

const num = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v))
const has = (v) => v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v))

// Alarm bits are read from real Carel discrete inputs. Anything without a
// register cannot be evidenced automatically.
// NOTE: polarity (1 = alarm active) should be confirmed against the controller.
export const ALARM_SOURCES = {
  fire: 'CAREL-FIRE-STATUS',
  trip: 'CAREL-EC-FAN-TRIP',
  filter: 'CAREL-PRE-FILTER',
  ahuOffline: null            // no "AHU Offline" register on Carel map page 1
}

export function engToVolts(test, eng) {
  if (!test?.eng) return Number(eng)
  const { min, max } = test.eng
  return Math.max(0, Math.min(10, ((Number(eng) - min) / (max - min)) * 10))
}
export function voltsToEng(test, volts) {
  if (!test?.eng) return Number(volts)
  const { min, max } = test.eng
  return min + (Math.max(0, Math.min(10, Number(volts))) / 10) * (max - min)
}

const SAMPLE_IDS = ['AO-1', 'AO-2', 'AO-3', 'AO-4', 'AO-5', 'AO-6', 'AI-1', 'AI-2', 'AI-3',
  'DO-1', 'DO-2', 'DO-3', 'DO-4', 'DO-5', 'DI-1', 'DI-2', 'DI-3',
  'SI.rpm', 'SI.current', 'SI.voltage', 'SI.power']

/**
 * @param {object} opts.io  REQUIRED hardware adapter:
 *   inject(id,value,test) push rig stimulus to the ESP32
 *   command(id,value)     issue a BMS/Carel command
 *   readSignal(id)        rig-side read-back, undefined if unknown
 *   readCarel(carelId)    Carel register value, undefined if absent/stale
 */
export function createTestRunner(opts = {}) {
  const { io, settleMs = 900, onProgress = () => {} } = opts
  if (!io) throw new Error('createTestRunner requires a hardware io adapter — there is no simulated controller.')

  let cancelled = false
  const cancel = () => { cancelled = true }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  function sample() {
    const snap = {}
    for (const id of SAMPLE_IDS) snap[id] = io.readSignal(id)
    snap.__alarms = {}
    for (const [name, carelId] of Object.entries(ALARM_SOURCES)) {
      snap.__alarms[name] = carelId ? io.readCarel(carelId) : undefined
    }
    return snap
  }

  async function applyValue(id, value, test) {
    if (id.endsWith('cmd')) io.command(id, value)
    else io.inject(id, value, test)
  }

  async function settle(units) {
    const total = Math.max(1, units || 1) * settleMs
    for (let t = 0; t < total; t += 100) {
      if (cancelled) return
      await sleep(100)
    }
  }

  function evaluate(a, ctx) {
    const { test, before, after } = ctx
    switch (a.type) {
      case 'carel': {
        const id = a.target
        const t = signalTests.find((x) => x.id === id) || test
        if (!t.carelId) return { ok: false, status: 'no-data', detail: `${id}: no Carel register exists to evidence this — manual check required` }
        const carel = io.readCarel(t.carelId)
        if (!has(carel)) return { ok: false, status: 'no-data', detail: `${id}: no data from Carel bus (${t.carelId})` }
        const expected = a.equals !== undefined ? a.equals : after[id]
        if (!has(expected)) return { ok: false, status: 'no-data', detail: `${id}: no rig read-back to compare against` }
        if (typeof expected === 'boolean' || typeof carel === 'boolean') {
          const ok = !!carel === !!expected
          return { ok, status: ok ? 'pass' : 'fail', detail: `Carel ${id}=${fmt(carel)} vs rig ${fmt(expected)}` }
        }
        const delta = Math.abs(num(carel) - num(expected))
        const tol = a.tol ?? 1
        return { ok: delta <= tol, status: delta <= tol ? 'pass' : 'fail',
          detail: `Carel ${id}=${fmt(carel)} vs rig ${fmt(expected)} (Δ${delta.toFixed(2)} ≤ ${tol})` }
      }
      case 'value': {
        const v = after[a.target]
        if (!has(v)) return { ok: false, status: 'no-data', detail: `${a.target}: no data` }
        const n = num(v), target = num(a.value)
        let ok
        if (a.op === '>') ok = n > target
        else if (a.op === '<') ok = n < target
        else ok = Math.abs(n - target) <= (a.tol ?? 0.5)
        return { ok, status: ok ? 'pass' : 'fail', detail: `${a.target}=${fmt(v)} ${a.op} ${a.value}` }
      }
      case 'trend': {
        const b = before[a.target], c = after[a.target]
        if (!has(b) || !has(c)) return { ok: false, status: 'no-data', detail: `${a.target}: no data to compare` }
        const d = num(c) - num(b)
        let ok
        if (a.dir === 'up') ok = d >= (a.minDelta ?? 1)
        else if (a.dir === 'down') ok = -d >= (a.minDelta ?? 1)
        else ok = Math.abs(d) <= (a.tol ?? 1)
        return { ok, status: ok ? 'pass' : 'fail',
          detail: `${a.target} ${num(b).toFixed(1)}→${num(c).toFixed(1)} (Δ${d >= 0 ? '+' : ''}${d.toFixed(1)}, want ${a.dir})` }
      }
      case 'alarm': {
        const src = ALARM_SOURCES[a.name]
        if (!src) return { ok: false, status: 'no-data', detail: `alarm '${a.name}': no Carel register — manual check required` }
        const v = after.__alarms[a.name]
        if (!has(v)) return { ok: false, status: 'no-data', detail: `alarm '${a.name}': no data from ${src}` }
        const active = !!v
        const ok = active === !!a.expect
        return { ok, status: ok ? 'pass' : 'fail', detail: `alarm ${a.name}=${active ? 'ACTIVE' : 'clear'} (want ${a.expect ? 'ACTIVE' : 'clear'})` }
      }
      case 'echo': {
        const v = after[a.target]
        if (!has(v)) return { ok: false, status: 'no-data', detail: `${a.target}: no rig read-back` }
        const ok = !!v === !!a.equals
        return { ok, status: ok ? 'pass' : 'fail', detail: `${a.target}=${fmt(v)} (want ${fmt(a.equals)})` }
      }
      case 'present': {
        const v = after[a.target]
        const ok = has(v) && Number.isFinite(num(v))
        return { ok, status: ok ? 'pass' : 'no-data', detail: `${a.target}=${fmt(v)}` }
      }
      default:
        return { ok: false, status: 'fail', detail: `unknown assertion '${a.type}'` }
    }
  }

  function meta(t) {
    return {
      id: t.id, sno: t.sno, desc: t.desc, purpose: t.purpose, ctrlType: t.ctrlType,
      carelId: t.carelId, carelLabel: t.carelLabel, interlinks: t.interlinks,
      testText: t.testText, expectText: t.expectText
    }
  }

  async function runTest(test) {
    // Signals with no automated evidence path are never auto-judged.
    if (test.autoVerifiable === false) {
      return { ...meta(test), steps: [], verdict: 'manual',
        reason: test.manualReason || 'No Carel register can evidence this signal — operator confirmation required.',
        ts: Date.now() }
    }

    const stepResults = []
    for (const step of test.steps) {
      if (cancelled) break
      if (step.setup) {
        for (const [id, v] of Object.entries(step.setup)) await applyValue(id, v, signalTests.find((x) => x.id === id) || test)
        await settle(1)
      }
      const before = sample()
      const injected = {}
      for (const src of ['inject', 'command']) {
        if (!step[src]) continue
        for (const [id, v] of Object.entries(step[src])) {
          await applyValue(id, v, signalTests.find((x) => x.id === id) || test)
          injected[id] = v
        }
      }
      await settle(step.settle ? Math.max(1, Math.round(step.settle / 3)) : 1)
      const after = sample()

      const checks = step.assert.map((a) => ({ ...evaluate(a, { test, before, after }), assertion: a }))
      const status = !checks.length ? 'pass'
        : checks.some((c) => c.status === 'fail') ? 'fail'
        : checks.some((c) => c.status === 'no-data') ? 'no-data' : 'pass'
      stepResults.push({ name: step.name, injected, ok: status === 'pass', status, checks, before, after })
      onProgress({ test, step: step.name, status })
    }

    const evaluated = stepResults.filter((s) => s.checks.length)
    const verdict = cancelled ? 'aborted'
      : evaluated.some((s) => s.status === 'fail') ? 'fail'
      : evaluated.some((s) => s.status === 'no-data') ? 'no-data'
      : evaluated.length ? 'pass' : 'no-data'
    return { ...meta(test), steps: stepResults, verdict, ts: Date.now() }
  }

  async function runAll(ids = null) {
    cancelled = false
    const list = ids ? signalTests.filter((t) => ids.includes(t.id)) : signalTests
    const out = []
    for (let i = 0; i < list.length; i++) {
      if (cancelled) break
      onProgress({ index: i, total: list.length, test: list[i], phase: 'start' })
      const r = await runTest(list[i])
      out.push(r)
      onProgress({ index: i, total: list.length, test: list[i], phase: 'done', result: r })
    }
    return out
  }

  return { runAll, runTest, cancel, sample, settle, applyValue, io }
}

export function fmt(v) {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'boolean') return v ? 'ON' : 'OFF'
  const n = Number(v)
  return Number.isFinite(n) ? (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1)) : String(v)
}

export function summarise(results) {
  const pass = results.filter((r) => r.verdict === 'pass').length
  const fail = results.filter((r) => r.verdict === 'fail').length
  const noData = results.filter((r) => r.verdict === 'no-data').length
  const manual = results.filter((r) => r.verdict === 'manual').length
  return { total: results.length, pass, fail, noData, manual,
    percent: results.length ? Math.round((pass / results.length) * 100) : 0 }
}
