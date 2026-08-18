<script setup>
import { computed, inject, ref } from 'vue'
import { useRigStore } from '../../stores/rig'
import AnalogLane from '../rack/AnalogLane.vue'
import DigitalLane from '../rack/DigitalLane.vue'
import { exportSignal } from '../../utils/exportCsv'

// role: 'output' — the rig PRODUCES this signal (AO voltage / DO ON-OFF).
const props = defineProps({
  point: { type: Object, required: true }
})

const rig = useRigStore()
const wsSend = inject('wsSend')

const isDigital = computed(() => props.point.kind === 'digital')
const isConnected = computed(() => rig.connectionStatus === 'connected')
const OUTPUT_COLOR = '#4A5CFA'

// Per-signal CSV export for the selected channel.
function exportThis() { exportSignal(props.point, rig.activeSectionId) }

// ---- analog: injection slider (mechanically unchanged, now raw voltage) ----
const track = ref(null)
const min = computed(() => props.point.min ?? 0)
const max = computed(() => props.point.max ?? 10)
const percent = computed(() => {
  const v = props.point.commandedValue ?? min.value
  return Math.min(100, Math.max(0, ((v - min.value) / (max.value - min.value)) * 100))
})
function round1(v) { return Math.round(v * 10) / 10 }
function fmtV(v) { return v == null ? '—' : Number(v).toFixed(2) }

function commandFromClientX(clientX) {
  if (!track.value) return
  const rect = track.value.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const value = round1(min.value + ratio * (max.value - min.value))
  rig.setOutput(props.point.id, value, wsSend, 'manual')
}
let dragging = false
function onPointerDown(e) { dragging = true; track.value.setPointerCapture(e.pointerId); commandFromClientX(e.clientX) }
function onPointerMove(e) { if (dragging) commandFromClientX(e.clientX) }
function onPointerUp() { dragging = false }
function setPreset(pct) {
  const value = round1(min.value + (pct / 100) * (max.value - min.value))
  rig.setOutput(props.point.id, value, wsSend, 'manual')
}

const commandDraft = ref('')
function setExactCommand() {
  const value = parseFloat(commandDraft.value)
  if (Number.isNaN(value)) return
  const clamped = Math.min(max.value, Math.max(min.value, value))
  rig.setOutput(props.point.id, clamped, wsSend, 'manual')
  commandDraft.value = ''
}

// ---- digital: settable ON/OFF ----
const cmdSent = ref(null)  // null | true | false — drives the flash
function commandDigital(state) {
  rig.setOutput(props.point.id, state, wsSend, 'manual')
  cmdSent.value = state
  setTimeout(() => { cmdSent.value = null }, 600)
  if (!isConnected.value) {
    console.warn('[OutputSpotlight] WS not connected — output applied locally only.')
  }
}
</script>

