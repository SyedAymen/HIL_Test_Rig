export function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

export function anchorForAngle(deg) {
  const d = ((deg % 360) + 360) % 360
  if (d >= 60 && d <= 120) return 'middle'
  if (d >= 240 && d <= 300) return 'middle'
  if (d > 120 && d < 240) return 'end'
  return 'start'
}

export function dyForAngle(deg) {
  const d = ((deg % 360) + 360) % 360
  if (d >= 60 && d <= 120) return -6
  if (d >= 240 && d <= 300) return 12
  return 4
}

/**
 * Evenly spaces `count` items around a hub within a fan of `spreadDeg`,
 * centered on `centerDeg`. Works for any count — 1, 6, or 20 — which is
 * the whole point: nothing here assumes a fixed number of I/O points.
 */
export function fanAngles(centerDeg, count, spreadDeg = 140) {
  if (count <= 1) return [centerDeg]
  const start = centerDeg - spreadDeg / 2
  const step = spreadDeg / (count - 1)
  return Array.from({ length: count }, (_, i) => start + step * i)
}

/**
 * Spaces `count` hubs evenly in a full circle around the controller.
 */
export function ringAngles(count, offsetDeg = -90) {
  return Array.from({ length: count }, (_, i) => offsetDeg + (360 / count) * i)
}
