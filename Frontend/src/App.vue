<script setup>
import { provide, watch } from 'vue'
import { useWebSocket } from './composables/useWebSocket'
import { useDemoSimulator } from './composables/useDemoSimulator'
import { useRigStore } from './stores/rig'
import DashboardView from './views/DashboardView.vue'

const rig = useRigStore()

// WS URL resolution order:
//   1. VITE_WS_URL env var (set in .env.local for dev or .env.production for prod)
//   2. Same-origin /ws/dashboard (correct when the Vue dist is served by Node-RED itself)
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${location.host}/ws/dashboard`

const { status, send } = useWebSocket(WS_URL, (msg) => rig.handleMessage(msg))

// Mirror WS status into the store so ConnectionStatus.vue renders correctly.
watch(status, (s) => {
  rig.connectionStatus = s
  // On (re)connect, ask Node-RED to push the current test plan and sim state
  // so a freshly-loaded or reconnected dashboard immediately reconciles.
  // Node-RED handles this via the 'io.list' type in the ws-router function node.
  if (s === 'connected') {
    send({ type: 'io.list', payload: null, ts: Date.now() })
  }
}, { immediate: true })

// child components call inject('wsSend')(...) instead of importing the composable directly —
// keeps them decoupled from transport details and easy to unit-test with a stub.
provide('wsSend', send)

// DEMO ONLY — feeds the signal rack with plausible live data (including a real
// simulated transfer function between DPT-2 and EC-FAN) so it's not empty
// while developing without hardware.
//
// Set VITE_DEMO_SIMULATOR=false in .env.local once Node-RED is streaming real
// telemetry over the socket above, and delete this composable once you are
// confident the live pipeline covers all points.
const demoEnabled = import.meta.env.VITE_DEMO_SIMULATOR !== 'false'
useDemoSimulator(rig, { enabled: demoEnabled })
</script>

<template>
  <DashboardView />
</template>
