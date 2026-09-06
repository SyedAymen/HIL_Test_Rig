<script setup>
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useRigStore } from '../stores/rig'
import { inject as vueInject } from 'vue'
import { signalTests, testById } from '../data/signalTestPlan'
import { createTestRunner, engToVolts, fmt, summarise } from '../engine/autoTestEngine'
import { exportTestReport } from '../utils/exportTestCsv'

const rig = useRigStore()
const wsSend = vueInject('wsSend')

const mode = ref('auto')            // 'auto' | 'manual'
const running = ref(false)
const results = ref([])
const log = ref([])
const current = ref(null)
const progress = reactive({ index: 0, total: signalTests.length })
let runner = null

const summary = computed(() => summarise(results.value))
const resultById = computed(() => Object.fromEntries(results.value.map((r) => [r.id, r])))

// Hardware is the ONLY source of truth — there is no simulated controller.
// The software simulates the RIG SIDE ONLY: it generates and injects the test
// stimulus. Every judgement value is read back from the ESP32 / Carel bus.
const linkUp = computed(() => rig.connectionStatus === 'connected')
const busLive = computed(() => !rig.bmsStale)
const canRun = computed(() => linkUp.value && busLive.value)

function liveAdapter() {
  return {
    inject(id, value, test) {
      const t = test || testById[id]
      const v = t && t.kind === 'analog' ? engToVolts(t, value) : value
      rig.setOutput(id, v, wsSend, 'auto-test')
    },
    command(id, value) {
      const map = { 'DI-1cmd': 'CAREL-ON-OFF-CMD', 'DI-2cmd': null, 'DI-3cmd': null }
      const carel = map[id]
      if (carel) rig.sendBmsCommand(carel, value, wsSend)
    },
    readSignal(id) {
      const t = testById[id]
      const p = rig._findPoint ? rig._findPoint(id) : null
      if (!p) return undefined
      const raw = p.role === 'output' ? p.commandedValue : p.hmiValue
      if (raw == null) return undefined
      if (t && t.kind === 'analog') {
        const { min, max } = t.eng
        return min + (Math.max(0, Math.min(10, Number(raw))) / 10) * (max - min)
      }
      return raw
    },
    // Stale bus ⇒ no data, so a step can never pass on a stale reading.
    readCarel(carelId) { return rig.bmsStale ? undefined : rig.bmsValues[carelId] }
  }
}

function addLog(line, kind = 'info') {
  log.value.unshift({ t: new Date().toLocaleTimeString(), line, kind })
  if (log.value.length > 300) log.value.pop()
}

async function startAuto() {
  if (!canRun.value) {
    addLog(`Cannot start — ${!linkUp.value ? 'dashboard is not connected to the rig' : 'no live data on the Carel bus'}. Tests must never pass without hardware.`, 'bad')
    return
  }
  running.value = true
  results.value = []
  log.value = []
  progress.index = 0
  addLog('Auto sequence started · injecting rig stimulus, reading back from ESP32 + Carel bus', 'head')
  runner = createTestRunner({
    io: liveAdapter(),
    settleMs: 900,
    onProgress: (p) => {
      if (p.phase === 'start') { current.value = p.test; progress.index = p.index + 1; addLog(`▶ ${p.test.id} · ${p.test.desc}`, 'head') }
      else if (p.phase === 'done') {
        const v = p.result.verdict
        addLog(`   ${v === 'pass' ? '✓ PASS' : v === 'fail' ? '✗ FAIL' : v === 'manual' ? '● MANUAL' : '○ NO DATA'} — ${p.test.id}`, v)
      } else if (p.step) addLog(`   ${p.status === 'pass' ? '✓' : p.status === 'fail' ? '✗' : '○'} ${p.step}`, p.status === 'pass' ? 'ok' : p.status === 'fail' ? 'bad' : 'info')
    }
  })
  try {
    results.value = await runner.runAll()
    const sm = summary.value
    addLog(`Sequence complete — ${sm.pass} pass · ${sm.fail} fail · ${sm.noData} no-data · ${sm.manual} manual`, sm.fail || sm.noData ? 'fail' : 'pass')
  } catch (e) {
    addLog('Runner error: ' + e.message, 'bad')
  }
  running.value = false
  current.value = null
}

