import { computeStatus } from '../utils/statusEngine'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Polls a point's hmiValue until it stops moving (stays within `epsilon` for
 * `stableForMs`), or gives up after `timeoutMs` and proceeds anyway with a
 * warning — a real settle-detect, not just a fixed clock.
 */
async function waitForSettle(rig, { point: pointId, epsilon = 1, stableForMs = 2000, timeoutMs = 6000 }, isAborted, log, pollMs = 150) {
  const start = Date.now()
  let lastValue = rig.pointById(pointId)?.hmiValue ?? null
  let stableSince = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (isAborted()) return
    await sleep(pollMs)
    const point = rig.pointById(pointId)
    const value = point?.hmiValue ?? null
    if (value == null || lastValue == null) {
      lastValue = value
      continue
    }
    if (Math.abs(value - lastValue) > epsilon) {
      stableSince = Date.now()
    }
    lastValue = value
    if (Date.now() - stableSince >= stableForMs) return
  }
  log('warn', `${pointId} did not settle within ${timeoutMs}ms — proceeding anyway`)
}

/**
 * Waits for a human to fill in `field` on `point` (usually controllerValue —
 * the Controller Display column automation cannot poll). Resolves the moment
 * it's set; never fakes it.
 */
async function waitForManual(rig, pointId, field, isAborted, pollMs = 200) {
  while (true) {
    if (isAborted()) return
    const point = rig.pointById(pointId)
    if (point && point[field] != null) return
    await sleep(pollMs)
  }
}

export function createSequenceEngine(rig, wsSend) {
  let abortRequested = false
  const isAborted = () => abortRequested

  function pushStatus(payload) {
    rig.handleMessage({ type: 'test.status', payload, ts: Date.now() })
  }
  function pushStep(step, status) {
    rig.handleMessage({ type: 'test.step', payload: { ...step, status }, ts: Date.now() })
  }
  function log(level, text) {
    rig.handleMessage({ type: 'test.log', payload: { ts: Date.now(), level, text } })
  }

  async function run(sequence) {
    abortRequested = false
    const total = sequence.steps.length

    pushStatus({
      sequenceId: sequence.id,
      sequenceName: sequence.label,
      status: 'running',
      progress: 0,
      waitingManual: null,
      log: [],
      steps: sequence.steps.map((s) => ({ ...s, status: 'pending' }))
    })
    log('info', `Started "${sequence.label}" — ${total} steps`)

    for (let i = 0; i < total; i++) {
      const step = sequence.steps[i]

      if (abortRequested) {
        pushStep(step, 'skipped')
        continue
      }

      // safety: check declared interlocks before every step, not just at the start
      const tripped = (sequence.abortIf || []).find((id) => rig.pointById(id)?.hmiValue === true)
      if (tripped) {
        log('fail', `ABORTED — interlock ${tripped} tripped`)
        pushStatus({ status: 'aborted', waitingManual: null })
        for (let j = i; j < total; j++) pushStep(sequence.steps[j], 'skipped')
        return
      }

      pushStep(step, 'running')
      pushStatus({ progress: Math.round((i / total) * 100) })

      if (step.type === 'command') {
        rig.commandStimulus(step.point, step.value, wsSend, `sequence:${sequence.label}`)
        log('info', step.title)
        pushStep(step, 'done')
      } else if (step.type === 'wait') {
        log('info', step.title)
        if (step.settle) await waitForSettle(rig, step.settle, isAborted, log)
        else await sleep(step.ms ?? 1000)
        pushStep(step, 'done')
      } else if (step.type === 'requireManual') {
        log('info', `${step.title} — waiting for manual entry`)
        pushStatus({ waitingManual: { point: step.point, field: step.field, title: step.title } })
        await waitForManual(rig, step.point, step.field, isAborted)
        pushStatus({ waitingManual: null })
        pushStep(step, 'done')
      } else if (step.type === 'assert') {
        const point = rig.pointById(step.point)
        const status = computeStatus(point)
        if (status === 'pass') {
          log('pass', `${step.title} — PASS`)
          pushStep(step, 'pass')
        } else {
          log('fail', `${step.title} — FAIL (status: ${status})`)
          pushStep(step, 'fail')
          if (sequence.stopOnFail !== false) {
            pushStatus({ status: 'failed' })
            for (let j = i + 1; j < total; j++) pushStep(sequence.steps[j], 'skipped')
            log('fail', `Stopped — "${sequence.label}" failed at step ${i + 1}/${total}`)
            return
          }
        }
      }
    }

    if (abortRequested) {
      pushStatus({ status: 'aborted' })
      log('warn', `Aborted — "${sequence.label}"`)
    } else {
      pushStatus({ status: 'passed', progress: 100 })
      log('pass', `Completed — "${sequence.label}"`)
    }
  }

  function abort() {
    abortRequested = true
  }

  return { run, abort }
}
