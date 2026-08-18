<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  sectionId: { type: String, default: 'AO' } // AO | AI | DO | DI — seeds sensible defaults
})
const emit = defineEmits(['save', 'cancel'])

// Derive direction + kind from the active section so the form starts correct.
function defaultsFor(sectionId) {
  return {
    role: sectionId === 'AO' || sectionId === 'DO' ? 'output' : 'input',
    kind: sectionId === 'AO' || sectionId === 'AI' ? 'analog' : 'digital'
  }
}

const form = reactive({
  id: '',
  terminal: '',
  ...defaultsFor(props.sectionId),
  min: 0,
  max: 10
})

watch(() => props.sectionId, (id) => Object.assign(form, defaultsFor(id)))

function submit() {
  if (!form.id.trim() || !form.terminal.trim()) return
  const isAnalog = form.kind === 'analog'
  const point = {
    id: form.id.trim(),
    terminal: form.terminal.trim(),
    label: form.id.trim(),
    role: form.role,
    kind: form.kind,
    unit: isAnalog ? 'V' : null,
    min: isAnalog ? form.min : null,
    max: isAnalog ? form.max : null,
    commandedValue: null,
    controllerValue: null,
    hmiValue: null,
    confirmed: form.kind === 'digital' && form.role === 'input' ? null : undefined,
    source: form.role === 'output' ? 'manual' : null,
    relatedPoints: []
  }
  emit('save', point)
}
</script>

<template>
  <div class="panel-card p-5 border-primary/40">
    <p class="text-base font-semibold mb-4">Add channel</p>

    <div class="grid grid-cols-2 gap-2 mb-2">
      <button
        class="h-11 rounded-xl text-sm font-medium border-2"
        :class="form.role === 'output' ? 'bg-primary text-white border-primary' : 'border-border text-ttext-secondary'"
        @click="form.role = 'output'"
      >Output (rig drives)</button>
      <button
        class="h-11 rounded-xl text-sm font-medium border-2"
        :class="form.role === 'input' ? 'bg-copper text-white border-copper' : 'border-border text-ttext-secondary'"
        @click="form.role = 'input'"
      >Input (rig senses)</button>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-2">
      <button
        class="h-11 rounded-xl text-sm font-medium border-2"
        :class="form.kind === 'analog' ? 'bg-sunken border-borderstrong font-semibold' : 'border-border text-ttext-secondary'"
        @click="form.kind = 'analog'"
      >Analog (0–10 V)</button>
      <button
        class="h-11 rounded-xl text-sm font-medium border-2"
        :class="form.kind === 'digital' ? 'bg-sunken border-borderstrong font-semibold' : 'border-border text-ttext-secondary'"
        @click="form.kind = 'digital'"
      >Digital (ON/OFF)</button>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-2">
      <input v-model="form.id" type="text" placeholder="Channel ID — e.g. AO-20"
        class="h-11 px-3 rounded-xl border-2 border-border text-base bg-surfacealt" />
      <input v-model="form.terminal" type="text" placeholder="Terminal — e.g. E3U2"
        class="h-11 px-3 rounded-xl border-2 border-border text-base bg-surfacealt" />
    </div>

    <div v-if="form.kind === 'analog'" class="grid grid-cols-2 gap-2 mb-3">
      <input v-model.number="form.min" type="number" placeholder="Min V"
        class="h-11 px-3 rounded-xl border-2 border-border text-base bg-surfacealt" />
      <input v-model.number="form.max" type="number" placeholder="Max V"
        class="h-11 px-3 rounded-xl border-2 border-border text-base bg-surfacealt" />
    </div>
    <p v-else class="text-sm text-ttext-tertiary mb-3 px-1">
      {{ form.role === 'output' ? 'Digital output — driven via the ON/OFF button.' : 'Digital input — sensed, read-only.' }}
    </p>

    <div class="flex gap-2">
      <button class="flex-1 h-11 rounded-xl bg-primary text-white text-base font-medium" @click="submit">
        Save &amp; wire to gateway
      </button>
      <button class="h-11 px-4 rounded-xl border-2 border-borderstrong text-base" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </div>
</template>
