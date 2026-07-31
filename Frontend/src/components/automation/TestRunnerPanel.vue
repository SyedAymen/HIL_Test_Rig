<script setup>
import { computed, inject, ref } from 'vue'
import { useRigStore } from '../../stores/rig'
import { generateBaselineSequence } from '../../engine/sequenceGenerator'
import { createSequenceEngine } from '../../engine/sequenceEngine'

const props = defineProps({
  section: { type: Object, required: true } // { id, label, points }
})

const rig = useRigStore()
const wsSend = inject('wsSend')
const engine = createSequenceEngine(rig, wsSend)

const manualDraft = ref('')

const isActive = computed(() => ['running', 'paused-manual'].includes(rig.testRun.status) || rig.testRun.waitingManual != null)
const isRunning = computed(() => rig.testRun.status === 'running' || rig.testRun.waitingManual != null)

const STATUS_STYLE = {
  idle: 'bg-sunken text-ttext-secondary',
  running: 'bg-primary-soft text-primary-dark',
  passed: 'bg-success-soft text-success',
  failed: 'bg-critical-soft text-critical',
  aborted: 'bg-caution-soft text-[#7A5F14]'
}
const STEP_ICON = { pending: '○', running: '◐', done: '✓', pass: '✓', fail: '✕', skipped: '–' }
const STEP_COLOR = {
  pending: 'text-ttext-tertiary', running: 'text-primary',
  done: 'text-ttext-secondary', pass: 'text-success', fail: 'text-critical', skipped: 'text-ttext-tertiary'
}
const LOG_COLOR = { info: 'text-ttext-secondary', pass: 'text-success', fail: 'text-critical', warn: 'text-[#7A5F14]' }

function runBaseline() {
  const sequence = generateBaselineSequence(props.section)
  engine.run(sequence)
}
function abortRun() {
  engine.abort()
}

const waitingPoint = computed(() => (rig.testRun.waitingManual ? rig.pointById(rig.testRun.waitingManual.point) : null))

function submitManualNumeric() {
  const value = parseFloat(manualDraft.value)
  if (!Number.isNaN(value)) rig.setManualControllerValue(rig.testRun.waitingManual.point, value, wsSend)
  manualDraft.value = ''
}
function submitManualBool(val) {
  const field = rig.testRun.waitingManual.field
  if (field === 'confirmed') rig.confirmResponse(rig.testRun.waitingManual.point, val, wsSend)
  else rig.setManualControllerValue(rig.testRun.waitingManual.point, val, wsSend)
}

const recentLog = computed(() => rig.testRun.log.slice(-6))
</script>

<template>
  <div class="panel-card p-4">
    <div class="flex items-center justify-between mb-2">
      <div>
        <p class="font-mono text-[9px] text-ttext-tertiary tracking-widest">AUTOMATED TESTING</p>
        <p class="text-sm font-semibold">{{ rig.testRun.sequenceName || `No sequence run yet — ${section.label}` }}</p>
      </div>
      <span class="text-[9px] font-mono font-bold px-2.5 py-1 rounded-full" :class="STATUS_STYLE[rig.testRun.status] || STATUS_STYLE.idle">
        {{ rig.testRun.status.toUpperCase() }}
      </span>
    </div>

    <div class="h-1.5 rounded-full bg-sunken overflow-hidden mb-3">
      <div class="h-full bg-primary transition-all" :style="{ width: rig.testRun.progress + '%' }"></div>
    </div>

    <div class="flex gap-2 mb-3">
      <button
        class="flex-1 h-9 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40"
        :disabled="isActive"
        @click="runBaseline"
      >Run Baseline — {{ section.label }}</button>
      <button
        v-if="isActive"
        class="h-9 px-4 rounded-lg border border-critical text-critical text-sm font-medium"
        @click="abortRun"
      >Abort</button>
    </div>

    <!-- item #4: manual-entry pause, inline so the tester doesn't have to leave this panel -->
    <div v-if="rig.testRun.waitingManual" class="mb-3 p-3 rounded-lg bg-caution-soft border border-caution">
      <p class="text-xs font-semibold text-[#7A5F14] mb-2">⏸ {{ rig.testRun.waitingManual.title }}</p>
      <div v-if="rig.testRun.waitingManual.field === 'confirmed'" class="flex gap-2">
        <button class="flex-1 h-8 rounded-lg bg-success text-white text-xs font-medium" @click="submitManualBool(true)">Confirmed</button>
        <button class="flex-1 h-8 rounded-lg bg-critical text-white text-xs font-medium" @click="submitManualBool(false)">Not confirmed</button>
      </div>
      <div v-else-if="waitingPoint?.kind === 'digital'" class="flex gap-2">
        <button class="flex-1 h-8 rounded-lg bg-primary text-white text-xs font-medium" @click="submitManualBool(true)">CLOSED</button>
        <button class="flex-1 h-8 rounded-lg border border-borderstrong text-xs font-medium" @click="submitManualBool(false)">OPEN</button>
      </div>
      <div v-else class="flex gap-2">
        <input
          v-model="manualDraft" type="number" placeholder="Reading"
          class="flex-1 h-8 px-2 rounded-lg border border-border text-sm"
          @keyup.enter="submitManualNumeric"
        />
        <button class="h-8 px-3 rounded-lg bg-primary text-white text-xs font-medium" @click="submitManualNumeric">Submit</button>
      </div>
    </div>

    <!-- step list -->
    <div class="max-h-40 overflow-y-auto mb-3 divide-y divide-border">
      <div v-for="step in rig.testRun.steps" :key="step.id" class="flex items-center gap-2 py-1.5 text-xs">
        <span class="w-4 text-center font-bold" :class="STEP_COLOR[step.status]">{{ STEP_ICON[step.status] }}</span>
        <span :class="step.status === 'skipped' ? 'line-through text-ttext-tertiary' : ''">{{ step.title }}</span>
      </div>
      <p v-if="rig.testRun.steps.length === 0" class="text-center text-ttext-tertiary py-4">No steps yet — run the baseline sequence.</p>
    </div>

    <!-- log tail -->
    <div class="bg-ink rounded-lg p-2.5 font-mono text-[10px] leading-relaxed">
      <p v-for="(entry, i) in recentLog" :key="i" :class="LOG_COLOR[entry.level] || 'text-ttext-secondary'">
        {{ new Date(entry.ts).toLocaleTimeString() }} — {{ entry.text }}
      </p>
      <p v-if="recentLog.length === 0" class="text-ttext-tertiary opacity-50">Log will appear here once a sequence runs.</p>
    </div>
  </div>
</template>
