// Test-sequence report CSV — formatted tabular report with clean sections and no repeated headers.

import { signalTests } from '../data/signalTestPlan'

function esc(v) {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const fmtVal = (v) =>
  v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? 'ON' : 'OFF')
    : Number.isFinite(Number(v)) ? Number(v).toFixed(2) : String(v)

function formatObserved(r) {
  if (!r) return '—'
  if (r.manual) return r.reason || 'Manual check'
  if (!r.steps || !r.steps.length) return r.reason || '—'

  const checks = r.steps.flatMap((s) =>
    (s.checks || [])
      .filter((c) => !c.skipped)
      .map((c) => `${c.ok ? 'PASS' : 'FAIL'}: ${c.detail}`)
  )
  return checks.length ? checks.join('; ') : (r.reason || '—')
}

export function buildTestReportCsv(results, meta = {}, timestamp = new Date()) {
  const byId = Object.fromEntries((results || []).map((r) => [r.id, r]))
  const rows = []

  const dateStr = timestamp.toISOString().replace('T', ' ').slice(0, 19)

  // 1. Report Header & Job Details Block
  rows.push(['AHU HIL SIGNAL TEST REPORT'])
  rows.push(['Job Name', 'Job ID', 'Test Performed By', 'Report Created By', 'Test Date'])
  rows.push([
    meta.name || meta.jobName || '—',
    meta.id || meta.jobId || '—',
    meta.testedBy || '—',
    meta.reportBy || '—',
    dateStr
  ])
  rows.push([])

  // 2. Main Signal Results Table (18 signals)
  rows.push([
    'S.No', 'Signal ID', 'Control Type', 'Signal Description', 'Purpose',
    'Interlinked Signals', 'Injected Value', 'Expected Response',
    'Observed Response', 'Carel Counterpart', 'Verdict'
  ])

  for (const t of signalTests) {
    const r = byId[t.id]
    const injected = r
      ? r.steps.flatMap((s) => Object.entries(s.injected || {}).map(([k, v]) => `${k}=${fmtVal(v)}`)).join('; ')
      : ''

    const verdictStr = r
      ? (r.verdict === 'no-data' ? 'NO DATA' : r.verdict === 'manual' ? 'MANUAL' : r.verdict.toUpperCase())
      : 'NOT RUN'

    rows.push([
      t.sno,
      t.id,
      t.ctrlType,
      t.desc,
      t.purpose,
      (t.interlinks || []).join('; ') || '—',
      injected || (r && r.manual ? 'Manual Observation' : '—'),
      t.expectText,
      formatObserved(r),
      t.carelLabel || '—',
      verdictStr
    ])
  }

  // 3. Summary Block
  const run = signalTests.filter((t) => byId[t.id])
  const cnt = (v) => run.filter((t) => byId[t.id].verdict === v).length
  const pass = cnt('pass'), fail = cnt('fail'), noData = cnt('no-data'), manual = cnt('manual')
  const notRun = signalTests.length - run.length

  const overall = fail > 0 ? 'FAIL'
    : (noData + notRun) > 0 ? 'INCOMPLETE'
    : manual > 0 ? 'PASS (with manual checks)' : 'PASS'

  rows.push([])
  rows.push(['Total Signals', 'Passed', 'Failed', 'No Data', 'Manual Check', 'Not Run', 'Overall Result'])
  rows.push([signalTests.length, pass, fail, noData, manual, notRun, overall])

  return rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function exportTestReport(results, meta = {}) {
  const now = new Date()
  const csv = buildTestReportCsv(results, meta, now)
  const slug = (meta.id || meta.jobId || meta.name || meta.jobName || 'ahu').toString().replace(/[^\w-]+/g, '-').slice(0, 40)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `signal-test-report-${slug}-${now.toISOString().replace(/[:.]/g, '-')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
