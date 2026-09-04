import { defineStore } from 'pinia'
import { seedTestPlan } from '../data/seedTestPlan'
import { computeStatus } from '../utils/statusEngine'
import { carelBmsMap, carelIdSet } from '../data/carelBmsMap'
import { verificationMap } from '../data/verificationMap'

const MAX_SAMPLES = 60

export const useRigStore = defineStore('rig', {
  state: () => {
  const seededPlan = seedTestPlan()
  const firstSection = seededPlan.sections[0]
  return ({
    connectionStatus: 'connecting',

    // Carel controller BMS data (rides the standard telemetry pipeline; ids are
    // the CAREL-* firmware point ids). Values arrive already in engineering units.
    bmsMap: carelBmsMap,
    bmsValues: {},       // { [id]: number | boolean }
    bmsLastUpdate: 0,    // ms epoch of the most recent CAREL-* telemetry

    // Job / report metadata entered by the tester — flows into every export.
    job: {
      name: seededPlan.job?.name ?? '',
      id: '',
      testedBy: '',
      reportBy: ''
    },
    // Default false — Node-RED will push the real retained value via sim.status on
    // every dashboard (re)connect, so we don't want an optimistic 'true' here.
    simulationOn: false,

    // VERIFICATION FLAG — there is no Modbus/RS485 link to the UUT yet, so there
    // is nothing to compare readings against. While this is false the dashboard
    // hides ALL pass/fail chrome, tolerance bands, transfer plots and the manual
    // "controller display" boxes, and treats every channel as a raw signal.
    // computeStatus(), the sequence engine and the verification UI all stay in
    // the codebase, dormant — flip this to true (and swap in a live data source)
    // to bring them back without a rebuild.
    verificationEnabled: false,

    testPlan: seededPlan, // replace via loadTestPlan() once a real map is uploaded
    activeSectionId: firstSection?.id ?? null,
    selectedPointId: firstSection?.points[0]?.id ?? null,

    // { [pointId]: [{ t, hmiValue, controllerValue, commandedValue }] }, newest last, capped at MAX_SAMPLES.
    history: {},

    alarms: [],

    testRun: { sequenceId: null, sequenceName: null, status: 'idle', steps: [], progress: 0, log: [], waitingManual: null },
    storage: { backend: 'sd', usedBytes: 0, capacityBytes: 0 }
  })
  },

  getters: {
    sections: (state) => state.testPlan.sections,

    activeSection: (state) => state.testPlan.sections.find((s) => s.id === state.activeSectionId) || null,

    // Carel BMS points grouped for the BMS tab, each with its live value attached.
    bmsGroups: (state) => {
      const order = ['Primary', 'Outputs', 'Temperatures', 'Fan Bank', 'Status', 'Commands', 'Setpoints']
      const byGroup = {}
      for (const p of state.bmsMap.points) {
        ;(byGroup[p.group] ??= []).push({ ...p, value: state.bmsValues[p.id] })
      }
      return order
        .filter((name) => byGroup[name])
        .map((name) => ({ name, points: byGroup[name] }))
    },
    // True when we've never received Carel data, or it stopped ~>4s ago.
    bmsStale: (state) => !state.bmsLastUpdate || Date.now() - state.bmsLastUpdate > 4000,

    // Per-signal comparison of the rig's HMI value against the Carel bus value.
    // Returns one row per verificationMap pair with a pass/fail/no-data verdict.
    verificationResults(state) {
      const findRig = (id) => {
        for (const s of state.testPlan.sections) {
          const p = s.points.find((pt) => pt.id === id)
          if (p) return p
        }
        return null
      }
      return verificationMap.map((m) => {
        const rig = findRig(m.rigId)
        // outputs report what they drive; inputs report what they sense
        const rigRaw = rig ? (rig.role === 'output' ? rig.commandedValue : rig.hmiValue) : undefined
        const carel = state.bmsValues[m.carelId]
        const row = {
          rigId: m.rigId, carelId: m.carelId, label: m.label, kind: m.kind,
          unit: m.unit ?? '', tolerance: m.tolerance,
          rigRaw, rigValue: null, carelValue: carel, delta: null, status: 'no-data'
        }
        const missing = rigRaw == null || carel === undefined || carel === null
        if (m.kind === 'analog') {
          if (!missing) {
            const v = Math.max(0, Math.min(10, Number(rigRaw)))
            const eng = m.engMin + (v / 10) * (m.engMax - m.engMin)
            row.rigValue = eng
            row.delta = Math.abs(eng - Number(carel))
            row.status = row.delta <= m.tolerance ? 'pass' : 'fail'
          }
        } else {
          if (!missing) {
            const rb = !!rigRaw
            const cb = m.invert ? !carel : !!carel
            row.rigValue = rb
            row.status = rb === cb ? 'pass' : 'fail'
          }
        }
        return row
      })
    },
    verificationSummary() {
      const r = this.verificationResults
      const pass = r.filter((x) => x.status === 'pass').length
      const fail = r.filter((x) => x.status === 'fail').length
      const noData = r.filter((x) => x.status === 'no-data').length
      const checked = pass + fail
      return { total: r.length, pass, fail, noData, checked, percent: checked ? Math.round((pass / checked) * 100) : 0 }
    },

    pointsInSection: (state) => (sectionId) => {
      const section = state.testPlan.sections.find((s) => s.id === sectionId)
      return section ? section.points : []
    },

    selectedPoint: (state) => {
      for (const section of state.testPlan.sections) {
        const found = section.points.find((p) => p.id === state.selectedPointId)
        if (found) return found
      }
      return null
    },

    // Channel counts are always derived from testPlan.sections[].points.length —
    // never hardcoded. Passed/failed only mean anything while verification is on.
    sectionSummary: (state) => (sectionId) => {
      const section = state.testPlan.sections.find((s) => s.id === sectionId)
      if (!section) return { total: 0, passed: 0, failed: 0, pending: 0, percent: 0 }
      let passed = 0, failed = 0, pending = 0
      for (const p of section.points) {
        const status = computeStatus(p)
        if (status === 'pass') passed++
        else if (status === 'fail') failed++
        else pending++
      }
      const total = section.points.length
      return { total, passed, failed, pending, percent: total ? Math.round((passed / total) * 100) : 0 }
    },

    overallSummary(state) {
      let total = 0, passed = 0
      for (const section of state.testPlan.sections) {
        for (const p of section.points) {
          total++
          if (computeStatus(p) === 'pass') passed++
        }
      }
      return { total, passed, percent: total ? Math.round((passed / total) * 100) : 0 }
    },

    historyFor: (state) => (pointId) => state.history[pointId] || [],

    pointById: (state) => (pointId) => {
      for (const section of state.testPlan.sections) {
        const found = section.points.find((p) => p.id === pointId)
        if (found) return found
      }
      return null
    },

    // reverse lookup: which output (if any) lists this point in its relatedPoints.
    // Dormant while verification is off (causal links are a verification concept).
    drivingOutputFor: (state) => (pointId) => {
      for (const section of state.testPlan.sections) {
        const found = section.points.find((p) => p.role === 'output' && (p.relatedPoints || []).includes(pointId))
        if (found) return found
      }
      return null
    }
  },

  actions: {
    _send(send, msg) {
      try { send?.(msg) } catch (e) { console.warn('[rig store] send error', e) }
    },
    recordSample(point) {
      const buf = this.history[point.id] || (this.history[point.id] = [])
      buf.push({
        t: Date.now(),
        hmiValue: point.hmiValue ?? null,
        controllerValue: point.controllerValue ?? null,
        commandedValue: point.commandedValue ?? null
      })
      if (buf.length > MAX_SAMPLES) buf.shift()
    },

    // Backfills a short run of samples around each channel's seeded value so
    // lanes render a real-looking trace immediately, before live data arrives.
    initDemoHistory(count = 20) {
      for (const section of this.testPlan.sections) {
        for (const point of section.points) {
          const buf = []
          for (let i = count; i > 0; i--) {
            const jitter = (v) => (v == null ? null : v + (Math.random() - 0.5) * (point.max ? (point.max - point.min) * 0.01 : 0.5))
            buf.push({
              t: Date.now() - i * 1000,
              hmiValue: jitter(point.hmiValue),
              controllerValue: jitter(point.controllerValue),
              commandedValue: point.commandedValue
            })
          }
          this.history[point.id] = buf
        }
      }
    },

    loadTestPlan(plan) {
      this.testPlan = plan
      this.activeSectionId = plan.sections[0]?.id ?? null
      this.selectedPointId = plan.sections[0]?.points[0]?.id ?? null
    },

    selectSection(id) {
      this.activeSectionId = id
      const section = this.testPlan.sections.find((s) => s.id === id)
      this.selectedPointId = section?.points[0]?.id ?? null
    },
    selectPoint(id) {
      this.selectedPointId = id
    },

    addPoint(sectionId, point, send) {
      const section = this.testPlan.sections.find((s) => s.id === sectionId)
      if (!section) return
      section.points.push(point)
      this.selectedPointId = point.id
      this._send(send, { type: 'io.add', payload: point, ts: Date.now() })
    },
    removePoint(sectionId, pointId, send) {
      const section = this.testPlan.sections.find((s) => s.id === sectionId)
      if (!section) return
      section.points = section.points.filter((p) => p.id !== pointId)
      if (this.selectedPointId === pointId) this.selectedPointId = section.points[0]?.id ?? null
      this._send(send, { type: 'io.remove', payload: { id: pointId }, ts: Date.now() })
    },

    _findPoint(id) {
      for (const section of this.testPlan.sections) {
        const found = section.points.find((p) => p.id === id)
        if (found) return found
      }
      return null
    },

    // --- outbound: UI calls these, they call wsSend ---
    // Sets the level/state the rig drives OUT on an output channel (AO / DO).
    setOutput(pointId, value, send, source = 'manual') {
      const point = this._findPoint(pointId)
      if (!point) return
      point.commandedValue = value
      point.source = source
      // controllerValue is a dormant verification field; clear it on a new set.
      point.controllerValue = null
      // Both analog and digital outputs mirror the set value to the read-back
      // immediately so the lane and readout update the instant the tester acts,
      // rather than waiting for the next telemetry/sim tick.
      point.hmiValue = value
      this.recordSample(point)
      this._send(send, { type: 'io.command', payload: { id: pointId, value }, ts: Date.now() })
    },

    // Writes a Carel setpoint (holding register) or command (coil). Carel points
    // use the SAME io.command topic as rig outputs — the firmware routes by id.
    // value is engineering units for analog, boolean for digital.
    sendBmsCommand(id, value, send) {
      this.bmsValues[id] = value   // optimistic; the next poll / ack confirms
      this._send(send, { type: 'io.command', payload: { id, value }, ts: Date.now() })
    },

    // Update job / report metadata (merges the given fields).
    setJob(patch) {
      this.job = { ...this.job, ...patch }
    },

    // Dormant verification helper — manual "controller display" entry.
    setManualControllerValue(pointId, value, send) {
      const point = this._findPoint(pointId)
      if (!point) return
      point.controllerValue = value
      this.recordSample(point)
      this._send(send, { type: 'manual.entry', payload: { id: pointId, value, ts: Date.now() }, ts: Date.now() })
    },

    // Dormant verification helper — manual confirm of a sensed relay.
    confirmInput(pointId, confirmed, send) {
      const point = this._findPoint(pointId)
      if (!point) return
      point.confirmed = confirmed
      this._send(send, { type: 'manual.confirm', payload: { id: pointId, confirmed }, ts: Date.now() })
    },

    toggleSimulation(send) {
      this.simulationOn = !this.simulationOn
      this._send(send, { type: 'sim.set', payload: { on: this.simulationOn }, ts: Date.now() })
    },
    releaseAllOutputs(send) {
      this.simulationOn = false
      for (const section of this.testPlan.sections) {
        for (const p of section.points) {
          if (p.role === 'output') { p.commandedValue = null; p.hmiValue = null }
        }
      }
      this._send(send, { type: 'sim.releaseAll', payload: null, ts: Date.now() })
    },

    // --- inbound: called by the WS composable for every parsed message ---
    handleMessage(msg) {
      switch (msg.type) {
        case 'telemetry': {
          // Carel BMS points ride the same telemetry topic but aren't in the
          // rig test plan — route them to the BMS map instead of a rack point.
          if (carelIdSet.has(msg.payload.id)) {
            this.bmsValues[msg.payload.id] = msg.payload.hmiValue
            this.bmsLastUpdate = Date.now()
            break
          }
          const point = this._findPoint(msg.payload.id)
          if (point) {
            Object.assign(point, msg.payload)
            this.recordSample(point)
          }
          break
        }
        case 'io.commanded': {
          // Hardware echo from ESP32 after the set value settles on the wire.
          if (carelIdSet.has(msg.payload.id)) {
            this.bmsValues[msg.payload.id] = msg.payload.value
            break
          }
          const point = this._findPoint(msg.payload.id)
          if (point) point.commandedValue = msg.payload.value
          break
        }
        case 'alarm':
          this.alarms.unshift(msg.payload)
          this.alarms = this.alarms.slice(0, 50)
          break
        case 'testplan.set':
          this.loadTestPlan(msg.payload)
          this.history = {}
          break
        case 'sim.status':
          this.simulationOn = msg.payload.on
          break
        case 'verification.set':
          // Future hook: Node-RED flips this on once RS485 to the UUT is live.
          this.verificationEnabled = !!msg.payload.on
          break
        case 'test.status':
          Object.assign(this.testRun, msg.payload)
          break
        case 'test.step': {
          const idx = this.testRun.steps.findIndex((s) => s.id === msg.payload.id)
          if (idx >= 0) this.testRun.steps[idx] = msg.payload
          else this.testRun.steps.push(msg.payload)
          break
        }
        case 'test.log':
          this.testRun.log.push(msg.payload)
          this.testRun.log = this.testRun.log.slice(-200)
          break
        case 'storage.stats':
          this.storage = msg.payload
          break
        case 'pong':
          break
        default:
          console.warn('[rig store] unhandled message type', msg.type)
      }
    }
  }
})
