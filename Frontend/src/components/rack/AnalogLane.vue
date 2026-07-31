<script setup>
import { computed } from 'vue'

const props = defineProps({
  history: { type: Array, default: () => [] },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  target: { type: Number, default: null },       // commandedValue ?? acceptableValue
  tolerancePercent: { type: Number, default: 5 },
  role: { type: String, default: 'stimulus' },     // controls whether the dashed "commanded" trace shows
  statusColor: { type: String, default: '#4A5CFA' },
  compact: { type: Boolean, default: false }
})

const H = 40 // fixed viewBox height in "chart units" — actual pixel height set by the container via CSS

function normalize(v) {
  if (v == null) return null
  const span = props.max - props.min || 1
  const y = H - ((v - props.min) / span) * H
  return Math.min(H, Math.max(0, y))
}

function pathFor(key) {
  const samples = props.history.filter((s) => s[key] != null)
  if (samples.length < 2) return null
  const n = props.history.length
  return samples
    .map((s) => {
      const i = props.history.indexOf(s)
      const x = (i / (n - 1)) * 100
      const y = normalize(s[key])
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .reduce((acc, pt, idx) => acc + (idx === 0 ? `M${pt}` : ` L${pt}`), '')
}

const hmiPath = computed(() => pathFor('hmiValue'))
const commandedPath = computed(() => (props.role === 'stimulus' ? pathFor('commandedValue') : null))

const band = computed(() => {
  if (props.target == null) return null
  const tol = Math.max(Math.abs(props.target) * (props.tolerancePercent / 100), 0.0001)
  const top = normalize(props.target + tol)
  const bottom = normalize(props.target - tol)
  return { y: Math.min(top, bottom), height: Math.abs(bottom - top) }
})

const lastPoint = computed(() => {
  const last = [...props.history].reverse().find((s) => s.hmiValue != null)
  if (!last) return null
  return { x: 100, y: normalize(last.hmiValue) }
})
</script>

<template>
  <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="w-full h-full">
    <rect v-if="band" x="0" :y="band.y" width="100" :height="band.height" fill="#1FB871" opacity="0.12" />
    <path v-if="commandedPath" :d="commandedPath" fill="none" stroke="#4A5CFA" stroke-width="1" stroke-dasharray="2 2" opacity="0.6" vector-effect="non-scaling-stroke" />
    <path v-if="hmiPath" :d="hmiPath" fill="none" :stroke="statusColor" :stroke-width="compact ? 1.2 : 1.6" vector-effect="non-scaling-stroke" />
    <circle v-if="lastPoint" :cx="lastPoint.x" :cy="lastPoint.y" r="1.8" :fill="statusColor" />
  </svg>
</template>