<template>
  <div class="panel-card p-5">
    <div class="flex items-center justify-between mb-2">
      <p class="font-mono text-xs text-ttext-tertiary tracking-widest">SELECTED CHANNEL</p>
      <div class="flex items-center gap-2">
        <button
          class="h-8 px-3 rounded-lg border border-border text-xs font-semibold text-ttext-secondary hover:border-primary hover:text-primary transition-colors"
          title="Export this signal as CSV"
          @click="exportThis"
        >⭳ Export</button>
        <span class="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-primary-soft text-primary-dark">OUTPUT · RIG DRIVES</span>
      </div>
    </div>

    <div class="mb-1">
      <p class="text-2xl font-bold">{{ point.id }}</p>
      <p class="text-base text-ttext-secondary">{{ point.label }}</p>
    </div>

    <p class="font-mono text-xs text-ttext-tertiary mb-4">
      Terminal {{ point.terminal }}, GND · {{ isDigital ? 'digital ON/OFF' : 'analog 0–10 V' }} channel
    </p>

    <!-- ============ DIGITAL OUTPUT ============ -->
    <template v-if="isDigital">
      <div class="flex items-baseline gap-3 mb-3">
        <span
          class="px-4 py-2 rounded-xl font-display font-bold text-3xl"
          :class="point.commandedValue == null ? 'bg-sunken text-ttext-secondary'
                  : point.commandedValue ? 'bg-success-soft text-success' : 'bg-critical-soft text-critical'"
        >{{ point.commandedValue == null ? '—' : (point.commandedValue ? 'ON' : 'OFF') }}</span>
        <span class="text-sm text-ttext-tertiary">set value</span>
      </div>

      <div class="h-12 mb-4 bg-surfacealt rounded-lg border border-border">
        <DigitalLane :history="rig.historyFor(point.id)" :trace-color="OUTPUT_COLOR" />
      </div>

      <div class="grid grid-cols-2 gap-3 mb-2">
        <button
          class="h-14 rounded-xl text-lg font-semibold transition-colors duration-150"
          :class="
            cmdSent === true              ? 'bg-success text-white scale-95' :
            point.commandedValue === true ? 'bg-success text-white' :
            'border-2 border-borderstrong text-ttext-primary hover:border-success hover:text-success'
          "
          @click="commandDigital(true)"
        >{{ point.commandedValue === true ? '✔ ON' : 'Set ON' }}</button>

        <button
          class="h-14 rounded-xl text-lg font-semibold transition-colors duration-150"
          :class="
            cmdSent === false              ? 'bg-critical text-white scale-95' :
            point.commandedValue === false ? 'bg-critical text-white' :
            'border-2 border-borderstrong text-ttext-primary hover:border-critical hover:text-critical'
          "
          @click="commandDigital(false)"
        >{{ point.commandedValue === false ? '✔ OFF' : 'Set OFF' }}</button>
      </div>

      <p v-if="!isConnected" class="text-xs font-mono text-critical mt-2">
        ⚠ Not connected to Node-RED — output applied locally only
      </p>
    </template>

    <!-- ============ ANALOG OUTPUT ============ -->
    <template v-else>
      <div class="flex items-baseline gap-2 mb-4">
        <span class="font-display font-bold text-5xl tabular-nums leading-none">{{ fmtV(point.commandedValue) }}</span>
        <span class="text-2xl font-semibold text-ttext-secondary">V</span>
        <span class="text-sm text-ttext-tertiary ml-1">set value</span>
      </div>

      <div class="h-16 mb-4 bg-surfacealt rounded-lg border border-border">
        <AnalogLane
          :history="rig.historyFor(point.id)"
          :min="min" :max="max"
          role="output"
          :trace-color="OUTPUT_COLOR"
          :show-target="false"
        />
      </div>

      <!-- slider -->
      <div
        ref="track"
        class="relative h-11 flex items-center cursor-pointer touch-none mb-1"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      >
        <div class="absolute inset-x-0 h-2 rounded-full bg-sunken"></div>
        <div class="absolute h-2 rounded-full bg-primary" :style="{ width: percent + '%' }"></div>
        <div class="absolute w-6 h-6 rounded-full bg-white border-2 border-primary shadow-sm -translate-x-1/2" :style="{ left: percent + '%' }"></div>
      </div>
      <div class="flex justify-between font-mono text-xs text-ttext-tertiary mb-4">
        <span>0 V</span><span>5 V</span><span>10 V</span>
      </div>

      <div class="grid grid-cols-5 gap-2 mb-4">
        <button
          v-for="pct in [0, 25, 50, 75, 100]" :key="pct"
          class="h-11 rounded-xl font-mono text-sm font-semibold border-2"
          :class="Math.round(percent) === pct ? 'bg-primary-soft border-primary text-primary-dark' : 'border-border text-ttext-secondary'"
          @click="setPreset(pct)"
        >{{ pct }}%</button>
      </div>

      <div class="flex gap-2">
        <input
          v-model="commandDraft"
          type="number" step="0.01"
          :min="min" :max="max"
          placeholder="Exact voltage (0–10 V)"
          class="flex-1 h-11 px-3 rounded-xl border-2 border-border text-base font-mono bg-surfacealt"
          @keyup.enter="setExactCommand"
        />
        <button class="h-11 px-5 rounded-xl bg-primary text-white text-base font-semibold" @click="setExactCommand">Set</button>
      </div>
    </template>
  </div>
</template>
