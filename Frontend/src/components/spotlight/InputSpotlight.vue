<script setup>
import { computed } from 'vue'
import { useRigStore } from '../../stores/rig'
import AnalogLane from '../rack/AnalogLane.vue'
import DigitalLane from '../rack/DigitalLane.vue'
import { exportSignal } from '../../utils/exportCsv'

// role: 'input' — the rig SENSES this signal (AI voltage / DI ON-OFF).
// Always-on live monitor, read-only: no injection control, no verification.
const props = defineProps({ point: { type: Object, required: true } })
const rig = useRigStore()
const INPUT_COLOR = '#C97C4B'

const isDigital = computed(() => props.point.kind === 'digital')
function exportThis() { exportSignal(props.point, rig.activeSectionId) }
function fmtV(v) { return v == null ? '—' : Number(v).toFixed(2) }
</script>

<template>
  <div class="panel-card p-5">
    <div class="flex items-center justify-between mb-2">
      <p class="font-mono text-xs text-ttext-tertiary tracking-widest">SELECTED CHANNEL</p>
      <div class="flex items-center gap-2">
        <button
          class="h-8 px-3 rounded-lg border border-border text-xs font-semibold text-ttext-secondary hover:border-copper hover:text-copper transition-colors"
          title="Export this signal as CSV"
          @click="exportThis"
        >⭳ Export</button>
        <span class="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-copper-soft text-copper">INPUT · RIG SENSES</span>
      </div>
    </div>

    <div class="mb-1">
      <p class="text-2xl font-bold">{{ point.id }}</p>
      <p class="text-base text-ttext-secondary">{{ point.label }}</p>
    </div>

    <p class="font-mono text-xs text-ttext-tertiary mb-4">
      Terminal {{ point.terminal }}, GND · {{ isDigital ? 'digital ON/OFF' : 'analog 0–10 V' }} channel
    </p>

    <!-- ============ ANALOG INPUT ============ -->
    <template v-if="!isDigital">
      <div class="flex items-baseline gap-2 mb-4">
        <span class="font-display font-bold text-5xl tabular-nums leading-none">{{ fmtV(point.hmiValue) }}</span>
        <span class="text-2xl font-semibold text-ttext-secondary">V</span>
        <span class="text-sm text-ttext-tertiary ml-1">sensed live</span>
      </div>

      <div class="h-20 mb-4 bg-surfacealt rounded-lg border border-border">
        <AnalogLane
          :history="rig.historyFor(point.id)"
          :min="point.min" :max="point.max"
          role="input"
          :trace-color="INPUT_COLOR"
          :show-target="false"
        />
      </div>

      <p class="text-sm text-ttext-secondary">
        Read-only — the rig continuously senses this channel. Nothing to command here.
      </p>
    </template>

    <!-- ============ DIGITAL INPUT ============ -->
    <template v-else>
      <div class="flex items-baseline gap-3 mb-3">
        <span
          class="px-4 py-2 rounded-xl font-display font-bold text-3xl"
          :class="point.hmiValue == null ? 'bg-sunken text-ttext-secondary'
                  : point.hmiValue ? 'bg-success-soft text-success' : 'bg-critical-soft text-critical'"
        >{{ point.hmiValue == null ? '—' : (point.hmiValue ? 'ON' : 'OFF') }}</span>
        <span class="text-sm text-ttext-tertiary">sensed live</span>
      </div>

      <div class="h-16 mb-4 bg-surfacealt rounded-lg border border-border">
        <DigitalLane :history="rig.historyFor(point.id)" :trace-color="INPUT_COLOR" />
      </div>

      <p class="text-sm text-ttext-secondary">
        Read-only — the rig senses this state from the field. It can't be driven from here.
      </p>
    </template>
  </div>
</template>
