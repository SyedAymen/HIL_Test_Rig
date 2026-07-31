import { defineStore } from 'pinia'
import { seedTestPlan } from '../data/seedTestPlan'
import { computeStatus } from '../utils/statusEngine'

const MAX_SAMPLES = 60

export const useRigStore = defineStore('rig', {
  state: () => ({
    connectionStatus: 'connecting',
    // Default false — Node-RED will push the real retained value via sim.status on
    // every dashboard (re)connect, so we don't want an optimistic 'true' here.
    simulationOn: false,

    testPlan: seedTestPlan(), // replace via loadTestPlan() once a real file is uploaded
    activeSectionId: 'AI',
    selectedPointId: 'DPT-2',

    // { [pointId]: [{ t, hmiValue, controllerValue, commandedValue }] }, newest last, capped at MAX_SAMPLES.
    // This is what every lane and the transfer plot actually render from — points
    // themselves only ever hold the *current* value.
    history: {},

    alarms: [],

    testRun: { sequenceId: null, sequenceName: null, status: 'idle', steps: [], progress: 0, log: [], waitingManual: null },
    storage: { backend: 'sd', usedBytes: 0, capacityBytes: 0 }
  }),

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

    // section counts are always derived from testPlan.sections[].points.length —
    // never hardcoded, so a 27-point AI section next job just works.
    sectionSummary: (state) => (sectionId) => {
      const section = state.testPlan.sections.find((s) => s.id === sectionId)
      if (!section) return { total: 0, passed: 0, failed: 0, pending: 0, percent: 0 }
      let passed = 0, failed = 0, pending = 0
      for (const p of section.points) {
        const status = computeStatus(p)
        if (status === 'pass') passed++
        else if (status === 'fail') failed++
        else pending++ // covers 'pending' and 'awaiting-manual'
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

    // reverse lookup: which stimulus (if any) lists this point in its relatedPoints
    drivingStimulusFor: (state) => (pointId) => {
      for (const section of state.testPlan.sections) {
        const found = section.points.find((p) => p.role === 'stimulus' && (p.relatedPoints || []).includes(pointId))
        if (found) return found
      }
      return null
    }
  },

  actions: {
    // Null-safe send wrapper. All outbound actions call this so they don't crash
    // when invoked before the WS is open (tests, SSR, cold-start race).
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

    // Backfills a short run of samples around each point's seeded current value
    // so lanes render a real-looking trace immediately, before any live data
    // arrives. Demo/dev convenience only — a real deployment's history builds
    // up naturally from actual telemetry.
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
    commandStimulus(pointId, value, send, source = 'manual') {
      const point = this._findPoint(pointId)
      if (!point) return
      point.commandedValue = value
      point.source = source
      // controllerValue must be re-entered by the tester against the new commanded value
      point.controllerValue = null
      // For digital stimulus points, hmiValue mirrors commandedValue immediately
      // (a contact either opens or closes — no slew time). This makes the lane
      // and status badge update the instant the tester taps a command button
      // rather than waiting up to 1200 ms for the next demo-simulator tick.
      if (point.kind === 'digital' && point.role === 'stimulus') {
        point.hmiValue = value
      }
      this.recordSample(point)
      this._send(send, { type: 'io.command', payload: { id: pointId, value }, ts: Date.now() })
    },

    setManualControllerValue(pointId, value, send) {
      const point = this._findPoint(pointId)
      if (!point) return
      point.controllerValue = value
      this.recordSample(point)
      this._send(send, { type: 'manual.entry', payload: { id: pointId, value, ts: Date.now() }, ts: Date.now() })
    },

    confirmResponse(pointId, confirmed, send) {
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
          if (p.role === 'stimulus') p.commandedValue = null
        }
      }
      this._send(send, { type: 'sim.releaseAll', payload: null, ts: Date.now() })
    },

    // --- inbound: called by the WS composable for every parsed message ---
    handleMessage(msg) {
      switch (msg.type) {
        case 'telemetry': {
          // { id, hmiValue?, controllerValue?, confirmed? } — controller echo is
          // rare (most panels can't be polled), so this is mostly hmiValue.
          const point = this._findPoint(msg.payload.id)
          if (point) {
            Object.assign(point, msg.payload)
            this.recordSample(point)
          }
          break
        }
        case 'io.commanded': {
          // Hardware echo from ESP32 after applyCommand() settles — confirms the
          // injected value actually landed on the wire (not just stored in Pinia).
          const point = this._findPoint(msg.payload.id)
          if (point) point.commandedValue = msg.payload.value
          break
        }
        case 'alarm':
          this.alarms.unshift(msg.payload)
          this.alarms = this.alarms.slice(0, 50)
          break
        case 'testplan.set':
          // Push from Node-RED (e.g. on io.list reconcile or future plan-upload endpoint).
          // loadTestPlan() resets active section + selected point, then the rack reflows.
          this.loadTestPlan(msg.payload)
          // Clear the demo history so the new plan doesn't start with stale seeded values.
          this.history = {}
          break
        case 'sim.status':
          // Echoed from retained MQTT on every dashboard (re)connect — always authoritative.
          this.simulationOn = msg.payload.on
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
          // Heartbeat reply — no-op, connection is alive.
          break
        default:
          console.warn('[rig store] unhandled message type', msg.type)
      }
    }
  }
})
