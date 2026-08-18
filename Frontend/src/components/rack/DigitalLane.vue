<script setup>
import { computed } from 'vue'

const props = defineProps({
  history: { type: Array, default: () => [] },
  traceColor: { type: String, default: '#4A5CFA' },
  compact: { type: Boolean, default: false }
})

const HIGH = 9
const LOW = 31

function yFor(v) {
  return v ? HIGH : LOW
}

const stepPath = computed(() => {
  const samples = props.history.filter((s) => s.hmiValue != null)
  if (samples.length === 0) return null
  const n = props.history.length
  const xFor = (s) => (props.history.indexOf(s) / (n - 1)) * 100

  let d = `M${xFor(samples[0]).toFixed(1)},${yFor(samples[0].hmiValue)}`
  for (let i = 1; i < samples.length; i++) {
    const x = xFor(samples[i]).toFixed(1)
    const prevY = yFor(samples[i - 1].hmiValue)
    const y = yFor(samples[i].hmiValue)
    d += ` L${x},${prevY} L${x},${y}`
  }
  // extend the last known state to the right edge
  d += ` L100,${yFor(samples[samples.length - 1].hmiValue)}`
  return d
})

const lastState = computed(() => {
  const last = [...props.history].reverse().find((s) => s.hmiValue != null)
  return last ? last.hmiValue : null
})
</script>

<template>
  <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="w-full h-full">
    <line x1="0" :y1="HIGH" x2="100" :y2="HIGH" stroke="#ECEEF4" stroke-width="0.5" />
    <line x1="0" :y1="LOW" x2="100" :y2="LOW" stroke="#ECEEF4" stroke-width="0.5" />
    <path v-if="stepPath" :d="stepPath" fill="none" :stroke="traceColor" :stroke-width="compact ? 1.4 : 1.8" vector-effect="non-scaling-stroke" />
    <text v-if="!compact" x="1" y="7" font-size="5" fill="#BBBFCF" font-family="monospace">1</text>
    <text v-if="!compact" x="1" y="37" font-size="5" fill="#BBBFCF" font-family="monospace">0</text>
    <circle v-if="lastState !== null" cx="100" :cy="yFor(lastState)" r="1.8" :fill="traceColor" />
  </svg>
</template>
