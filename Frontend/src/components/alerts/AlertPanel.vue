<script setup>
defineProps({
  alarms: { type: Array, required: true } // { id, severity: 'warning'|'critical', title, detail, ts }
})

const severityColor = { warning: 'bg-warning', critical: 'bg-critical', caution: 'bg-caution' }
</script>

<template>
  <div class="panel-card overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 border-b border-border">
      <p class="text-sm font-semibold">Equipment problems <span class="text-ttext-secondary font-normal">({{ alarms.length }})</span></p>
    </div>

    <div v-if="alarms.length === 0" class="px-4 py-6 text-center text-xs text-ttext-tertiary">
      No active alarms
    </div>

    <div v-else class="divide-y divide-border max-h-56 overflow-y-auto">
      <div v-for="a in alarms" :key="a.id" class="flex items-start gap-3 px-4 py-3">
        <span class="w-5 h-5 rounded-full grid place-items-center flex-none mt-0.5" :class="severityColor[a.severity] || 'bg-borderstrong'">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </span>
        <div>
          <p class="text-sm font-medium">{{ a.title }}</p>
          <p class="text-xs text-ttext-tertiary font-mono mt-0.5">{{ new Date(a.ts).toLocaleTimeString() }}</p>
          <p v-if="a.detail" class="text-sm text-ttext-secondary mt-1 leading-relaxed">{{ a.detail }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
