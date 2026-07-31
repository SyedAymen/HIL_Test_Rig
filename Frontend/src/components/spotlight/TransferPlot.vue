<script setup>
import { computed } from 'vue'
import { computeStatus, STATUS_COLOR } from '../../utils/statusEngine'

const props = defineProps({
  stimulusPoint: { type: Object, required: true },
  responsePoint: { type: Object, required: true },
  stimulusHistory: { type: Array, default: () => [] },
  responseHistory: { type: Array, default: () => [] }
})

const sMin = computed(() => props.stimulusPoint.min ?? 0)
const sMax = computed(() => props.stimulusPoint.max ?? 100)
const rMin = computed(() => props.responsePoint.min ?? 0)
const rMax = computed(() => props.responsePoint.max ?? 100)

function nx(v) {
  const span = sMax.value - sMin.value || 1
  return ((v - sMin.value) / span) * 100
}
function ny(v) {
  const span = rMax.value - rMin.value || 1
  return 100 - ((v - rMin.value) / span) * 100
}

// pair samples by recency-aligned index — both histories tick together under
// the demo simulator / a synchronized Node-RED sample loop. If your backend
// samples asynchronously, pair by nearest timestamp instead.
const pairs = computed(() => {
  const n = Math.min(props.stimulusHistory.length, props.responseHistory.length)
  const sTail = props.stimulusHistory.slice(-n)
  const rTail = props.responseHistory.slice(-n)
  const out = []
  for (let i = 0; i < n; i++) {
    const xVal = sTail[i].commandedValue ?? sTail[i].hmiValue
    const yVal = rTail[i].hmiValue
    if (xVal != null && yVal != null) out.push({ x: nx(xVal), y: ny(yVal) })
  }
  return out
})

const tracePath = computed(() => {
  if (pairs.value.length < 2) return null
  return pairs.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
})

const current = computed(() => pairs.value[pairs.value.length - 1] || null)
const status = computed(() => computeStatus(props.responsePoint))
const dotColor = computed(() => STATUS_COLOR[status.value])
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <p class="font-mono text-[9px] text-ttext-tertiary tracking-widest">TRANSFER FUNCTION</p>
      <div class="flex items-center gap-3 font-mono text-[8.5px] text-ttext-tertiary">
        <span class="flex items-center gap-1"><span class="inline-block w-3 border-t border-dashed border-borderstrong"></span>Ideal</span>
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" :style="{ background: dotColor }"></span>Live</span>
      </div>
    </div>

    <div class="relative bg-surfacealt rounded-lg border border-border p-2">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full aspect-square">
        <!-- ideal proportional reference -->
        <line x1="0" y1="100" x2="100" y2="0" stroke="#D6D9E5" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
        <!-- live trace -->
        <path v-if="tracePath" :d="tracePath" fill="none" stroke="#4A5CFA" stroke-width="1.2" opacity="0.55" vector-effect="non-scaling-stroke" />
        <circle v-if="current" :cx="current.x" :cy="current.y" r="2.4" :fill="dotColor" stroke="#fff" stroke-width="0.6" />
      </svg>

      <div class="flex justify-between font-mono text-[8px] text-ttext-tertiary mt-1">
        <span>{{ stimulusPoint.id }} {{ sMin }}{{ stimulusPoint.unit }}</span>
        <span>{{ sMax }}{{ stimulusPoint.unit }}</span>
      </div>
    </div>

    <p class="font-mono text-[8.5px] text-ttext-tertiary mt-1.5">
      y = {{ responsePoint.id }} [{{ rMin }}–{{ rMax }}{{ responsePoint.unit }}] ·
      dot on the dashed line = response tracking stimulus proportionally
    </p>
  </div>
</template>