function stopAuto() { runner?.cancel(); running.value = false; addLog('Sequence cancelled by user', 'bad') }

// ---------------------------- MANUAL MODE ----------------------------
const manualId = ref('AO-1')
const manualValue = ref('')
const manualRunner = ref(null)
const manualSnapshot = ref(null)
const manualVerdicts = reactive({})

const manualTest = computed(() => testById[manualId.value])

function ensureManualRunner() {
  if (!manualRunner.value) {
    manualRunner.value = createTestRunner({ io: liveAdapter(), settleMs: 700 })
    manualSnapshot.value = manualRunner.value.sample()
  }
  return manualRunner.value
}

async function manualInject() {
  const r = ensureManualRunner()
  const t = manualTest.value
  let v = manualValue.value
  if (t.kind === 'digital') v = v === 'true' || v === true || v === 'ON'
  else v = parseFloat(v)
  if (t.kind === 'analog' && Number.isNaN(v)) return
  await r.applyValue(t.id, v, t)
  await r.settle(8)
  manualSnapshot.value = r.sample()
  addLog(`Manual inject ${t.id} = ${fmt(v)}`, 'info')
}
async function manualCommand(id, val) {
  const r = ensureManualRunner()
  await r.applyValue(id, val, null)
  await r.settle(6)
  manualSnapshot.value = r.sample()
  addLog(`Manual command ${id} = ${fmt(val)}`, 'info')
}
async function manualRunStep() {
  const r = ensureManualRunner()
  const res = await r.runTest(manualTest.value)
  manualSnapshot.value = r.sample()
  const others = results.value.filter((x) => x.id !== res.id)
  results.value = [...others, res].sort((a, b) => a.sno - b.sno)
  manualVerdicts[res.id] = res.verdict
  addLog(`Manual scripted test ${res.id}: ${res.verdict.toUpperCase()}`, res.verdict)
}
function setManualVerdict(v) {
  const id = manualId.value
  manualVerdicts[id] = v
  const t = testById[id]
  const others = results.value.filter((x) => x.id !== id)
  results.value = [...others, {
    id, sno: t.sno, desc: t.desc, purpose: t.purpose, ctrlType: t.ctrlType,
    carelId: t.carelId, carelLabel: t.carelLabel, interlinks: t.interlinks,
    testText: t.testText, expectText: t.expectText, steps: [], verdict: v, manual: true, ts: Date.now()
  }].sort((a, b) => a.sno - b.sno)
  addLog(`Manual verdict ${id}: ${v.toUpperCase()}`, v)
}

const snapVal = (id) => (manualSnapshot.value ? manualSnapshot.value[id] : undefined)
const snapAlarms = computed(() => manualSnapshot.value?.__alarms || {})

function onExport() {
  exportTestReport(results.value, {
    ...rig.job, mode: mode.value, source: 'live'
  })
}

const verdictClass = (v) =>
  v === 'pass' ? 'bg-success-soft text-success'
  : v === 'fail' ? 'bg-critical-soft text-critical'
  : v === 'manual' ? 'bg-copper-soft text-copper'
  : 'bg-sunken text-ttext-secondary'
const verdictLabel = (v) => (v === 'no-data' ? 'NO DATA' : v ? v.toUpperCase() : '—')

onUnmounted(() => runner?.cancel())
</script>

