<script setup>
import { inject, ref, computed, watch } from 'vue'
import { useRigStore } from '../stores/rig'
import { exportSectionReport } from '../utils/exportCsv'
import TopNav from '../components/TopNav.vue'
import SignalRack from '../components/rack/SignalRack.vue'
import AddIoPanel from '../components/io/AddIoPanel.vue'
import StimulusSpotlight from '../components/spotlight/StimulusSpotlight.vue'
import ResponseSpotlight from '../components/spotlight/ResponseSpotlight.vue'
import TestRunnerPanel from '../components/automation/TestRunnerPanel.vue'
import AlertPanel from '../components/alerts/AlertPanel.vue'

const rig = useRigStore()
const wsSend = inject('wsSend')

const panelMode = ref('spotlight') // 'spotlight' | 'add' | 'automation'

const activePoints = computed(() => rig.pointsInSection(rig.activeSectionId))
const summary = computed(() => rig.sectionSummary(rig.activeSectionId))

function onSelectSection(id) {
  rig.selectSection(id)
  panelMode.value = 'spotlight'
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
function onExport() {
  exportSectionReport(rig.activeSection)
}

// a running/paused sequence is worth surfacing even if the tester wanders off to another tab
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
      :simulation-on="rig.simulationOn"
      :pass-percent="rig.overallSummary.percent"
      @select-section="onSelectSection"
      @toggle-simulation="rig.toggleSimulation(wsSend)"
      @release-all="rig.releaseAllOutputs(wsSend)"
    />

    <main class="flex-1 min-h-0 grid grid-cols-12 grid-rows-[minmax(0,1fr)] gap-3 p-3 overflow-hidden">
      <!-- signal rack: stacked lanes, grouped by module — scrolls internally, own scrollbar -->
      <div class="col-span-12 lg:col-span-8 min-h-0 h-full overflow-hidden">
        <SignalRack :points="activePoints" :selected-id="rig.selectedPointId" @select="onSelectPoint" @remove="onRemovePoint" />
      </div>

      <!-- spotlight / add / automation -->
      <div class="col-span-12 lg:col-span-4 min-h-0 h-full flex flex-col gap-3 overflow-y-auto scroll-thin">
        <div class="flex rounded-full bg-sunken p-0.5 font-mono text-[10px] font-semibold self-end">
          <button class="px-2.5 py-1 rounded-full" :class="panelMode === 'spotlight' ? 'bg-white shadow-sm' : 'text-ttext-secondary'" @click="panelMode = 'spotlight'">Spotlight</button>
          <button class="px-2.5 py-1 rounded-full" :class="panelMode === 'add' ? 'bg-white shadow-sm' : 'text-ttext-secondary'" @click="panelMode = 'add'">+ Add I/O</button>
          <button class="px-2.5 py-1 rounded-full" :class="panelMode === 'automation' ? 'bg-white text-primary-dark shadow-sm' : 'text-ttext-secondary'" @click="panelMode = 'automation'">
            Automation
            <span v-if="rig.testRun.waitingManual" class="ml-1 w-1.5 h-1.5 rounded-full bg-caution inline-block"></span>
          </button>
        </div>

        <AddIoPanel v-if="panelMode === 'add'" @save="onAddPoint" @cancel="panelMode = 'spotlight'" />

        <TestRunnerPanel v-else-if="panelMode === 'automation'" :section="rig.activeSection" />

        <template v-else-if="rig.selectedPoint">
          <StimulusSpotlight v-if="rig.selectedPoint.role === 'stimulus'" :point="rig.selectedPoint" />
          <ResponseSpotlight v-else :point="rig.selectedPoint" />
        </template>

        <div v-else class="panel-card p-6 text-center text-sm text-ttext-tertiary">
          No point selected — tap a lane in the signal rack.
        </div>

        <AlertPanel :alarms="rig.alarms" />
      </div>
    </main>

    <!-- footer -->
    <footer class="h-11 flex items-center justify-between px-4 border-t border-border bg-surface font-mono text-xs">
      <span>{{ rig.activeSectionId }}: <b>{{ summary.passed }}/{{ summary.total }}</b> verified</span>
      <span class="text-critical">{{ summary.failed }} fail</span>
      <span class="text-ttext-tertiary">{{ summary.pending }} pending</span>
      <div class="w-48 h-1.5 rounded-full bg-sunken overflow-hidden">
        <div class="h-full bg-primary" :style="{ width: summary.percent + '%' }"></div>
      </div>
      <button class="h-7 px-3 rounded-lg bg-primary text-white text-xs font-medium" @click="onExport">
        Export {{ rig.activeSectionId }} Report
      </button>
    </footer>
  </div>
</template>
