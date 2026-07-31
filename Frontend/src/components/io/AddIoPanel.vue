<script setup>
import { reactive } from 'vue'

const emit = defineEmits(['save', 'cancel'])

const form = reactive({
  id: '',
  terminal: '',
  role: 'stimulus',
  kind: 'analog',
  unit: '',
  min: 0,
  max: 100,
  acceptableValue: null
})

function submit() {
  if (!form.id.trim() || !form.terminal.trim()) return
  const point = {
    id: form.id.trim(),
    terminal: form.terminal.trim(),
    label: form.id.trim(),
    role: form.role,
    kind: form.kind,
    unit: form.kind === 'analog' ? form.unit : null,
    min: form.kind === 'analog' ? form.min : null,
    max: form.kind === 'analog' ? form.max : null,
    acceptableValue: form.kind === 'analog' ? form.acceptableValue : null,
    tolerancePercent: 5,
    commandedValue: null,
    controllerValue: null,
    hmiValue: null,
    confirmed: form.kind === 'digital' && form.role === 'response' ? null : undefined,
    source: form.role === 'stimulus' ? 'manual' : null,
    relatedPoints: []
  }
  emit('save', point)
}
</script>

<template>
  <div class="panel-card p-4 border-primary/40">
    <p class="text-sm font-semibold mb-4">Add I/O point</p>

    <div class="grid grid-cols-2 gap-2 mb-2">
      <button
        class="h-8 rounded-lg text-xs font-medium border"
        :class="form.role === 'stimulus' ? 'bg-primary text-white border-primary' : 'border-border text-ttext-secondary'"
        @click="form.role = 'stimulus'"
      >Stimulus (rig → UUT)</button>
      <button
        class="h-8 rounded-lg text-xs font-medium border"
        :class="form.role === 'response' ? 'bg-copper text-white border-copper' : 'border-border text-ttext-secondary'"
        @click="form.role = 'response'"
      >Response (UUT → rig)</button>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-2">
      <button
        class="h-8 rounded-lg text-xs font-medium border"
        :class="form.kind === 'analog' ? 'bg-sunken border-borderstrong font-semibold' : 'border-border text-ttext-secondary'"
        @click="form.kind = 'analog'"
      >Analog</button>
      <button
        class="h-8 rounded-lg text-xs font-medium border"
        :class="form.kind === 'digital' ? 'bg-sunken border-borderstrong font-semibold' : 'border-border text-ttext-secondary'"
        @click="form.kind = 'digital'"
      >Digital</button>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-2">
      <input v-model="form.id" type="text" placeholder="ID — e.g. RM5-TEMP"
        class="h-9 px-3 rounded-lg border border-border text-sm bg-surfacealt" />
      <input v-model="form.terminal" type="text" placeholder="Terminal — e.g. E3U2"
        class="h-9 px-3 rounded-lg border border-border text-sm bg-surfacealt" />
    </div>

    <div v-if="form.kind === 'analog'" class="grid grid-cols-3 gap-2 mb-3">
      <input v-model="form.unit" type="text" placeholder="Unit"
        class="h-9 px-2 rounded-lg border border-border text-sm bg-surfacealt" />
      <input v-model.number="form.min" type="number" placeholder="Min"
        class="h-9 px-2 rounded-lg border border-border text-sm bg-surfacealt" />
      <input v-model.number="form.max" type="number" placeholder="Max"
        class="h-9 px-2 rounded-lg border border-border text-sm bg-surfacealt" />
    </div>
    <input v-else-if="form.role === 'stimulus'" type="text" placeholder="(digital stimulus — commanded via toggle, no extra fields)"
      disabled class="w-full h-9 px-3 mb-3 rounded-lg border border-dashed border-border text-xs text-ttext-tertiary bg-surfacealt" />
    <input v-else type="text" placeholder="(digital response — confirmed manually, no extra fields)"
      disabled class="w-full h-9 px-3 mb-3 rounded-lg border border-dashed border-border text-xs text-ttext-tertiary bg-surfacealt" />

    <div class="flex gap-2">
      <button class="flex-1 h-9 rounded-lg bg-primary text-white text-sm font-medium" @click="submit">
        Save &amp; wire to gateway
      </button>
      <button class="h-9 px-4 rounded-lg border border-borderstrong text-sm" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </div>
</template>
