<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: Number, required: true }, // 0–100
  displayValue: { type: String, required: true }, // pre-formatted, e.g. "0 trips" or "98.5%"
  color: { type: String, default: '#4A5CFA' }
})

// Deliberately hand-rolled instead of pulling in D3: this component re-renders
// on every telemetry tick, and letting D3 touch the same DOM Vue owns invites
// bugs. Plain trig + a computed path keeps it fully reactive and dependency-free.
const R = 80
const CX = 100
const CY = 90

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

const trackPath = describeArc(CX, CY, R, -90, 90)
const valuePath = computed(() => {
  const clamped = Math.max(0, Math.min(100, props.value))
  const endAngle = -90 + (clamped / 100) * 180
  return describeArc(CX, CY, R, -90, endAngle)
})
const knobPos = computed(() => {
  const clamped = Math.max(0, Math.min(100, props.value))
  const angle = -90 + (clamped / 100) * 180
  return polarToCartesian(CX, CY, R, angle)
})
</script>

<template>
  <div class="panel-card p-4">
    <p class="text-sm font-semibold mb-1">{{ label }}</p>
    <p class="font-display font-semibold text-xl tabular-nums mb-1">{{ displayValue }}</p>
    <svg viewBox="0 0 200 100" class="w-full h-20">
      <path :d="trackPath" fill="none" stroke="#ECEEF4" stroke-width="12" stroke-linecap="round" />
      <path :d="valuePath" fill="none" :stroke="color" stroke-width="12" stroke-linecap="round" />
      <circle :cx="knobPos.x" :cy="knobPos.y" r="6" :fill="color" stroke="white" stroke-width="1.5" />
    </svg>
  </div>
</template>
