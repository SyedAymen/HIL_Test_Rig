<script setup>
import ConnectionStatus from './ConnectionStatus.vue'

defineProps({
  status: { type: String, required: true },
  sections: { type: Array, required: true },   // [{ id, label }] — any length
  activeSectionId: { type: String, required: true },
  simulationOn: { type: Boolean, required: true },
  passPercent: { type: Number, default: 0 }
})
defineEmits(['select-section', 'toggle-simulation', 'release-all'])
</script>

<template>
  <header class="h-11 flex items-center justify-between px-4 border-b border-border bg-surface gap-4 overflow-x-auto">
    <div class="flex items-center gap-5 shrink-0">
      <span class="font-mono text-[9px] text-ttext-tertiary tracking-widest hidden lg:inline">HIL SIMULATION</span>
      <nav class="flex items-center gap-4 font-mono text-xs">
        <button
          v-for="s in sections" :key="s.id"
          class="uppercase pb-1 -mb-px whitespace-nowrap"
          :class="s.id === activeSectionId ? 'text-primary-dark border-b-2 border-primary font-bold' : 'text-ttext-tertiary'"
          @click="$emit('select-section', s.id)"
        >{{ s.id }}</button>
      </nav>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <button
        class="h-6 px-2.5 rounded-full flex items-center gap-1.5 font-mono text-[9px] font-bold"
        :class="simulationOn ? 'bg-success-soft text-success' : 'bg-sunken text-ttext-secondary'"
        @click="$emit('toggle-simulation')"
      >
        <span class="relative w-2 h-2">
          <span class="absolute inset-0 rounded-full" :class="simulationOn ? 'bg-success' : 'bg-ttext-tertiary'"></span>
          <span v-if="simulationOn" class="absolute inset-0 rounded-full bg-success pulse-dot"></span>
        </span>
        SIM {{ simulationOn ? 'ON' : 'OFF' }}
      </button>

      <button
        class="h-6 px-2.5 rounded-lg border border-warning text-warning font-mono text-[9px] font-bold whitespace-nowrap"
        @click="$emit('release-all')"
      >
        Release All Outputs
      </button>

      <ConnectionStatus :status="status" />

      <span class="h-6 px-2.5 rounded-full bg-success-soft text-success font-mono text-[9px] font-bold flex items-center whitespace-nowrap">
        {{ passPercent }}% Passed
      </span>
    </div>
  </header>
</template>
