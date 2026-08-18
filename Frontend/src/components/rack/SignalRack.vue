<script setup>
import { computed, ref } from 'vue'
import { useRigStore } from '../../stores/rig'
import { groupByModule } from '../../utils/moduleParser'
import { computeStatus, STATUS_COLOR } from '../../utils/statusEngine'
import AnalogLane from './AnalogLane.vue'
import DigitalLane from './DigitalLane.vue'

const props = defineProps({
  points: { type: Array, required: true }, // full channel list for the active section — any length
  selectedId: { type: String, default: null }
})
const emit = defineEmits(['select', 'remove'])

const rig = useRigStore()

const roleFilter = ref('all')     // 'all' | 'output' | 'input'
const statusFilter = ref('all')   // verification only
const compact = ref(false)        // dense mode
const collapsed = ref(new Set())  // collapsed module names

// Directional palette — the rig produces (output, blue) vs senses (input, copper).
const ROLE_COLOR = { output: '#4A5CFA', input: '#C97C4B' }
const verify = computed(() => rig.verificationEnabled)

const filteredPoints = computed(() =>
  props.points.filter((p) => {
    if (roleFilter.value !== 'all' && p.role !== roleFilter.value) return false
    if (verify.value && statusFilter.value !== 'all') {
      const s = computeStatus(p)
      const bucket = s === 'awaiting-manual' ? 'pending' : s
      if (bucket !== statusFilter.value) return false
    }
    return true
  })
)

const groups = computed(() => groupByModule(filteredPoints.value))

function toggleModule(name) {
  const next = new Set(collapsed.value)
  next.has(name) ? next.delete(name) : next.add(name)
  collapsed.value = next
}

function jumpTo(id) {
  emit('select', id)
}

// Trace color: status-based only when verifying, otherwise the directional color.
function traceColor(p) {
  return verify.value ? STATUS_COLOR[computeStatus(p)] : ROLE_COLOR[p.role]
}

// The number/state that matters for this channel: outputs show what the rig is
// driving out (set value), inputs show what the rig is sensing.
function analogValue(p) {
  return p.role === 'output' ? p.commandedValue : p.hmiValue
}
function digitalState(p) {
  return p.role === 'output' ? p.commandedValue : p.hmiValue
}
function fmtV(v) {
  return v == null ? '—' : Number(v).toFixed(2)
}
</script>

