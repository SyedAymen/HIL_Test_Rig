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

const HEADERS = ['Timestamp', 'Section', 'S.No', 'Channel', 'Description', 'Direction', 'Kind', 'From', 'To', 'Signal Level', 'Value', 'Value Unit', 'Eng Range', 'Set Point', 'Eng Unit', 'Purpose', 'Alarm']

// One CSV row for a point — shared by the snapshot and single-signal exports.
function pointRow(p, sectionId, stamp) {
  return [
    stamp,
    sectionId ?? '',
    p.sNo ?? '',
    p.id,
    p.label ?? '',
    directionLabel(p.role),
    p.kind,
    p.from ?? '',
    p.to ?? '',
    p.signalLevel ?? '',
    channelValue(p),
    p.kind === 'digital' ? '' : (p.unit ?? 'V'),
    p.rangeText ?? '',
    p.setpoint ?? '',
    p.engUnit ?? '',
    p.purpose ?? '',
    p.alarm ? 'Yes' : 'No'
  ]
}

/**
 * Builds the job/report metadata header lines shared by every export.
 */
function jobHeaderRows(job = {}, timestamp = new Date()) {
  return [
    ['Job Name', job.name ?? ''],
    ['Job ID', job.id ?? ''],
    ['Test Performed By', job.testedBy ?? ''],
    ['Report Created By', job.reportBy ?? ''],
    ['Generated', timestamp.toISOString()],
    []
  ]
}

/**
 * Pure — builds the snapshot CSV string for a whole test plan. No DOM access,
 * so it's straightforward to unit test outside a browser.
 */
export function buildSnapshotCsv(testPlan, timestamp = new Date(), job = {}) {
  const stamp = timestamp.toISOString()
  const rows = [...jobHeaderRows(job, timestamp), HEADERS]
  for (const section of testPlan.sections) {
    for (const p of section.points) {
      rows.push(pointRow(p, section.id, stamp))
    }
  }
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

const VERIFY_HEADERS = ['Signal', 'Rig ID', 'Carel ID', 'Kind', 'Rig (HMI) Value', 'Carel Value', 'Unit', 'Delta', 'Tolerance', 'Status']

/**
 * Pure — builds the verification report CSV: job header + one row per compared
 * signal with its pass/fail verdict, then a summary line.
 */
export function buildVerificationCsv(results, summary, timestamp = new Date(), job = {}) {
  const fmt = (v) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'ON' : 'OFF') : Number(v).toFixed(2))
  const rows = [...jobHeaderRows(job, timestamp), VERIFY_HEADERS]
  for (const r of results) {
    rows.push([
      r.label, r.rigId, r.carelId, r.kind,
      fmt(r.rigValue), fmt(r.carelValue), r.unit ?? '',
      r.delta == null ? '' : Number(r.delta).toFixed(2),
      r.kind === 'analog' ? r.tolerance : '',
      r.status.toUpperCase()
    ])
  }
  rows.push([])
  rows.push(['Summary', `${summary.pass}/${summary.checked} passed`, `${summary.fail} failed`, `${summary.noData} no-data`, `${summary.percent}%`])
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

/**
 * Pure — builds a single-channel CSV (header + one row) for one point. Used by
 * the per-signal export button in the spotlight. `sectionId` is passed in
 * because a point doesn't carry its own section id.
 */
export function buildSignalCsv(point, sectionId, timestamp = new Date()) {
  const stamp = timestamp.toISOString()
  const rows = [HEADERS, pointRow(point, sectionId, stamp)]
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

export function exportSnapshot(testPlan, job = {}) {
  const now = new Date()
  const csv = buildSnapshotCsv(testPlan, now, job)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  downloadCsv(`rig-snapshot-${stamp}.csv`, csv)
}

export function exportVerificationReport(results, summary, job = {}) {
  const now = new Date()
  const csv = buildVerificationCsv(results, summary, now, job)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const slug = (job.id || job.name || 'report').toString().replace(/[^\w-]+/g, '-').slice(0, 40)
  downloadCsv(`verification-${slug}-${stamp}.csv`, csv)
}

export function exportSignal(point, sectionId) {
  const now = new Date()
  const csv = buildSignalCsv(point, sectionId, now)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  downloadCsv(`rig-signal-${point.id}-${stamp}.csv`, csv)
}
