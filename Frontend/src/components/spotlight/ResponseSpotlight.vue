<script setup>
import { computed, inject } from 'vue'
import { useRigStore } from '../../stores/rig'
import { computeStatus, STATUS_COLOR } from '../../utils/statusEngine'
import AnalogLane from '../rack/AnalogLane.vue'
import DigitalLane from '../rack/DigitalLane.vue'
import TransferPlot from './TransferPlot.vue'

const props = defineProps({ point: { type: Object, required: true } })
const rig = useRigStore()
const wsSend = inject('wsSend')

const status = computed(() => computeStatus(props.point))
const statusBg = {
  pass: 'bg-success-soft text-success',
  fail: 'bg-critical-soft text-critical',
  pending: 'bg-sunken text-ttext-secondary',
  'awaiting-manual': 'bg-caution-soft text-[#7A5F14]'
}
const statusLabel = { pass: 'PASS', fail: 'FAIL', pending: 'PENDING', 'awaiting-manual': 'VERIFY PENDING' }

// item D from the response side — find whichever stimulus is declared to drive this point
const drivingStimulus = computed(() => rig.drivingStimulusFor(props.point.id))
</script>

<template>
  <div class="panel-card p-4">
    <div class="flex items-center justify-between mb-1">
      <p class="font-mono text-[9px] text-ttext-tertiary tracking-widest">SELECTED POINT</p>
      <span class="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-copper-soft text-copper">RESPONSE</span>
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
    <p class="font-mono text-[9px] text-ttext-tertiary mb-3">Terminal {{ point.terminal }}, GND · read back from UUT</p>

    <template v-if="point.kind === 'analog'">
      <p class="font-display font-bold text-2xl tabular-nums mb-1">
        {{ point.hmiValue ?? '—' }}<span class="text-sm text-ttext-tertiary ml-1">{{ point.unit }}</span>
      </p>
      <p class="font-mono text-[10px] text-ttext-secondary mb-2">
        Acceptable {{ point.acceptableValue }} {{ point.unit }} · tolerance ±{{ point.tolerancePercent }}%
      </p>

      <div class="h-12 mb-3 bg-surfacealt rounded-lg border border-border">
        <AnalogLane
          :history="rig.historyFor(point.id)"
          :min="point.min" :max="point.max"
          :target="point.acceptableValue"
          :tolerance-percent="point.tolerancePercent"
          role="response"
          :status-color="STATUS_COLOR[status]"
        />
      </div>

      <p class="text-xs text-ttext-tertiary italic mb-1">
        No injection control — this value is driven by the controller in response to a stimulus point.
      </p>
    </template>

    <template v-else>
      <div class="h-10 mb-3 bg-surfacealt rounded-lg border border-border">
        <DigitalLane :history="rig.historyFor(point.id)" :status-color="STATUS_COLOR[status]" />
      </div>
      <p class="text-sm text-ttext-secondary mb-3">
        No feedback contact wired for this relay — confirm visually or by listening for the contactor.
      </p>
      <div class="flex gap-2">
        <button
          class="flex-1 h-10 rounded-lg text-sm font-medium"
          :class="point.confirmed === true ? 'bg-success text-white' : 'border border-borderstrong'"
          @click="rig.confirmResponse(point.id, true, wsSend)"
        >Confirmed ON</button>
        <button
          class="flex-1 h-10 rounded-lg text-sm font-medium"
          :class="point.confirmed === false ? 'bg-critical text-white' : 'border border-borderstrong'"
          @click="rig.confirmResponse(point.id, false, wsSend)"
        >Not confirmed</button>
      </div>
    </template>

    <!-- item D from the response side -->
    <div v-if="drivingStimulus && point.kind === 'analog'" class="mt-4 pt-4 border-t border-border">
      <TransferPlot
        :stimulus-point="drivingStimulus"
        :response-point="point"
        :stimulus-history="rig.historyFor(drivingStimulus.id)"
        :response-history="rig.historyFor(point.id)"
      />
    </div>
  </div>
</template>
