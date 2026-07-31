<script setup>
import { computed, ref } from 'vue'
import { useRigStore } from '../../stores/rig'
import { groupByModule } from '../../utils/moduleParser'
import { computeStatus, STATUS_COLOR } from '../../utils/statusEngine'
import AnalogLane from './AnalogLane.vue'
import DigitalLane from './DigitalLane.vue'

const props = defineProps({
  points: { type: Array, required: true }, // full point list for the active section — any length
  selectedId: { type: String, default: null }
})
const emit = defineEmits(['select', 'remove'])

const rig = useRigStore()

const roleFilter = ref('all')     // 'all' | 'stimulus' | 'response'
const statusFilter = ref('all')   // 'all' | 'pass' | 'fail' | 'pending'
const compact = ref(false)        // item E — dense mode
const collapsed = ref(new Set())  // collapsed module names

const ROLE_COLOR = { stimulus: '#4A5CFA', response: '#C97C4B' }

const filteredPoints = computed(() =>
  props.points.filter((p) => {
    if (roleFilter.value !== 'all' && p.role !== roleFilter.value) return false
    if (statusFilter.value !== 'all') {
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

// find which stimulus (if any) drives a given response, for the cross-reference badge
function drivingStimulusId(pointId) {
  return rig.drivingStimulusFor(pointId)?.id ?? null
}
</script>

<template>
  <div class="panel-card flex flex-col h-full min-h-0">
    <!-- header + filters -->
    <div class="flex items-center justify-between mb-2 flex-wrap gap-2 px-4 pt-4">
      <div>
        <p class="text-sm font-semibold">Signal Rack</p>
        <p class="font-mono text-[9px] text-ttext-tertiary tracking-wide">LIVE TRACES · GROUPED BY MODULE</p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex rounded-full bg-sunken p-0.5 font-mono text-[9px] font-semibold">
          <button class="px-2 py-1 rounded-full" :class="roleFilter === 'all' ? 'bg-white shadow-sm' : 'text-ttext-secondary'" @click="roleFilter = 'all'">All</button>
          <button class="px-2 py-1 rounded-full" :class="roleFilter === 'stimulus' ? 'bg-white text-primary-dark shadow-sm' : 'text-ttext-secondary'" @click="roleFilter = 'stimulus'">Stim</button>
          <button class="px-2 py-1 rounded-full" :class="roleFilter === 'response' ? 'bg-white text-copper shadow-sm' : 'text-ttext-secondary'" @click="roleFilter = 'response'">Resp</button>
        </div>
        <div class="flex rounded-full bg-sunken p-0.5 font-mono text-[9px] font-semibold">
          <button class="px-2 py-1 rounded-full" :class="statusFilter === 'all' ? 'bg-white shadow-sm' : 'text-ttext-secondary'" @click="statusFilter = 'all'">All</button>
          <button class="px-2 py-1 rounded-full" :class="statusFilter === 'fail' ? 'bg-white text-critical shadow-sm' : 'text-ttext-secondary'" @click="statusFilter = 'fail'">Fail</button>
          <button class="px-2 py-1 rounded-full" :class="statusFilter === 'pending' ? 'bg-white text-[#7A5F14] shadow-sm' : 'text-ttext-secondary'" @click="statusFilter = 'pending'">Pending</button>
        </div>
        <button
          class="h-6 px-2.5 rounded-full font-mono text-[9px] font-semibold border"
          :class="compact ? 'bg-primary text-white border-primary' : 'border-border text-ttext-secondary'"
          @click="compact = !compact"
        >{{ compact ? 'Dense' : 'Full' }}</button>
      </div>
    </div>

    <!-- scrollable lanes area — min-h-0 prevents flex overflow, rack-scroll gives a visible bar -->
    <div class="flex-1 min-h-0 overflow-y-auto rack-scroll px-4">
      <div v-for="group in groups" :key="group.module" class="mb-2">
        <button class="w-full flex items-center gap-2 py-1.5 sticky top-0 bg-surface z-10" @click="toggleModule(group.module)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#878C9F" stroke-width="3"
               :style="{ transform: collapsed.has(group.module) ? 'rotate(-90deg)' : 'none' }">
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span class="font-mono text-[10px] font-bold text-ttext-secondary tracking-wide">{{ group.module }}</span>
          <span class="font-mono text-[9px] text-ttext-tertiary">({{ group.points.length }})</span>
          <span class="flex-1 border-t border-border"></span>
        </button>

        <div v-show="!collapsed.has(group.module)">
          <div
            v-for="p in group.points" :key="p.id"
            class="flex items-center gap-2 py-1.5 border-b border-border last:border-0 cursor-pointer"
            :class="{ 'bg-primary-soft/40 -mx-1 px-1 rounded': p.id === selectedId }"
            @click="jumpTo(p.id)"
          >
            <!-- identity -->
            <div class="w-28 shrink-0 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full border-2 flex-none" :style="{ borderColor: ROLE_COLOR[p.role] }"></span>
                <span class="text-xs font-semibold truncate" :class="{ 'text-primary-dark': p.id === selectedId }">{{ p.id }}</span>
              </div>
              <p class="font-mono text-[8px] text-ttext-tertiary truncate">{{ p.terminal }}</p>
            </div>

            <!-- trace -->
            <div class="flex-1 min-w-0" :class="compact ? 'h-4' : 'h-9'">
              <DigitalLane
                v-if="p.kind === 'digital'"
                :history="rig.historyFor(p.id)"
                :status-color="STATUS_COLOR[computeStatus(p)]"
                :compact="compact"
              />
              <AnalogLane
                v-else
                :history="rig.historyFor(p.id)"
                :min="p.min" :max="p.max"
                :target="p.commandedValue ?? p.acceptableValue"
                :tolerance-percent="p.tolerancePercent"
                :role="p.role"
                :status-color="STATUS_COLOR[computeStatus(p)]"
                :compact="compact"
              />
            </div>

            <!-- current value + cross-reference -->
            <div class="w-24 shrink-0 text-right">
              <div class="flex items-center justify-end gap-1.5">
                <p class="font-mono text-xs font-semibold tabular-nums">
                  {{ p.kind === 'digital' ? (p.hmiValue == null ? '—' : (p.hmiValue ? 'HIGH' : 'LOW')) : (p.hmiValue ?? '—') }}
                  <span v-if="p.kind !== 'digital'" class="text-ttext-tertiary font-normal">{{ p.unit }}</span>
                </p>
                <button class="text-ttext-tertiary hover:text-critical" title="Remove" @click.stop="emit('remove', p.id)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  </svg>
                </button>
              </div>
              <button
                v-if="p.relatedPoints?.length"
                class="font-mono text-[8px] text-primary-dark"
                @click.stop="jumpTo(p.relatedPoints[0])"
              >↳ drives {{ p.relatedPoints[0] }}</button>
              <button
                v-else-if="drivingStimulusId(p.id)"
                class="font-mono text-[8px] text-copper"
                @click.stop="jumpTo(drivingStimulusId(p.id))"
              >↲ from {{ drivingStimulusId(p.id) }}</button>
            </div>
          </div>
        </div>
      </div>

      <p v-if="filteredPoints.length === 0" class="text-center text-xs text-ttext-tertiary py-8">
        No points match this filter.
      </p>
    </div>

    <!-- legend footer -->
    <div class="flex flex-wrap gap-4 px-4 py-2 mt-1 border-t border-border font-mono text-[9px] text-ttext-secondary shrink-0">
      <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full border-2 border-primary"></span>Stimulus</span>
      <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full border-2 border-copper"></span>Response</span>
      <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-success"></span>Pass</span>
      <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-critical"></span>Fail</span>
      <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-caution"></span>Awaiting manual</span>
    </div>
  </div>
</template>
