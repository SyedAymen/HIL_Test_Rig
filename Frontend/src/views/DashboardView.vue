<script setup>
import { inject, ref, computed, watch } from 'vue'
import { useRigStore } from '../stores/rig'
import TopNav from '../components/TopNav.vue'
import SignalRack from '../components/rack/SignalRack.vue'
import AddIoPanel from '../components/io/AddIoPanel.vue'
import OutputSpotlight from '../components/spotlight/OutputSpotlight.vue'
import InputSpotlight from '../components/spotlight/InputSpotlight.vue'
import TestRunnerPanel from '../components/automation/TestRunnerPanel.vue'
import AlertPanel from '../components/alerts/AlertPanel.vue'
import BmsView from './BmsView.vue'
import AutoTestView from './AutoTestView.vue'

const rig = useRigStore()
const wsSend = inject('wsSend')

const panelMode = ref('spotlight') // 'spotlight' | 'add' | 'automation'
const bmsActive = ref(false)       // BMS tab shows the Carel Modbus view
const testActive = ref(false)      // Test tab runs the 18-signal auto/manual sequence

const activePoints = computed(() => rig.pointsInSection(rig.activeSectionId))
const activeSection = computed(() => rig.activeSection)

function onSelectSection(id) {
  bmsActive.value = false
  testActive.value = false
  rig.selectSection(id)
  panelMode.value = 'spotlight'
}
function onSelectBms() {
  bmsActive.value = true
  testActive.value = false
}
function onSelectTest() {
  testActive.value = true
  bmsActive.value = false
}
function onSelectPoint(id) {
  rig.selectPoint(id)
  panelMode.value = 'spotlight'
}
function onAddPoint(point) {
  rig.addPoint(rig.activeSectionId, point, wsSend)
  panelMode.value = 'spotlight'
}
function onRemovePoint(id) {
  rig.removePoint(rig.activeSectionId, id, wsSend)
}

// a running/paused sequence is always worth surfacing
watch(() => rig.testRun.waitingManual, (w) => {
  if (w) panelMode.value = 'automation'
})
</script>

<template>
  <div class="h-screen overflow-hidden flex flex-col bg-bg">
    <TopNav
      :status="rig.connectionStatus"
      :sections="rig.sections"
      :active-section-id="rig.activeSectionId"
      :bms-active="bmsActive"
      :test-active="testActive"
      :simulation-on="rig.simulationOn"
      :pass-percent="rig.overallSummary.percent"
      @select-section="onSelectSection"
      @select-bms="onSelectBms"
      @select-test="onSelectTest"
      @toggle-simulation="rig.toggleSimulation(wsSend)"
      @release-all="rig.releaseAllOutputs(wsSend)"
    />

    <!-- Test tab: 18-signal auto/manual test sequence -->
    <main v-if="testActive" class="flex-1 min-h-0 p-3 overflow-hidden">
      <AutoTestView />
    </main>

    <!-- BMS tab: full-width Carel Modbus monitoring -->
    <main v-else-if="bmsActive" class="flex-1 min-h-0 p-3 overflow-hidden">
      <BmsView />
    </main>

    <main v-else class="flex-1 min-h-0 grid grid-cols-12 grid-rows-[minmax(0,1fr)] gap-3 p-3 overflow-hidden">
      <!-- signal rack: stacked lanes, grouped by module -->
      <div class="col-span-12 lg:col-span-7 min-h-0 h-full overflow-hidden">
        <SignalRack :points="activePoints" :selected-id="rig.selectedPointId" @select="onSelectPoint" @remove="onRemovePoint" />
      </div>

      <!-- spotlight / add / automation -->
      <div class="col-span-12 lg:col-span-5 min-h-0 h-full flex flex-col gap-3 overflow-y-auto scroll-thin">
        <div class="flex rounded-full bg-sunken p-1 font-mono text-xs font-semibold self-end">
          <button class="px-3 py-1.5 rounded-full" :class="panelMode === 'spotlight' ? 'bg-white shadow-sm' : 'text-ttext-secondary'" @click="panelMode = 'spotlight'">Spotlight</button>
          <button class="px-3 py-1.5 rounded-full" :class="panelMode === 'add' ? 'bg-white shadow-sm' : 'text-ttext-secondary'" @click="panelMode = 'add'">+ Add I/O</button>
          <button
            class="px-3 py-1.5 rounded-full" :class="panelMode === 'automation' ? 'bg-white text-primary-dark shadow-sm' : 'text-ttext-secondary'"
            @click="panelMode = 'automation'"
          >
            Automation
            <span v-if="rig.testRun.waitingManual" class="ml-1 w-1.5 h-1.5 rounded-full bg-caution inline-block"></span>
          </button>
        </div>

        <AddIoPanel v-if="panelMode === 'add'" :section-id="rig.activeSectionId" @save="onAddPoint" @cancel="panelMode = 'spotlight'" />

        <TestRunnerPanel v-else-if="panelMode === 'automation'" :section="activeSection" />

        <template v-else-if="rig.selectedPoint">
          <OutputSpotlight v-if="rig.selectedPoint.role === 'output'" :point="rig.selectedPoint" />
          <InputSpotlight v-else :point="rig.selectedPoint" />
        </template>

        <div v-else class="panel-card p-6 text-center text-base text-ttext-tertiary">
          No channel selected — tap a lane in the signal rack.
        </div>

        <AlertPanel :alarms="rig.alarms" />
      </div>
    </main>
  </div>
</template>
