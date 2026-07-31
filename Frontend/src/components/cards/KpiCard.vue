<script setup>
const props = defineProps({
  label: { type: String, required: true },
  value: { type: [Number, String], required: true },
  unit: { type: String, default: '' },
  delta: { type: Number, default: null } // positive/negative %, null hides the chip
})

const deltaClass = () => {
  if (props.delta === null) return ''
  return props.delta >= 0 ? 'bg-primary-soft text-primary-dark' : 'bg-warning-soft text-warning'
}
</script>

<template>
  <div class="panel-card p-4">
    <p class="eyebrow mb-2 truncate">{{ label }}</p>
    <div class="flex items-end justify-between">
      <p class="font-display font-semibold text-2xl tabular-nums">
        {{ value }}<span class="text-sm text-ttext-tertiary ml-0.5">{{ unit }}</span>
      </p>
      <span
        v-if="delta !== null"
        class="text-xs font-mono px-2 py-1 rounded-md"
        :class="deltaClass()"
      >
        {{ delta >= 0 ? '+' : '' }}{{ delta }}%
      </span>
    </div>
  </div>
</template>
