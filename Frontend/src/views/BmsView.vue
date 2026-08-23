<script setup>
import { inject, computed, reactive } from 'vue'
import { useRigStore } from '../stores/rig'
import KpiCard from '../components/cards/KpiCard.vue'
import GaugeCard from '../components/cards/GaugeCard.vue'

// The Carel controller's own live values, read over RS485/Modbus by the ESP32
// and pushed here on the standard telemetry pipeline. Read-only sensors are
// shown for monitoring; setpoints (holding) and commands (coils) are writable.
const rig = useRigStore()
const wsSend = inject('wsSend')
const drafts = reactive({}) // in-progress setpoint edits, keyed by id

const val = (id) => rig.bmsValues[id]
const has = (id) => rig.bmsValues[id] !== undefined

function num(v, dp = 1) {
  if (v === undefined || v === null) return '—'
  const n = Number(v)
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(dp)
}
function pct(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
}

const groups = computed(() =>
  Object.fromEntries(rig.bmsGroups.map((g) => [g.name, g.points]))
)
const primary = computed(() => groups.value['Primary'] || [])
const outputs = computed(() => groups.value['Outputs'] || [])
const temps = computed(() => groups.value['Temperatures'] || [])
const status = computed(() => groups.value['Status'] || [])
const commands = computed(() => groups.value['Commands'] || [])
const setpoints = computed(() => groups.value['Setpoints'] || [])

const fans = computed(() =>
  [1, 2, 3, 4].map((n) => {
    const s = `0${n}`
    return { n, speed: val(`CAREL-SPEED-${s}`), curr: val(`CAREL-CURR-${s}`), volt: val(`CAREL-VOLT-${s}`), pwr: val(`CAREL-PWR-${s}`) }
  })
)

// ON=green normally, but ON on a fault line (fire/trip) is an alarm → red.
function statusClass(p) {
  if (!has(p.id)) return 'bg-sunken text-ttext-secondary'
  const on = !!val(p.id)
  const fault = /FIRE|TRIP/.test(p.id)
  if (fault) return on ? 'bg-critical-soft text-critical' : 'bg-success-soft text-success'
  return on ? 'bg-success-soft text-success' : 'bg-sunken text-ttext-secondary'
}
function coilOn(p) { return val(p.id) === true || val(p.id) === 1 }
function setCoil(p, state) { rig.sendBmsCommand(p.id, state, wsSend) }
function commitSetpoint(p) {
  const v = parseFloat(drafts[p.id])
  if (Number.isNaN(v)) return
  rig.sendBmsCommand(p.id, v, wsSend)
  drafts[p.id] = ''
}

const gaugeColors = { 'CAREL-FAN-OUT': '#4A5CFA', 'CAREL-CWV-OUT': '#0EA5A0', 'CAREL-FAD-OUT': '#C97C4B', 'CAREL-FAD-FBK': '#8B5CF6' }
</script>

