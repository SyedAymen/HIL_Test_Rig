/**
 * A sequence is just steps that reference point IDs already in the test plan —
 * no new vocabulary. Step types:
 *
 *   { type: 'command', point, value }                — drive a stimulus
 *   { type: 'wait', ms }                              — fixed delay
 *   { type: 'wait', settle: { point, epsilon, stableForMs, timeoutMs } }
 *                                                      — wait until a reading
 *                                                        stops moving, not
 *                                                        just a fixed clock
 *   { type: 'requireManual', point, field }           — pause until a human
 *                                                        enters this field
 *                                                        (usually controllerValue —
 *                                                        automation can't fake
 *                                                        the panel's own screen)
 *   { type: 'assert', point }                         — pass/fail via the
 *                                                        SAME computeStatus()
 *                                                        used everywhere else
 *
 * generateBaselineSequence() synthesizes a sensible default from data every
 * point already has (acceptableValue, tolerancePercent) — hand-authored
 * sequences are for ramps/fault-injection/ordering, not for getting started.
 */
export function generateBaselineSequence(section, { settleMs = 2000 } = {}) {
  const steps = []
  let n = 0

  for (const point of section.points) {
    const label = point.label || point.id

    if (point.role === 'stimulus' && point.kind === 'analog') {
      const value = point.acceptableValue ?? Math.round(((point.min ?? 0) + (point.max ?? 100)) / 2)
      steps.push({ id: `s${++n}`, type: 'command', point: point.id, value, title: `Command ${label} = ${value}${point.unit ?? ''}` })
      steps.push({ id: `s${++n}`, type: 'wait', settle: { point: point.id, epsilon: (point.max - point.min) * 0.01, stableForMs: settleMs, timeoutMs: settleMs * 3 }, title: `Wait for ${label} to settle` })
      steps.push({ id: `s${++n}`, type: 'requireManual', point: point.id, field: 'controllerValue', title: `Enter Controller Display reading for ${label}` })
      steps.push({ id: `s${++n}`, type: 'assert', point: point.id, title: `Verify ${label}` })
    } else if (point.role === 'stimulus' && point.kind === 'digital') {
      const value = point.commandedValue ?? true
      steps.push({ id: `s${++n}`, type: 'command', point: point.id, value, title: `Command ${label} = ${value ? 'CLOSED' : 'OPEN'}` })
      steps.push({ id: `s${++n}`, type: 'wait', ms: 800, title: `Wait for ${label} to propagate` })
      steps.push({ id: `s${++n}`, type: 'requireManual', point: point.id, field: 'controllerValue', title: `Confirm Controller Display state for ${label}` })
      steps.push({ id: `s${++n}`, type: 'assert', point: point.id, title: `Verify ${label}` })
    } else if (point.role === 'response' && point.kind === 'analog') {
      // no command — assumes the driving stimulus already ran earlier in a full-FAT queue
      steps.push({ id: `s${++n}`, type: 'wait', settle: { point: point.id, epsilon: (point.max - point.min) * 0.01, stableForMs: settleMs, timeoutMs: settleMs * 3 }, title: `Wait for ${label} to settle` })
      steps.push({ id: `s${++n}`, type: 'assert', point: point.id, title: `Verify ${label}` })
    } else if (point.role === 'response' && point.kind === 'digital') {
      steps.push({ id: `s${++n}`, type: 'requireManual', point: point.id, field: 'confirmed', title: `Confirm ${label} operated` })
      steps.push({ id: `s${++n}`, type: 'assert', point: point.id, title: `Verify ${label}` })
    }
  }

  // safety: abort immediately if a known interlock trips mid-run, regardless of current step
  const abortIf = section.points.filter((p) => /trip/i.test(p.id)).map((p) => p.id)

  return {
    id: `baseline-${section.id.toLowerCase()}`,
    label: `${section.label} — Baseline`,
    sectionId: section.id,
    abortIf,
    steps
  }
}
