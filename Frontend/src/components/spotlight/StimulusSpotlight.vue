<script setup>
import { computed, inject, ref, nextTick } from 'vue'
import { useRigStore } from '../../stores/rig'
import { computeStatus, STATUS_COLOR } from '../../utils/statusEngine'
import AnalogLane from '../rack/AnalogLane.vue'
import DigitalLane from '../rack/DigitalLane.vue'
import TransferPlot from './TransferPlot.vue'

const props = defineProps({
  point: { type: Object, required: true } // role: 'stimulus', kind: 'analog' | 'digital'
})

const rig = useRigStore()
const wsSend = inject('wsSend')

const isDigital = computed(() => props.point.kind === 'digital')
const isConnected = computed(() => rig.connectionStatus === 'connected')

const status = computed(() => computeStatus(props.point))
const statusLabel = {
  pass: 'PASS',
  fail: 'FAIL',
  pending: 'NOT COMMANDED',
  'awaiting-manual': 'VERIFY PENDING'
}
const statusBg = {
  pass: 'bg-success-soft text-success',
  fail: 'bg-critical-soft text-critical',
  pending: 'bg-sunken text-ttext-secondary',
  'awaiting-manual': 'bg-caution-soft text-[#7A5F14]'
}

const sourceIsAuto = computed(() => typeof props.point.source === 'string' && props.point.source.startsWith('sequence:'))
const sourceLabel = computed(() => {
  if (!sourceIsAuto.value) return 'MANUAL'
  const [, seq] = props.point.source.split(':')
  return `AUTO · ${seq}`
})

// item D — only meaningful for analog stimulus points in this template;
// a digital point with a related response would need its own transfer view.
const relatedResponse = computed(() => {
  if (isDigital.value) return null
  const id = props.point.relatedPoints?.[0]
  return id ? rig.pointById(id) : null
})

// ---- analog: injection slider ----
const track = ref(null)
const min = computed(() => props.point.min ?? 0)
const max = computed(() => props.point.max ?? 100)
const target = computed(() => props.point.commandedValue ?? props.point.acceptableValue)
const percent = computed(() => {
  const v = props.point.commandedValue ?? min.value
  return Math.min(100, Math.max(0, ((v - min.value) / (max.value - min.value)) * 100))
})

function commandFromClientX(clientX) {
  if (!track.value) return
  const rect = track.value.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const value = Math.round(min.value + ratio * (max.value - min.value))
  rig.commandStimulus(props.point.id, value, wsSend, 'manual')
}
let dragging = false
function onPointerDown(e) { dragging = true; track.value.setPointerCapture(e.pointerId); commandFromClientX(e.clientX) }
function onPointerMove(e) { if (dragging) commandFromClientX(e.clientX) }
function onPointerUp() { dragging = false }
function setPreset(pct) {
  const value = Math.round(min.value + (pct / 100) * (max.value - min.value))
  rig.commandStimulus(props.point.id, value, wsSend, 'manual')
}

// exact-value entry — the slider/presets are fast but coarse; this is for
// commanding a precise figure, e.g. "483" rather than whatever 48% lands on
const commandDraft = ref('')
function setExactCommand() {
  const value = parseFloat(commandDraft.value)
  if (Number.isNaN(value)) return
  const clamped = Math.min(max.value, Math.max(min.value, value))
  rig.commandStimulus(props.point.id, clamped, wsSend, 'manual')
  commandDraft.value = ''
}

// ---- digital: command toggle ----
// Local state updates immediately (Pinia reactive) so the button highlights
// right away, giving instant tactile feedback. The WS send goes out in
// parallel — if the socket is closed _send() logs a warning but does not crash.
const cmdSent = ref(null)  // null | true | false — drives the green flash
function commandDigital(state) {
  // Always update local state first — UI must respond immediately.
  rig.commandStimulus(props.point.id, state, wsSend, 'manual')
  // Flash the tapped button green for 600 ms.
  cmdSent.value = state
  setTimeout(() => { cmdSent.value = null }, 600)
  if (!isConnected.value) {
    console.warn('[StimulusSpotlight] WS not connected — command applied locally only. Node-RED will not receive it.')
  }
}

// ---- shared: manual controller-display entry ----
const editingController = ref(false)
const controllerDraft = ref('')
function startEditController() {
  controllerDraft.value = props.point.controllerValue ?? ''
  editingController.value = true
}
function submitController() {
  const value = isDigital.value ? controllerDraft.value === 'true' : parseFloat(controllerDraft.value)
  if (isDigital.value || !Number.isNaN(value)) rig.setManualControllerValue(props.point.id, value, wsSend)
  editingController.value = false
}
function toggleControllerDigital() {
  rig.setManualControllerValue(props.point.id, !(props.point.controllerValue ?? false), wsSend)
}
</script>