<template>
  <div class="h-full overflow-y-auto scroll-thin pr-1 space-y-3">
    <!-- header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold leading-tight">Carel Controller · BMS</h2>
        <p class="font-mono text-xs text-ttext-tertiary">
          Modbus RTU / RS485 · {{ rig.bmsMap.meta.serial.baud }} 8N1 · {{ rig.bmsMap.points.length }} registers
        </p>
      </div>
      <span
        class="font-mono text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5"
        :class="rig.bmsStale ? 'bg-sunken text-ttext-secondary' : 'bg-success-soft text-success'"
      >
        <span class="w-2 h-2 rounded-full" :class="rig.bmsStale ? 'bg-ttext-tertiary' : 'bg-success pulse-dot'"></span>
        {{ rig.bmsStale ? 'NO DATA' : 'LIVE' }}
      </span>
    </div>

    <!-- primary sensor KPIs -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard v-for="p in primary" :key="p.id" :label="p.label" :value="num(p.value)" :unit="p.unit" />
    </div>

    <!-- modulating outputs as gauges + CW temps -->
    <div class="grid grid-cols-2 lg:grid-cols-6 gap-3">
      <GaugeCard
        v-for="p in outputs" :key="p.id"
        :label="p.label" :value="pct(p.value)" :display-value="has(p.id) ? num(p.value, 0) + '%' : '—'"
        :color="gaugeColors[p.id] || '#4A5CFA'"
      />
      <KpiCard v-for="p in temps" :key="p.id" :label="p.label" :value="num(p.value)" :unit="p.unit" />
    </div>

    <!-- fan bank table -->
    <section class="panel-card p-4">
      <p class="eyebrow mb-3">Fan Bank</p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm tabular-nums">
          <thead>
            <tr class="text-ttext-tertiary font-mono text-xs text-left">
              <th class="py-1 pr-2 font-medium">Fan</th>
              <th class="py-1 px-2 font-medium text-right">Speed %</th>
              <th class="py-1 px-2 font-medium text-right">Current A</th>
              <th class="py-1 px-2 font-medium text-right">Voltage V</th>
              <th class="py-1 pl-2 font-medium text-right">Power kW</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in fans" :key="f.n" class="border-t border-border">
              <td class="py-2 pr-2 font-semibold">Fan {{ f.n }}</td>
              <td class="py-2 px-2 text-right font-display">{{ num(f.speed, 0) }}</td>
              <td class="py-2 px-2 text-right font-display">{{ num(f.curr) }}</td>
              <td class="py-2 px-2 text-right font-display">{{ num(f.volt) }}</td>
              <td class="py-2 pl-2 text-right font-display">{{ num(f.pwr) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- status + commands side by side -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <section class="panel-card p-4">
        <p class="eyebrow mb-3">Status</p>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="p in status" :key="p.id"
            class="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
          >
            <span class="text-sm font-medium">{{ p.label }}</span>
            <span class="font-mono text-xs font-bold px-2 py-0.5 rounded-full" :class="statusClass(p)">
              {{ has(p.id) ? (val(p.id) ? 'ON' : 'OFF') : '—' }}
            </span>
          </div>
        </div>
      </section>

      <section class="panel-card p-4">
        <p class="eyebrow mb-3">Commands</p>
        <div class="space-y-2">
          <div v-for="p in commands" :key="p.id" class="flex items-center gap-2">
            <span class="text-sm font-medium flex-1">{{ p.label }}</span>
            <span
              class="font-mono text-xs font-bold px-2 py-0.5 rounded-full"
              :class="coilOn(p) ? 'bg-success-soft text-success' : 'bg-sunken text-ttext-secondary'"
            >{{ has(p.id) ? (coilOn(p) ? 'ON' : 'OFF') : '—' }}</span>
            <button
              class="h-8 px-3 rounded-lg text-xs font-bold border-2"
              :class="coilOn(p) ? 'bg-success text-white border-success' : 'border-border text-ttext-secondary hover:border-success hover:text-success'"
              @click="setCoil(p, true)"
            >ON</button>
            <button
              class="h-8 px-3 rounded-lg text-xs font-bold border-2"
              :class="!coilOn(p) && has(p.id) ? 'bg-critical text-white border-critical' : 'border-border text-ttext-secondary hover:border-critical hover:text-critical'"
              @click="setCoil(p, false)"
            >OFF</button>
          </div>
        </div>
      </section>
    </div>

    <!-- setpoints & limits -->
    <section class="panel-card p-4">
      <p class="eyebrow mb-3">Setpoints &amp; Limits</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <div v-for="p in setpoints" :key="p.id" class="flex items-center gap-2 border-b border-border py-1.5">
          <span class="text-sm font-medium flex-1 truncate">{{ p.label }}</span>
          <span class="font-display font-semibold text-base tabular-nums w-16 text-right">{{ num(p.value) }}<span class="text-xs text-ttext-tertiary ml-0.5">{{ p.unit }}</span></span>
          <input
            v-model="drafts[p.id]" type="number" step="0.1" :placeholder="p.unit || ''"
            class="w-20 h-8 px-2 rounded-lg border-2 border-border text-sm font-mono bg-surface"
            @keyup.enter="commitSetpoint(p)"
          />
          <button class="h-8 px-3 rounded-lg bg-primary text-white text-xs font-bold" @click="commitSetpoint(p)">Set</button>
        </div>
      </div>
    </section>

    <p class="font-mono text-[11px] text-ttext-tertiary">
      Analog values are scaled in firmware (carelScale, default ÷10) and shown as received. If a reading is off by 10×
      vs the controller's front panel, correct carelScale in 00_Config.ino for that point.
    </p>
  </div>
</template>
