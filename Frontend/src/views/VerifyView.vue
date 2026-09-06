<script setup>
import { computed } from 'vue'
import { useRigStore } from '../stores/rig'
import { exportVerificationReport } from '../utils/exportCsv'

// Compares each rig HMI value against the Carel bus reading and shows a pass/fail
// verdict, plus the job metadata that goes into the report.
const rig = useRigStore()

const results = computed(() => rig.verificationResults)
const summary = computed(() => rig.verificationSummary)

// Two-way bound job fields.
function jobField(key) {
  return computed({
    get: () => rig.job[key],
    set: (v) => rig.setJob({ [key]: v })
  })
}
const jobName = jobField('name')
const jobId = jobField('id')
const testedBy = jobField('testedBy')
const reportBy = jobField('reportBy')

function fmt(v, unit) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'ON' : 'OFF'
  const n = Number(v)
  const s = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1)
  return unit ? `${s} ${unit}` : s
}
const statusClass = (s) =>
  s === 'pass' ? 'bg-success-soft text-success'
  : s === 'fail' ? 'bg-critical-soft text-critical'
  : 'bg-sunken text-ttext-secondary'

function onExport() {
  exportVerificationReport(rig.verificationResults, rig.verificationSummary, rig.job)
}
</script>

<template>
  <div class="h-full overflow-y-auto scroll-thin pr-1 space-y-3">
    <!-- Job / report metadata -->
    <section class="panel-card p-4">
      <div class="flex items-center justify-between mb-3">
        <p class="eyebrow">Job / Report Details</p>
        <button class="h-9 px-4 rounded-lg bg-primary text-white text-sm font-bold" @click="onExport">⭳ Export Report</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label class="block">
          <span class="text-xs font-medium text-ttext-secondary">Job Name</span>
          <input v-model="jobName" type="text" placeholder="e.g. Toray Mas Apparel AHU"
                 class="mt-1 w-full h-9 px-3 rounded-lg border-2 border-border bg-surface text-sm" />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-ttext-secondary">Job ID</span>
          <input v-model="jobId" type="text" placeholder="e.g. AHUM-HY-E2606-6684"
                 class="mt-1 w-full h-9 px-3 rounded-lg border-2 border-border bg-surface text-sm" />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-ttext-secondary">Test Performed By</span>
          <input v-model="testedBy" type="text" placeholder="Technician name"
                 class="mt-1 w-full h-9 px-3 rounded-lg border-2 border-border bg-surface text-sm" />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-ttext-secondary">Report Created By</span>
          <input v-model="reportBy" type="text" placeholder="Engineer name"
                 class="mt-1 w-full h-9 px-3 rounded-lg border-2 border-border bg-surface text-sm" />
        </label>
      </div>
    </section>

    <!-- Verdict summary -->
    <section class="panel-card p-4 flex flex-wrap items-center gap-4">
      <div
        class="px-4 py-2 rounded-xl font-display font-bold text-lg"
        :class="summary.fail > 0 ? 'bg-critical-soft text-critical' : summary.checked ? 'bg-success-soft text-success' : 'bg-sunken text-ttext-secondary'"
      >
        {{ summary.fail > 0 ? 'FAIL' : summary.checked ? 'PASS' : 'NO DATA' }}
      </div>
      <div class="flex gap-5 font-mono text-sm">
        <span><b class="text-success">{{ summary.pass }}</b> pass</span>
        <span><b class="text-critical">{{ summary.fail }}</b> fail</span>
        <span><b class="text-ttext-tertiary">{{ summary.noData }}</b> no-data</span>
        <span class="text-ttext-secondary">{{ summary.percent }}% of {{ summary.checked }} checked</span>
      </div>
      <span
        class="ml-auto font-mono text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5"
        :class="rig.bmsStale ? 'bg-sunken text-ttext-secondary' : 'bg-success-soft text-success'"
      >
        <span class="w-2 h-2 rounded-full" :class="rig.bmsStale ? 'bg-ttext-tertiary' : 'bg-success pulse-dot'"></span>
        {{ rig.bmsStale ? 'CAREL BUS: NO DATA' : 'CAREL BUS: LIVE' }}
      </span>
    </section>

    <!-- Comparison table -->
    <section class="panel-card p-4">
      <p class="eyebrow mb-3">Signal Comparison · Rig HMI vs Carel Bus</p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm tabular-nums">
          <thead>
            <tr class="text-ttext-tertiary font-mono text-xs text-left border-b border-border">
              <th class="py-2 pr-3 font-medium">Signal</th>
              <th class="py-2 px-3 font-medium text-right">Rig (HMI)</th>
              <th class="py-2 px-3 font-medium text-right">Carel Bus</th>
              <th class="py-2 px-3 font-medium text-right">Δ</th>
              <th class="py-2 px-3 font-medium text-right">Tol</th>
              <th class="py-2 pl-3 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in results" :key="r.rigId + r.carelId" class="border-b border-border/60">
              <td class="py-2 pr-3">
                <div class="font-semibold">{{ r.label }}</div>
                <div class="font-mono text-[11px] text-ttext-tertiary">{{ r.rigId }} ↔ {{ r.carelId }}</div>
              </td>
              <td class="py-2 px-3 text-right font-display">{{ fmt(r.rigValue, r.unit) }}</td>
              <td class="py-2 px-3 text-right font-display">{{ fmt(r.carelValue, r.unit) }}</td>
              <td class="py-2 px-3 text-right" :class="r.status === 'fail' ? 'text-critical font-semibold' : 'text-ttext-secondary'">
                {{ r.kind === 'analog' && r.delta != null ? fmt(r.delta, r.unit) : '—' }}
              </td>
              <td class="py-2 px-3 text-right text-ttext-tertiary">{{ r.kind === 'analog' ? '±' + r.tolerance : '—' }}</td>
              <td class="py-2 pl-3 text-right">
                <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-full" :class="statusClass(r.status)">
                  {{ r.status === 'no-data' ? '—' : r.status.toUpperCase() }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="font-mono text-[11px] text-ttext-tertiary mt-3">
        Rig analog values (0–10 V) are converted to engineering units per the mapping and compared to the Carel reading
        within tolerance. Pairs, ranges and tolerances are defined in <code>verificationMap.js</code> — tune them to your bench.
      </p>
    </section>
  </div>
</template>
