<script setup>
import { inject, ref, computed, watch } from 'vue'
import { useRigStore } from '../stores/rig'
import { exportSnapshot } from '../utils/exportCsv'
import TopNav from '../components/TopNav.vue'
import SignalRack from '../components/rack/SignalRack.vue'
import AddIoPanel from '../components/io/AddIoPanel.vue'
import OutputSpotlight from '../components/spotlight/OutputSpotlight.vue'
import InputSpotlight from '../components/spotlight/InputSpotlight.vue'
import TestRunnerPanel from '../components/automation/TestRunnerPanel.vue'
import AlertPanel from '../components/alerts/AlertPanel.vue'

const rig = useRigStore()
const wsSend = inject('wsSend')

const panelMode = ref('spotlight') // 'spotlight' | 'add' | 'automation'

const activePoints = computed(() => rig.pointsInSection(rig.activeSectionId))
const activeSection = computed(() => rig.activeSection)

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
function onExportSnapshot() {
  exportSnapshot(rig.testPlan)
}

// a running/paused sequence is worth surfacing — but only while verification is on
watch(() => rig.testRun.waitingManual, (w) => {
  if (w && rig.verificationEnabled) panelMode.value = 'automation'
})
</script>

<template>
  <div class="h-screen overflow-hidden flex flex-col bg-bg">
    <TopNav
      :status="rig.connectionStatus"
      :sections="rig.sections"
      :active-section-id="rig.activeSectionId"
      :simulation-on="rig.simulationOn"
      :verification-enabled="rig.verificationEnabled"
      :pass-percent="rig.overallSummary.percent"
      @select-section="onSelectSection"
      @toggle-simulation="rig.toggleSimulation(wsSend)"
      @release-all="rig.releaseAllOutputs(wsSend)"
      @export-snapshot="onExportSnapshot"
    />

    <main class="flex-1 min-h-0 grid grid-cols-12 grid-rows-[minmax(0,1fr)] gap-3 p-3 overflow-hidden">
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
            v-if="rig.verificationEnabled"
            class="px-3 py-1.5 rounded-full" :class="panelMode === 'automation' ? 'bg-white text-primary-dark shadow-sm' : 'text-ttext-secondary'"
            @click="panelMode = 'automation'"
          >
            Automation
            <span v-if="rig.testRun.waitingManual" class="ml-1 w-1.5 h-1.5 rounded-full bg-caution inline-block"></span>
          </button>
        </div>

        <AddIoPanel v-if="panelMode === 'add'" :section-id="rig.activeSectionId" @save="onAddPoint" @cancel="panelMode = 'spotlight'" />

        <TestRunnerPanel v-else-if="panelMode === 'automation' && rig.verificationEnabled" :section="activeSection" />

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

    <!-- footer: channel counts only (no pass/fail while verification is disabled) -->
    <footer class="h-11 flex items-center gap-6 px-4 border-t border-border bg-surface font-mono text-sm">
      <span>{{ rig.activeSectionId }} · <b>{{ activeSection?.label }}</b></span>
      <span class="text-ttext-secondary">{{ activePoints.length }} channels</span>
      <span class="text-ttext-tertiary hidden sm:inline">Voltages are raw 0–10 V · verification disabled (no UUT link)</span>
    </footer>
  </div>
</template>