<template>
  <div class="panel-card flex flex-col h-full min-h-0">
    <!-- header + filters -->
    <div class="flex items-center justify-between mb-2 flex-wrap gap-2 px-4 pt-4">
      <div>
        <p class="text-base font-semibold">Signal Rack</p>
        <p class="font-mono text-xs text-ttext-tertiary tracking-wide">LIVE TRACES · GROUPED BY MODULE</p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex rounded-full bg-sunken p-1 font-mono text-xs font-semibold">
          <button class="px-3 py-1.5 rounded-full" :class="roleFilter === 'all' ? 'bg-white shadow-sm' : 'text-ttext-secondary'" @click="roleFilter = 'all'">All</button>
          <button class="px-3 py-1.5 rounded-full" :class="roleFilter === 'output' ? 'bg-white text-primary-dark shadow-sm' : 'text-ttext-secondary'" @click="roleFilter = 'output'">Output</button>
          <button class="px-3 py-1.5 rounded-full" :class="roleFilter === 'input' ? 'bg-white text-copper shadow-sm' : 'text-ttext-secondary'" @click="roleFilter = 'input'">Input</button>
        </div>
        <div v-if="verify" class="flex rounded-full bg-sunken p-1 font-mono text-xs font-semibold">
          <button class="px-3 py-1.5 rounded-full" :class="statusFilter === 'all' ? 'bg-white shadow-sm' : 'text-ttext-secondary'" @click="statusFilter = 'all'">All</button>
          <button class="px-3 py-1.5 rounded-full" :class="statusFilter === 'fail' ? 'bg-white text-critical shadow-sm' : 'text-ttext-secondary'" @click="statusFilter = 'fail'">Fail</button>
          <button class="px-3 py-1.5 rounded-full" :class="statusFilter === 'pending' ? 'bg-white text-[#7A5F14] shadow-sm' : 'text-ttext-secondary'" @click="statusFilter = 'pending'">Pending</button>
        </div>
        <button
          class="h-8 px-3 rounded-full font-mono text-xs font-semibold border"
          :class="compact ? 'bg-primary text-white border-primary' : 'border-border text-ttext-secondary'"
          @click="compact = !compact"
        >{{ compact ? 'Dense' : 'Full' }}</button>
      </div>
    </div>

    <!-- scrollable lanes area -->
    <div class="flex-1 min-h-0 overflow-y-auto rack-scroll px-4">
      <div v-for="group in groups" :key="group.module" class="mb-2">
        <button class="w-full flex items-center gap-2 py-2 sticky top-0 bg-surface z-10" @click="toggleModule(group.module)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#878C9F" stroke-width="3"
               :style="{ transform: collapsed.has(group.module) ? 'rotate(-90deg)' : 'none' }">
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span class="font-mono text-xs font-bold text-ttext-secondary tracking-wide">{{ group.module }}</span>
          <span class="font-mono text-xs text-ttext-tertiary">({{ group.points.length }})</span>
          <span class="flex-1 border-t border-border"></span>
        </button>

        <div v-show="!collapsed.has(group.module)">
          <div
            v-for="p in group.points" :key="p.id"
            class="flex items-center gap-3 border-b border-border last:border-0 cursor-pointer"
            :class="[compact ? 'py-2' : 'py-3', { 'bg-primary-soft/40 -mx-1 px-1 rounded': p.id === selectedId }]"
            @click="jumpTo(p.id)"
          >
            <!-- identity -->
            <div class="w-32 shrink-0 min-w-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full border-2 flex-none" :style="{ borderColor: ROLE_COLOR[p.role] }"></span>
                <span class="text-sm font-semibold truncate" :class="{ 'text-primary-dark': p.id === selectedId }">{{ p.id }}</span>
              </div>
              <p class="font-mono text-xs text-ttext-tertiary truncate pl-4">{{ p.terminal }}</p>
            </div>

            <!-- trace -->
            <div class="flex-1 min-w-0" :class="compact ? 'h-6' : 'h-10'">
              <DigitalLane
                v-if="p.kind === 'digital'"
                :history="rig.historyFor(p.id)"
                :trace-color="traceColor(p)"
                :compact="compact"
              />
              <AnalogLane
                v-else
                :history="rig.historyFor(p.id)"
                :min="p.min" :max="p.max"
                :target="verify ? (p.commandedValue ?? p.acceptableValue) : null"
                :tolerance-percent="p.tolerancePercent"
                :role="p.role"
                :trace-color="traceColor(p)"
                :show-target="verify"
                :compact="compact"
              />
            </div>

            <!-- current value -->
            <div class="w-24 shrink-0 flex items-center justify-end gap-2">
              <!-- digital: green/red pill -->
              <span
                v-if="p.kind === 'digital'"
                class="px-2.5 py-1 rounded-full font-mono text-xs font-bold"
                :class="digitalState(p) == null ? 'bg-sunken text-ttext-secondary'
                        : digitalState(p) ? 'bg-success-soft text-success' : 'bg-critical-soft text-critical'"
              >{{ digitalState(p) == null ? '—' : (digitalState(p) ? 'ON' : 'OFF') }}</span>
              <!-- analog: raw voltage -->
              <p v-else class="font-mono text-sm font-semibold tabular-nums">
                {{ fmtV(analogValue(p)) }}<span class="text-ttext-tertiary font-normal ml-0.5">V</span>
              </p>
              <button class="text-ttext-tertiary hover:text-critical p-1 -mr-1" title="Remove" @click.stop="emit('remove', p.id)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <p v-if="filteredPoints.length === 0" class="text-center text-sm text-ttext-tertiary py-8">
        No channels match this filter.
      </p>
    </div>

    <!-- legend footer -->
    <div class="flex flex-wrap gap-4 px-4 py-2.5 mt-1 border-t border-border font-mono text-xs text-ttext-secondary shrink-0">
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full border-2 border-primary"></span>Output (rig drives)</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full border-2 border-copper"></span>Input (rig senses)</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-success"></span>ON</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-critical"></span>OFF</span>
    </div>
  </div>
</template>
