<script setup>
import ConnectionStatus from './ConnectionStatus.vue'

defineProps({
  status: { type: String, required: true },
  sections: { type: Array, required: true },   // [{ id, label }] — any length
  activeSectionId: { type: String, required: true },
  simulationOn: { type: Boolean, required: true },
  verificationEnabled: { type: Boolean, default: false },
  passPercent: { type: Number, default: 0 }
})
defineEmits(['select-section', 'toggle-simulation', 'release-all', 'export-snapshot'])
</script>

<template>
  <header class="h-14 flex items-center justify-between px-4 border-b border-border bg-surface gap-4 overflow-x-auto">
    <div class="flex items-center gap-5 shrink-0">
      <span class="font-mono text-xs text-ttext-tertiary tracking-widest hidden lg:inline">HIL SIMULATION</span>
      <nav class="flex items-center gap-4 font-mono text-sm">
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
        class="h-9 px-3 rounded-full flex items-center gap-1.5 font-mono text-xs font-bold"
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
        class="h-9 px-3 rounded-lg border border-warning text-warning font-mono text-xs font-bold whitespace-nowrap"
        @click="$emit('release-all')"
      >Release All Outputs</button>

      <!-- one-click raw snapshot of every channel -->
      <button
        class="h-9 px-3 rounded-lg bg-primary text-white font-mono text-xs font-bold whitespace-nowrap"
        @click="$emit('export-snapshot')"
      >Export Snapshot</button>

      <ConnectionStatus :status="status" />

      <span
        v-if="verificationEnabled"
        class="h-9 px-3 rounded-full bg-success-soft text-success font-mono text-xs font-bold flex items-center whitespace-nowrap"
      >{{ passPercent }}% Passed</span>
    </div>
  </header>
</template>
