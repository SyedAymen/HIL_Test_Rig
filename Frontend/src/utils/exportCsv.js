import { computeStatus } from './statusEngine'

const HEADERS = [
  'ID', 'Terminal', 'Role', 'Kind', 'Unit',
  'Acceptable Value', 'Tolerance %', 'Commanded',
  'Controller Display', 'HMI Reading', 'Status'
]

function csvEscape(value) {
  if (value == null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function statusText(point) {
  const s = computeStatus(point)
  return { pass: 'PASS', fail: 'FAIL', pending: 'PENDING', 'awaiting-manual': 'VERIFY PENDING' }[s] || s
}

function formatDigital(v) {
  if (v == null) return ''
  return v === true ? 'CLOSED' : v === false ? 'OPEN' : String(v)
}

/**
 * Pure — builds the CSV string for a section. No DOM access, so this half is
 * straightforward to unit test independent of a browser environment.
 */
export function buildSectionCsv(section) {
  const rows = [HEADERS]
  for (const p of section.points) {
    const isDigital = p.kind === 'digital'
    rows.push([
      p.id,
      p.terminal ?? '',
      p.role,
      p.kind,
      p.unit ?? '',
      p.acceptableValue ?? '',
      p.tolerancePercent ?? '',
      isDigital ? formatDigital(p.commandedValue) : (p.commandedValue ?? ''),
      isDigital ? (p.role === 'response' ? (p.confirmed == null ? '' : p.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED') : formatDigital(p.controllerValue)) : (p.controllerValue ?? ''),
      isDigital ? formatDigital(p.hmiValue) : (p.hmiValue ?? ''),
      statusText(p)
    ])
  }
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

/**
 * Side-effecting — triggers a browser download. Kept separate from
 * buildSectionCsv() so the formatting logic can be tested without a DOM.
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

export function exportSectionReport(section) {
  const csv = buildSectionCsv(section)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  downloadCsv(`${section.id}-report-${stamp}.csv`, csv)
}
