<script setup>
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Pick a color' },
})
const emit = defineEmits(['pick', 'cancel'])

const COLORS = [
  { id: 'red',    bg: '#d23028', label: 'Red' },
  { id: 'yellow', bg: '#e6b800', label: 'Yellow' },
  { id: 'green',  bg: '#1aa84a', label: 'Green' },
  { id: 'blue',   bg: '#1f6fb4', label: 'Blue' },
]
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3 class="modal-title">{{ title }}</h3>
      <div class="grid grid-cols-2 gap-3 mt-4">
        <button
          v-for="c in COLORS"
          :key="c.id"
          class="swatch"
          :style="{ background: c.bg }"
          @click="emit('pick', c.id)"
        >{{ c.label }}</button>
      </div>
      <button class="mt-4 text-xs text-ink-300 hover:text-ink-100" @click="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0;
  background: oklch(0 0 0 / 0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 50;
}
.modal-card {
  background: linear-gradient(180deg, oklch(0.20 0.030 40), oklch(0.14 0.020 35));
  border: 1px solid oklch(0.32 0.035 50 / 0.7);
  border-radius: 12px;
  padding: 18px 22px;
  min-width: 260px;
  text-align: center;
  box-shadow: 0 24px 48px oklch(0 0 0 / 0.5);
}
.modal-title {
  font-family: 'Public Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.06em;
  color: oklch(0.84 0.08 82);
}
.swatch {
  padding: 18px 0;
  border-radius: 8px;
  color: white;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 0 oklch(0 0 0 / 0.4);
  box-shadow: 0 4px 10px oklch(0 0 0 / 0.4);
  cursor: pointer;
  transition: transform 120ms ease, filter 120ms ease;
}
.swatch:hover { transform: translateY(-2px); filter: brightness(1.1); }
.swatch:active { transform: translateY(0); filter: brightness(0.95); }
</style>
