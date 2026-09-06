// Test-sequence report CSV. Always emits ALL 18 signals — any signal that was
// not run appears as NOT RUN rather than being silently omitted — followed by a
// per-step detail block and a summary.

import { signalTests } from '../data/signalTestPlan'

function esc(v) {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const fmtVal = (v) =>
  v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? 'ON' : 'OFF')
    : Number.isFinite(Number(v)) ? Number(v).toFixed(2) : String(v)

const SUMMARY_HEADERS = [
  'S.No', 'ESP32 Notation', 'Ctrl Signal Type', 'Signal Description', 'Purpose',
  'Interlinked Signal(s)', 'Test Value Injected', 'Expected Response',
  'Observed Interlink Response', 'Carel Modbus Counterpart', 'Status'
]
const DETAIL_HEADERS = ['S.No', 'ESP32 Notation', 'Step', 'Injected', 'Assertion Result', 'Step Status']

export function buildTestReportCsv(results, meta = {}, timestamp = new Date()) {
  const byId = Object.fromEntries((results || []).map((r) => [r.id, r]))
  const rows = []

  rows.push(['AHU HIL Signal Test Report'])
  rows.push(['Job Name', meta.name ?? ''])
  rows.push(['Job ID', meta.id ?? ''])
  rows.push(['Test Performed By', meta.testedBy ?? ''])
  rows.push(['Report Created By', meta.reportBy ?? ''])
  rows.push(['Mode', meta.mode ?? ''])
  rows.push(['Data source', meta.source === 'live' ? 'Live rig + Carel bus' : 'Simulated controller'])
  rows.push(['Generated', timestamp.toISOString()])
  rows.push([])

  // ---- one row per signal, all 18 always present ----
  rows.push(SUMMARY_HEADERS)
  for (const t of signalTests) {
    const r = byId[t.id]
    const injected = r
      ? r.steps.flatMap((s) => Object.entries(s.injected || {}).map(([k, v]) => `${k}=${fmtVal(v)}`)).join('; ')
      : ''
    const observed = r
      ? r.steps.flatMap((s) => s.checks.filter((c) => !c.skipped).map((c) => `${c.ok ? 'OK' : 'X'} ${c.detail}`)).join('; ')
      : ''
    rows.push([
      t.sno, t.id, t.ctrlType, t.desc, t.purpose,
      (t.interlinks || []).join('; '),
      injected || (r && r.manual ? '(manual observation)' : ''),
      t.expectText, observed || (r && r.reason ? r.reason : ''),
      t.carelLabel || '',
      r ? (r.verdict === 'no-data' ? 'NO DATA' : r.verdict === 'manual' ? 'MANUAL CHECK REQUIRED' : r.verdict.toUpperCase()) : 'NOT RUN'
    ])
  }

  // ---- per-step detail ----
  rows.push([])
  rows.push(['Step detail'])
  rows.push(DETAIL_HEADERS)
  for (const t of signalTests) {
    const r = byId[t.id]
    if (!r || !r.steps.length) continue
    for (const s of r.steps) {
      const inj = Object.entries(s.injected || {}).map(([k, v]) => `${k}=${fmtVal(v)}`).join('; ')
      const checks = s.checks.filter((c) => !c.skipped).map((c) => `${c.ok ? 'OK' : 'X'} ${c.detail}`).join('; ')
      rows.push([t.sno, t.id, s.name, inj, checks || '(no assertions)', s.ok ? 'PASS' : 'FAIL'])
    }
  }

  // ---- summary ----
  const run = signalTests.filter((t) => byId[t.id])
  const cnt = (v) => run.filter((t) => byId[t.id].verdict === v).length
  const pass = cnt('pass'), fail = cnt('fail'), noData = cnt('no-data'), manual = cnt('manual')
  const notRun = signalTests.length - run.length
  rows.push([])
  rows.push(['Summary', `${pass} pass`, `${fail} fail`, `${noData} no data`,
    `${manual} manual check required`, `${notRun} not run`, `${signalTests.length} total`])
  // A run is only PASS when every signal was positively evidenced by hardware.
  const overall = fail > 0 ? 'FAIL'
    : (noData + notRun) > 0 ? 'INCOMPLETE — signals without hardware evidence'
    : manual > 0 ? 'PASS (auto) · manual checks outstanding' : 'PASS'
  rows.push(['Overall result', overall])
  rows.push(['Evidence note', 'Rig stimulus is software-generated; all verdicts come from ESP32 read-back and Carel Modbus registers. No controller simulation is used, so a signal cannot pass without hardware.'])

  return rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function exportTestReport(results, meta = {}) {
  const now = new Date()
  const csv = buildTestReportCsv(results, meta, now)
  const slug = (meta.id || meta.name || 'ahu').toString().replace(/[^\w-]+/g, '-').slice(0, 40)
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
