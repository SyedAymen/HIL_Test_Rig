import { defineStore } from 'pinia'
import { seedTestPlan } from '../data/seedTestPlan'
import { computeStatus } from '../utils/statusEngine'

const MAX_SAMPLES = 60

export const useRigStore = defineStore('rig', {
  state: () => {
  const seededPlan = seedTestPlan()
  const firstSection = seededPlan.sections[0]
  return ({
    connectionStatus: 'connecting',
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
          const point = this._findPoint(msg.payload.id)
          if (point) {
            Object.assign(point, msg.payload)
            this.recordSample(point)
          }
          break
        }
        case 'io.commanded': {
          // Hardware echo from ESP32 after the set value settles on the wire.
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
