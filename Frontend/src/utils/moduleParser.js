/**
 * Terminal strings follow the panel's own convention:
 *   "U4"    -> base controller, terminal 4
 *   "E1U6"  -> expansion module 1, terminal 6
 *   "E2U3"  -> expansion module 2, terminal 3
 *   "Y1"    -> base controller, analog output 1
 *   "NO2"   -> base controller, relay output 2
 *
 * Whatever prefix pattern the site's panel uses, this is the ONLY place that
 * knows about it. A 4th or 5th expansion module "just works" without any
 * component needing to change — the graph groups points by whatever
 * deriveModule() returns.
 */
const EXPANSION_PATTERN = /^E(\d+)/i

export function deriveModule(terminal) {
  if (!terminal) return 'Base'
  const match = terminal.trim().match(EXPANSION_PATTERN)
  return match ? `EXP-${match[1]}` : 'Base'
}

/**
 * Groups an arbitrary-length point list by module, preserving first-seen order.
 * Returns: [{ module: 'Base', points: [...] }, { module: 'EXP-1', points: [...] }, ...]
 */
export function groupByModule(points) {
  const order = []
  const buckets = {}
  for (const p of points) {
    const mod = p.module || deriveModule(p.terminal)
    if (!buckets[mod]) {
      buckets[mod] = []
      order.push(mod)
    }
    buckets[mod].push(p)
  }
  return order.map((mod) => ({ module: mod, points: buckets[mod] }))
}
