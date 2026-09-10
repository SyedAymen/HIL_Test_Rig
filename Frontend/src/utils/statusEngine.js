import { verificationMap } from '../data/verificationMap'

/**
 * Computes pass/fail for a rig point by comparing it against the Carel
 * controller's own independently-reported value for the same physical
 * signal, via verificationMap. This is the single source of truth for
 * status everywhere in the app (Signal Rack, section/overall summaries,
 * CSV export) — there is no separate "verification on/off" concept
 * anymore, and no manual-entry step. Feed it a point plus the live
 * bmsValues map, get back one of:
 *   'pending' — no Carel counterpart configured for this point, or the
 *               Carel bus hasn't reported a value yet
 *   'pass' | 'fail'
 */
const mapByRigId = Object.fromEntries(verificationMap.map((m) => [m.rigId, m]))

export function computeStatus(point, bmsValues = {}) {
  const m = mapByRigId[point.id]
  if (!m) return 'pending' // no Carel-side signal exists to compare against

  const rigRaw = point.role === 'output' ? point.commandedValue : point.hmiValue
  const carel = bmsValues[m.carelId]
  if (rigRaw == null || carel == null) return 'pending'

  if (m.kind === 'analog') {
    const v = Math.max(0, Math.min(10, Number(rigRaw)))
    const eng = m.engMin + (v / 10) * (m.engMax - m.engMin)
    return Math.abs(eng - Number(carel)) <= m.tolerance ? 'pass' : 'fail'
  }

  const rb = !!rigRaw
  const cb = m.invert ? !carel : !!carel
  return rb === cb ? 'pass' : 'fail'
}

export const STATUS_COLOR = {
  pass: '#1FB871',
  fail: '#E23838',
  pending: '#BBBFCF'
}