<template>
  <div class="panel-card p-4">
    <div class="flex items-center justify-between mb-1">
      <p class="font-mono text-[9px] text-ttext-tertiary tracking-widest">SELECTED POINT</p>
      <span class="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary-dark">STIMULUS</span>
    </div>

    <div class="flex items-start justify-between mb-1">
      <div>
        <p class="text-base font-bold">{{ point.id }}</p>
        <p class="text-xs text-ttext-secondary">{{ point.label }}</p>
      </div>
      <span class="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full" :class="statusBg[status]">
        {{ statusLabel[status] }}
      </span>
    </div>

    <p class="font-mono text-[9px] text-ttext-tertiary mb-3">
      Terminal {{ point.terminal }}, GND · {{ isDigital ? 'digital' : point.unit }} channel
    </p>

    <!-- source badge -->
    <div class="flex items-center gap-2 h-6 px-2.5 rounded-full mb-3 w-fit"
         :class="sourceIsAuto ? 'bg-primary-soft' : 'bg-sunken'">
      <span class="w-1.5 h-1.5 rounded-full" :class="sourceIsAuto ? 'bg-primary' : 'bg-ttext-tertiary'"></span>
      <span class="font-mono text-[9px] font-semibold" :class="sourceIsAuto ? 'text-primary-dark' : 'text-ttext-secondary'">
        {{ sourceLabel }}
      </span>
    </div>

    <!-- ============ DIGITAL STIMULUS ============ -->
    <template v-if="isDigital">
      <p class="font-display font-bold text-2xl mb-2">
        {{ point.commandedValue == null ? '—' : (point.commandedValue ? 'CLOSED' : 'OPEN') }}
        <span class="text-sm text-ttext-tertiary ml-1">commanded</span>
      </p>

      <div class="h-10 mb-3 bg-surfacealt rounded-lg border border-border">
        <DigitalLane :history="rig.historyFor(point.id)" :status-color="STATUS_COLOR[status]" />
      </div>

      <div class="grid grid-cols-2 gap-2 mb-4">
        <!-- CLOSED button: solid primary when commanded; flashes bg-success on send -->
        <button
          class="h-10 rounded-lg text-sm font-medium transition-colors duration-150"
          :class="
            cmdSent === true        ? 'bg-success text-white scale-95' :
            point.commandedValue === true ? 'bg-primary text-white' :
            'border border-borderstrong hover:border-primary hover:text-primary'
          "
          @click="commandDigital(true)"
        >
          <span>{{ point.commandedValue === true ? '✔ CLOSED' : 'Command CLOSED' }}</span>
        </button>

        <!-- OPEN button: solid primary when commanded; flashes bg-success on send -->
        <button
          class="h-10 rounded-lg text-sm font-medium transition-colors duration-150"
          :class="
            cmdSent === false       ? 'bg-success text-white scale-95' :
            point.commandedValue === false ? 'bg-primary text-white' :
            'border border-borderstrong hover:border-primary hover:text-primary'
          "
          @click="commandDigital(false)"
        >
          <span>{{ point.commandedValue === false ? '✔ OPEN' : 'Command OPEN' }}</span>
        </button>
      </div>

      <!-- Warn tester if socket is not connected to Node-RED -->
      <p v-if="!isConnected" class="text-[10px] font-mono text-critical mb-2">
        ⚠ Not connected to Node-RED — command applied locally only
      </p>

      <div class="grid grid-cols-2 gap-2">
        <button
          class="text-left p-2.5 rounded-lg border"
          :class="point.controllerValue == null ? 'border-dashed border-borderstrong' : 'border-border bg-surfacealt'"
          @click="toggleControllerDigital"
        >
          <p class="font-mono text-[8px] text-ttext-secondary mb-1">CONTROLLER DISPLAY (manual)</p>
          <p class="text-sm font-semibold" :class="point.controllerValue == null ? 'text-ttext-tertiary' : 'text-ttext-primary'">
            {{ point.controllerValue == null ? '— tap to set' : (point.controllerValue ? 'CLOSED' : 'OPEN') }}
          </p>
        </button>
        <div class="p-2.5 rounded-lg border border-border bg-surfacealt">
          <p class="font-mono text-[8px] text-ttext-secondary mb-1">HMI / MODBUS READING</p>
          <p class="text-sm font-semibold">
            {{ point.hmiValue == null ? '—' : (point.hmiValue ? 'CLOSED' : 'OPEN') }}
            <span v-if="point.hmiValue != null" :style="{ color: STATUS_COLOR[status] }">●</span>
          </p>
        </div>
      </div>
    </template>

    <!-- ============ ANALOG STIMULUS ============ -->
    <template v-else>
      <p class="font-display font-bold text-2xl tabular-nums mb-0.5">
        {{ point.commandedValue ?? '—' }}<span class="text-sm text-ttext-tertiary ml-1">{{ point.unit }} commanded</span>
      </p>
      <p class="font-mono text-[10px] text-ttext-secondary mb-2">
        Acceptable {{ point.acceptableValue }} {{ point.unit }} · tolerance ±{{ point.tolerancePercent }}%
      </p>

      <div class="h-12 mb-3 bg-surfacealt rounded-lg border border-border">
        <AnalogLane
          :history="rig.historyFor(point.id)"
          :min="min" :max="max"
          :target="target"
          :tolerance-percent="point.tolerancePercent"
          role="stimulus"
          :status-color="STATUS_COLOR[status]"
        />
      </div>

      <div
        ref="track"
        class="relative h-6 flex items-center cursor-pointer touch-none mb-1.5"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      >
        <div class="absolute inset-x-0 h-1.5 rounded-full bg-sunken"></div>
        <div class="absolute h-1.5 rounded-full bg-primary" :style="{ width: percent + '%' }"></div>
        <div class="absolute w-4 h-4 rounded-full bg-white border-2 border-primary -translate-x-1/2" :style="{ left: percent + '%' }"></div>
      </div>
      <div class="flex justify-between font-mono text-[9px] text-ttext-tertiary mb-3">
        <span>{{ min }}</span><span>{{ Math.round((min + max) / 2) }}</span><span>{{ max }} {{ point.unit }}</span>
      </div>

      <div class="grid grid-cols-5 gap-1.5 mb-3">
        <button
          v-for="p in [0, 25, 50, 75, 100]" :key="p"
          class="h-7 rounded-full font-mono text-[10px] font-semibold border"
          :class="Math.round(percent) === p ? 'bg-primary-soft border-primary text-primary-dark' : 'border-border text-ttext-secondary'"
          @click="setPreset(p)"
        >{{ p }}%</button>
      </div>

      <div class="flex gap-1.5 mb-4">
        <input
          v-model="commandDraft"
          type="number"
          :min="min" :max="max"
          :placeholder="`Exact value (${min}–${max} ${point.unit})`"
          class="flex-1 h-9 px-3 rounded-lg border border-border text-sm font-mono bg-surfacealt"
          @keyup.enter="setExactCommand"
        />
        <button class="h-9 px-4 rounded-lg bg-primary text-white text-xs font-medium" @click="setExactCommand">
          Set
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          class="text-left p-2.5 rounded-lg border"
          :class="point.controllerValue == null ? 'border-dashed border-borderstrong' : 'border-border bg-surfacealt'"
          @click="startEditController"
        >
          <p class="font-mono text-[8px] text-ttext-secondary mb-1">CONTROLLER DISPLAY (manual)</p>
          <input
            v-if="editingController"
            v-model="controllerDraft"
            type="number"
            autofocus
            class="w-full text-sm font-semibold bg-transparent outline-none border-b border-primary"
            @click.stop
            @keyup.enter="submitController"
            @blur="submitController"
          />
          <p v-else class="text-sm font-semibold" :class="point.controllerValue == null ? 'text-ttext-tertiary' : 'text-ttext-primary'">
            {{ point.controllerValue != null ? `${point.controllerValue} ${point.unit}` : '— tap to enter' }}
          </p>
        </button>

        <div class="p-2.5 rounded-lg border border-border bg-surfacealt">
          <p class="font-mono text-[8px] text-ttext-secondary mb-1">HMI / MODBUS READING</p>
          <p class="text-sm font-semibold">
            {{ point.hmiValue != null ? `${point.hmiValue} ${point.unit}` : '—' }}
            <span v-if="point.hmiValue != null" :style="{ color: STATUS_COLOR[status] }">●</span>
          </p>
        </div>
      </div>
    </template>

    <!-- item D: live transfer function against the point this stimulus is expected to drive -->
    <div v-if="relatedResponse" class="mt-4 pt-4 border-t border-border">
      <TransferPlot
        :stimulus-point="point"
        :response-point="relatedResponse"
        :stimulus-history="rig.historyFor(point.id)"
        :response-history="rig.historyFor(relatedResponse.id)"
      />
    </div>
  </div>
</template>
