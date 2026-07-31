/**
 * Every point's status is derived, never stored as a raw flag someone could
 * set inconsistently. Feed it the point, get back one of:
 *   'pending'          — not enough data yet to judge
 *   'awaiting-manual'  — HMI/telemetry side checks out, still waiting on the
 *                        tester's manual "Controller Display" entry
 *   'pass' | 'fail'
 */
function withinTolerance(value, target, tolerancePercent) {
  if (value == null || target == null) return null
  const pct = tolerancePercent ?? 5
  const tol = Math.max(Math.abs(target) * (pct / 100), 0.0001)
  return Math.abs(value - target) <= tol
}

export function computeStatus(point) {
  if (point.kind === 'digital') {
    if (point.role === 'stimulus') {
      if (point.hmiValue == null) return 'pending'
      return point.hmiValue === point.commandedValue ? 'pass' : 'fail'
    }
    // digital response (relay/DO) — no feedback contact assumed, needs a human to confirm
    if (point.confirmed == null) return 'pending'
    return point.confirmed ? 'pass' : 'fail'
  }

  // analog
  const target = point.commandedValue ?? point.acceptableValue
  if (target == null) return 'pending'

  const hmiOk = withinTolerance(point.hmiValue, target, point.tolerancePercent)
  const ctrlOk = withinTolerance(point.controllerValue, target, point.tolerancePercent)

  if (hmiOk === false || ctrlOk === false) return 'fail'
  if (hmiOk === true && ctrlOk === true) return 'pass'
  if (hmiOk === true && ctrlOk === null) return 'awaiting-manual'
  return 'pending'
}

export const STATUS_COLOR = {
  pass: '#1FB871',
  fail: '#E23838',
  pending: '#BBBFCF',
  'awaiting-manual': '#EEC13B'
}