<template>
  <div class="h-full overflow-y-auto scroll-thin pr-1 space-y-3">
    <!-- header / controls -->
    <section class="panel-card p-4">
      <div class="flex flex-wrap items-center gap-3">
        <div>
          <h2 class="text-lg font-bold leading-tight">Signal Test Sequence</h2>
          <p class="font-mono text-xs text-ttext-tertiary">18 signals · injection, interlock response &amp; Carel cross-check</p>
        </div>

        <div class="flex rounded-lg overflow-hidden border-2 border-border ml-auto">
          <button class="h-9 px-4 text-sm font-bold" :class="mode==='auto'?'bg-primary text-white':'bg-surface text-ttext-secondary'" @click="mode='auto'">Auto</button>
          <button class="h-9 px-4 text-sm font-bold" :class="mode==='manual'?'bg-primary text-white':'bg-surface text-ttext-secondary'" @click="mode='manual'">Manual</button>
        </div>

        <span class="font-mono text-xs font-bold px-3 h-9 rounded-lg flex items-center gap-2"
              :class="canRun ? 'bg-success-soft text-success' : 'bg-critical-soft text-critical'">
          <span class="w-2 h-2 rounded-full" :class="canRun ? 'bg-success' : 'bg-critical'"></span>
          {{ !linkUp ? 'RIG OFFLINE' : !busLive ? 'CAREL BUS SILENT' : 'HARDWARE LIVE' }}
        </span>

        <button v-if="mode==='auto' && !running" class="h-9 px-5 rounded-lg text-sm font-bold"
                :class="canRun ? 'bg-primary text-white' : 'bg-sunken text-ttext-tertiary cursor-not-allowed'"
                :disabled="!canRun" @click="startAuto">▶ Start test</button>
        <button v-if="mode==='auto' && running" class="h-9 px-5 rounded-lg bg-critical text-white text-sm font-bold" @click="stopAuto">■ Stop</button>
        <button class="h-9 px-4 rounded-lg border-2 border-border text-sm font-bold text-ttext-secondary" :disabled="!results.length" @click="onExport">⭳ Export CSV</button>
      </div>

      <!-- progress + verdict -->
      <p v-if="!canRun" class="mt-3 font-mono text-xs text-critical">
        Connect the rig and the Carel bus before testing — with no hardware present every signal reports NO DATA, never PASS.
      </p>

      <div v-if="results.length || running" class="mt-3 flex flex-wrap items-center gap-4">
        <div class="px-4 py-2 rounded-xl font-display font-bold text-lg"
             :class="running ? 'bg-sunken text-ttext-secondary' : (summary.fail || summary.noData) ? 'bg-critical-soft text-critical' : 'bg-success-soft text-success'">
          {{ running ? 'RUNNING…' : summary.fail ? 'FAIL' : summary.noData ? 'INCOMPLETE' : 'PASS' }}
        </div>
        <div class="font-mono text-sm flex gap-5">
          <span><b class="text-success">{{ summary.pass }}</b> pass</span>
          <span><b class="text-critical">{{ summary.fail }}</b> fail</span>
          <span><b class="text-ttext-tertiary">{{ summary.noData }}</b> no-data</span>
          <span><b class="text-copper">{{ summary.manual }}</b> manual</span>
          <span class="text-ttext-secondary">of {{ summary.total }}</span>
        </div>
        <div v-if="running" class="font-mono text-xs text-ttext-tertiary">
          {{ progress.index }}/{{ progress.total }} · {{ current?.id }} {{ current?.desc }}
        </div>
      </div>
    </section>

    <!-- ============================ AUTO ============================ -->
    <template v-if="mode==='auto'">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <!-- results table -->
        <section class="panel-card p-4 lg:col-span-2">
          <p class="eyebrow mb-3">Results · all 18 signals</p>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-ttext-tertiary font-mono text-xs text-left border-b border-border">
                  <th class="py-2 pr-2 font-medium">#</th>
                  <th class="py-2 pr-3 font-medium">Signal</th>
                  <th class="py-2 px-2 font-medium">Injected</th>
                  <th class="py-2 px-2 font-medium">Interlink response</th>
                  <th class="py-2 pl-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in signalTests" :key="t.id" class="border-b border-border/60 align-top">
                  <td class="py-2 pr-2 font-mono text-xs text-ttext-tertiary">{{ t.sno }}</td>
                  <td class="py-2 pr-3">
                    <div class="font-semibold">{{ t.desc }}</div>
                    <div class="font-mono text-[11px] text-ttext-tertiary">{{ t.id }} · ctrl {{ t.ctrlType }} · {{ t.purpose }}</div>
                  </td>
                  <td class="py-2 px-2 font-mono text-[11px] text-ttext-secondary">
                    <div v-for="(s,i) in (resultById[t.id]?.steps||[])" :key="i">
                      <span v-for="(v,k) in s.injected" :key="k">{{ k }}={{ fmt(v) }} </span>
                    </div>
                    <span v-if="!resultById[t.id]" class="text-ttext-tertiary">—</span>
                  </td>
                  <td class="py-2 px-2 font-mono text-[11px]">
                    <div v-for="(s,i) in (resultById[t.id]?.steps||[])" :key="i"
                         :class="s.ok ? 'text-ttext-secondary' : 'text-critical font-semibold'">
                      <template v-for="(c,j) in s.checks" :key="j">
                        <div v-if="!c.skipped">{{ c.ok ? '✓' : '✗' }} {{ c.detail }}</div>
                      </template>
                    </div>
                    <div v-if="resultById[t.id]?.verdict==='manual'" class="text-copper">{{ resultById[t.id].reason }}</div>
                    <span v-else-if="!resultById[t.id]" class="text-ttext-tertiary">—</span>
                  </td>
                  <td class="py-2 pl-2 text-right">
                    <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-full" :class="verdictClass(resultById[t.id]?.verdict)">
                      {{ verdictLabel(resultById[t.id]?.verdict) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- live log -->
        <section class="panel-card p-4">
          <p class="eyebrow mb-3">Sequence log</p>
          <div class="font-mono text-[11px] space-y-0.5 max-h-[520px] overflow-y-auto scroll-thin">
            <div v-for="(l,i) in log" :key="i"
                 :class="{'font-bold':l.kind==='head','text-success':l.kind==='pass'||l.kind==='ok','text-critical':l.kind==='fail'||l.kind==='bad','text-ttext-secondary':l.kind==='info'}">
              <span class="text-ttext-tertiary">{{ l.t }}</span> {{ l.line }}
            </div>
            <div v-if="!log.length" class="text-ttext-tertiary">Press <b>Start test</b> to run all 18 signals.</div>
          </div>
        </section>
      </div>
    </template>

    <!-- =========================== MANUAL =========================== -->
    <template v-else>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- injector -->
        <section class="panel-card p-4">
          <p class="eyebrow mb-3">Manual injection</p>
          <label class="block mb-3">
            <span class="text-xs font-medium text-ttext-secondary">Signal</span>
            <select v-model="manualId" class="mt-1 w-full h-9 px-3 rounded-lg border-2 border-border bg-surface text-sm">
              <option v-for="t in signalTests" :key="t.id" :value="t.id">{{ t.sno }} · {{ t.id }} — {{ t.desc }}</option>
            </select>
          </label>

          <div v-if="manualTest" class="font-mono text-[11px] text-ttext-secondary mb-3 space-y-0.5">
            <div><span class="text-ttext-tertiary">Logic:</span> {{ manualTest.logic }}</div>
            <div><span class="text-ttext-tertiary">Suggested:</span> {{ manualTest.testText }}</div>
            <div><span class="text-ttext-tertiary">Expected:</span> {{ manualTest.expectText }}</div>
          </div>

          <!-- analog input -->
          <div v-if="manualTest?.kind==='analog'" class="flex items-center gap-2">
            <input v-model="manualValue" type="number" step="0.1"
                   :placeholder="`${manualTest.eng.min}–${manualTest.eng.max} ${manualTest.eng.unit}`"
                   class="flex-1 h-10 px-3 rounded-lg border-2 border-border bg-surface text-sm font-mono" />
            <span class="font-mono text-xs text-ttext-tertiary">{{ manualTest.eng.unit }}</span>
            <button class="h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold" @click="manualInject">Inject</button>
          </div>
          <!-- digital input -->
          <div v-else-if="manualTest?.kind==='digital'" class="flex items-center gap-2">
            <button class="flex-1 h-10 rounded-lg border-2 border-border text-sm font-bold hover:border-success hover:text-success"
                    @click="manualValue='true'; manualInject()">
              {{ manualTest.stateLabels ? manualTest.stateLabels.true : 'Set ON' }}
            </button>
            <button class="flex-1 h-10 rounded-lg border-2 border-border text-sm font-bold hover:border-critical hover:text-critical"
                    @click="manualValue='false'; manualInject()">
              {{ manualTest.stateLabels ? manualTest.stateLabels.false : 'Set OFF' }}
            </button>
          </div>
          <div v-else class="font-mono text-xs text-ttext-tertiary">Read-only telemetry — not injectable.</div>

          <!-- BMS commands for rig-input signals -->
          <div v-if="manualTest?.rigRole==='input' && manualTest.kind==='digital'" class="mt-3">
            <p class="eyebrow mb-2">BMS command (drives this feedback)</p>
            <div class="flex gap-2">
              <button class="flex-1 h-9 rounded-lg border-2 border-border text-xs font-bold" @click="manualCommand(manualId+'cmd', true)">Command ON</button>
              <button class="flex-1 h-9 rounded-lg border-2 border-border text-xs font-bold" @click="manualCommand(manualId+'cmd', false)">Command OFF</button>
            </div>
          </div>

          <div class="flex gap-2 mt-4 pt-3 border-t border-border">
            <button class="h-9 px-4 rounded-lg border-2 border-border text-xs font-bold" @click="manualRunStep">▶ Run scripted test for this signal</button>
            <button class="h-9 px-4 rounded-lg border-2 border-border text-xs font-bold hover:border-success hover:text-success" @click="setManualVerdict('pass')">Mark PASS</button>
            <button class="h-9 px-4 rounded-lg border-2 border-border text-xs font-bold hover:border-critical hover:text-critical" @click="setManualVerdict('fail')">Mark FAIL</button>
          </div>
        </section>

        <!-- observation -->
        <section class="panel-card p-4">
          <p class="eyebrow mb-3">Observed response</p>
          <div v-if="!manualSnapshot" class="font-mono text-xs text-ttext-tertiary">Inject a value to sample the plant.</div>
          <template v-else>
            <div class="mb-3">
              <p class="font-mono text-[11px] text-ttext-tertiary mb-1">CAREL BUS COUNTERPART</p>
              <div class="font-mono text-sm">
                <span v-if="manualTest?.carelId">{{ manualTest.carelLabel }} = <b>{{ fmt(rig.bmsValues[manualTest.carelId] ?? snapVal(manualTest.id)) }}</b></span>
                <span v-else class="text-ttext-tertiary">{{ manualTest?.carelLabel }}</span>
              </div>
            </div>

            <div class="mb-3">
              <p class="font-mono text-[11px] text-ttext-tertiary mb-1">INTERLINKED SIGNALS</p>
              <div v-if="manualTest?.interlinks?.length" class="grid grid-cols-2 gap-1">
                <div v-for="id in manualTest.interlinks" :key="id" class="flex justify-between font-mono text-xs border-b border-border py-1">
                  <span class="text-ttext-secondary">{{ id }} <span class="text-ttext-tertiary">{{ testById[id]?.desc }}</span></span>
                  <b>{{ fmt(snapVal(id)) }}</b>
                </div>
              </div>
              <div v-else class="font-mono text-xs text-ttext-tertiary">None (standalone)</div>
            </div>

            <div>
              <p class="font-mono text-[11px] text-ttext-tertiary mb-1">ALARMS</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="(v,k) in snapAlarms" :key="k"
                      class="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full"
                      :class="v ? 'bg-critical-soft text-critical' : 'bg-sunken text-ttext-tertiary'">
                  {{ k }}: {{ v ? 'ACTIVE' : 'clear' }}
                </span>
              </div>
            </div>

            <div class="mt-3 pt-3 border-t border-border">
              <p class="font-mono text-[11px] text-ttext-tertiary mb-1">CURRENT VERDICT</p>
              <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-full" :class="verdictClass(manualVerdicts[manualId])">
                {{ verdictLabel(manualVerdicts[manualId]) }}
              </span>
            </div>
          </template>
        </section>
      </div>

      <!-- manual results roll-up -->
      <section class="panel-card p-4">
        <p class="eyebrow mb-3">Recorded results ({{ results.length }}/18)</p>
        <div class="flex flex-wrap gap-2">
          <span v-for="t in signalTests" :key="t.id"
                class="font-mono text-[11px] font-bold px-2 py-1 rounded-lg"
                :class="verdictClass(resultById[t.id]?.verdict)">
            {{ t.id }} {{ resultById[t.id]?.verdict ? (resultById[t.id].verdict==='pass'?'✓':'✗') : '·' }}
          </span>
        </div>
      </section>
    </template>

    <p class="font-mono text-[11px] text-ttext-tertiary">
      The software simulates the <b>rig side only</b> — it generates and injects the test stimulus. The AHU/Carel controller is
      never simulated: every verdict is based on values read back from the ESP32 and the Carel Modbus bus, so a PASS always means
      the hardware actually did it. Signals with no Carel register cannot be auto-verified and are reported as MANUAL.
    </p>
  </div>
</template>
