<script setup>
// Shows a signal's description (the control-scheme label) as the heading, with
// its rig channel id and the I/O-list columns (From/To, level, range, setpoint,
// purpose, alarm) beneath — so the tester sees exactly what the sheet specifies.
const props = defineProps({ point: { type: Object, required: true } })

const dash = (v) => (v == null || v === '' || v === '—' ? '—' : v)
</script>

<template>
  <div class="mb-3">
    <div class="flex items-start justify-between gap-2">
      <p class="text-xl font-bold leading-tight">{{ point.label }}</p>
      <span class="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-sunken text-ttext-secondary shrink-0">
        {{ point.id }}<template v-if="point.sNo"> · S{{ point.sNo }}</template>
      </span>
    </div>

    <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-ttext-secondary">
      <div class="flex justify-between gap-2"><span class="text-ttext-tertiary">From</span><span class="truncate text-right">{{ dash(point.from) }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-ttext-tertiary">To</span><span class="truncate text-right">{{ dash(point.to) }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-ttext-tertiary">Signal</span><span class="text-right">{{ dash(point.signalLevel) }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-ttext-tertiary">Ctrl I/O</span><span class="text-right">{{ dash(point.ctrlType) }} → rig {{ point.role === 'output' ? 'AO/DO' : 'AI/DI' }}</span></div>
      <div v-if="point.kind === 'analog'" class="flex justify-between gap-2"><span class="text-ttext-tertiary">Range</span><span class="text-right">{{ dash(point.rangeText) }} {{ point.engUnit !== '—' ? point.engUnit : '' }}</span></div>
      <div v-if="point.kind === 'analog'" class="flex justify-between gap-2"><span class="text-ttext-tertiary">Set point</span><span class="text-right">{{ dash(point.setpoint) }} {{ point.setpoint !== '—' && point.engUnit !== '—' ? point.engUnit : '' }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-ttext-tertiary">Purpose</span><span class="truncate text-right">{{ dash(point.purpose) }}</span></div>
      <div class="flex justify-between gap-2"><span class="text-ttext-tertiary">Alarm</span><span class="text-right">{{ point.alarm ? 'Yes' : 'No' }}</span></div>
    </div>
  </div>
</template>
