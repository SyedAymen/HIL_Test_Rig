<script setup>
defineProps({
  status: { type: String, required: true } // 'connected' | 'connecting' | 'disconnected'
})

const colorMap = {
  connected: 'bg-success',
  connecting: 'bg-caution',
  disconnected: 'bg-critical'
}
const labelMap = {
  connected: 'Node-RED · WSS',
  connecting: 'Connecting…',
  disconnected: 'Disconnected'
}
</script>

<template>
  <div class="flex items-center gap-1.5 font-mono text-xs text-ttext-primary">
    <span class="relative w-2 h-2">
      <span class="absolute inset-0 rounded-full" :class="colorMap[status]"></span>
      <span
        v-if="status !== 'disconnected'"
        class="absolute inset-0 rounded-full pulse-dot"
        :class="colorMap[status]"
      ></span>
    </span>
    {{ labelMap[status] }}
  </div>
</template>
