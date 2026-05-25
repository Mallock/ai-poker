<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  id: { type: String, required: true },
})

const initials = computed(() => {
  return props.name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
})

// Deterministic color per character id.
const bgColor = computed(() => {
  let hash = 0
  for (let i = 0; i < props.id.length; i++) {
    hash = (hash * 31 + props.id.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue}, 55%, 38%)`
})
</script>

<template>
  <div
    class="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
    :style="{ backgroundColor: bgColor }"
  >
    <span class="text-xl">{{ initials }}</span>
  </div>
</template>
