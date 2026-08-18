// Raw snapshot export. There is no pass/fail yet (no RS485 link to the UUT), so
// this is a plain state dump, not a verification report: one click, one row per
// channel across every section, capturing exactly what the rig is driving out
// and sensing in at this instant.

function csvEscape(value) {
  if (value == null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function directionLabel(role) {
  return role === 'output' ? 'OUTPUT (rig drives)' : 'INPUT (rig senses)'
}

// The value that matters for the channel: outputs report their set value,
// inputs report the sensed reading.
function channelValue(p) {
  const raw = p.role === 'output' ? p.commandedValue : p.hmiValue
  if (p.kind === 'digital') return raw == null ? '' : raw ? 'ON' : 'OFF'
  return raw == null ? '' : Number(raw).toFixed(2)
}

const HEADERS = ['Timestamp', 'Section', 'Channel', 'Terminal', 'Direction', 'Kind', 'Value', 'Unit', 'Label']

/**
 * Pure — builds the snapshot CSV string for a whole test plan. No DOM access,
 * so it's straightforward to unit test outside a browser.
 */
export function buildSnapshotCsv(testPlan, timestamp = new Date()) {
  const stamp = timestamp.toISOString()
  const rows = [HEADERS]
  for (const section of testPlan.sections) {
    for (const p of section.points) {
      rows.push([
        stamp,
        section.id,
        p.id,
        p.terminal ?? '',
        directionLabel(p.role),
        p.kind,
        channelValue(p),
        p.kind === 'digital' ? '' : (p.unit ?? 'V'),
        p.label ?? ''
      ])
    }
  }
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

/**
 * Pure — builds a single-channel CSV (header + one row) for one point. Used by
 * the per-signal export button in the spotlight. `sectionId` is passed in
 * because a point doesn't carry its own section id.
 */
export function buildSignalCsv(point, sectionId, timestamp = new Date()) {
  const stamp = timestamp.toISOString()
  const rows = [
    HEADERS,
    [
      stamp,
      sectionId ?? '',
      point.id,
      point.terminal ?? '',
      directionLabel(point.role),
      point.kind,
      channelValue(point),
      point.kind === 'digital' ? '' : (point.unit ?? 'V'),
      point.label ?? ''
    ]
  ]
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

/**
 * Side-effecting — triggers a browser download. Kept separate from
 * buildSnapshotCsv() so the formatting logic can be tested without a DOM.
 */
export function downloadCsv(filename, csvString) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportSnapshot(testPlan) {
  const now = new Date()
  const csv = buildSnapshotCsv(testPlan, now)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  downloadCsv(`rig-snapshot-${stamp}.csv`, csv)
}

export function exportSignal(point, sectionId) {
  const now = new Date()
  const csv = buildSignalCsv(point, sectionId, now)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  downloadCsv(`rig-signal-${point.id}-${stamp}.csv`, csv)
}
