<script setup>
import { computed, ref } from 'vue'
import { assetFor, backAsset } from '../engine/cardAssets.js'
import { cardLabel } from '../engine/cards.js'

const props = defineProps({
  card: { type: Object, default: null }, // { id, color, value }
  face: { type: String, default: 'up' }, // 'up' | 'down'
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
  playable: { type: Boolean, default: false },
  // Greyed/dim when not playable in the human's hand row.
  dim: { type: Boolean, default: false },
})

const emit = defineEmits(['click'])

const sizeMap = {
  sm: { w: 'w-12', h: 'h-[72px]', radius: 'rounded-md' },
  md: { w: 'w-16', h: 'h-24', radius: 'rounded-lg' },
  lg: { w: 'w-20', h: 'h-[120px]', radius: 'rounded-lg' },
}
const sz = computed(() => sizeMap[props.size] ?? sizeMap.md)

const isDown = computed(() => props.face === 'down' || !props.card)
const imgSrc = computed(() => isDown.value ? backAsset() : assetFor(props.card))
const imageLoaded = ref(false)

const label = computed(() => isDown.value ? 'Uno card (face down)' : cardLabel(props.card))

function onClick() {
  if (!props.playable) return
  emit('click', props.card)
}
</script>

<template>
  <button
    type="button"
    :class="[
      'uno-card relative shrink-0 select-none transition-transform',
      sz.w, sz.h, sz.radius,
      playable ? 'is-playable' : '',
      dim ? 'is-dim' : '',
    ]"
    :aria-label="label"
    :disabled="!playable"
    @click="onClick"
  >
    <img
      :src="imgSrc"
      :alt="label"
      :class="['absolute inset-0 h-full w-full object-contain transition-opacity duration-150', sz.radius]"
      :style="{ opacity: imageLoaded ? 1 : 0 }"
      @load="imageLoaded = true"
      @error="imageLoaded = false"
    />
    <!-- Fallback placeholder if PNG hasn't loaded -->
    <div
      v-if="!imageLoaded"
      :class="['absolute inset-0 flex items-center justify-center text-xs font-semibold text-white', sz.radius]"
      :style="{ background: isDown ? '#222' : colorSwatch(card?.color) }"
    >
      {{ isDown ? '' : (card?.value ?? '') }}
    </div>
  </button>
</template>

<script>
function colorSwatch(color) {
  switch (color) {
    case 'red':    return '#d23028'
    case 'yellow': return '#e6b800'
    case 'green':  return '#1aa84a'
    case 'blue':   return '#1f6fb4'
    default:       return '#333'
  }
}
</script>

<style scoped>
.uno-card {
  background: #111;
  box-shadow: 0 4px 10px oklch(0 0 0 / 0.5);
  cursor: default;
}
.uno-card.is-playable {
  cursor: pointer;
  transform: translateY(-2px);
  box-shadow:
    0 0 0 2px oklch(0.84 0.16 82),
    0 0 14px oklch(0.84 0.16 82 / 0.55),
    0 6px 14px oklch(0 0 0 / 0.55);
}
.uno-card.is-playable:hover {
  transform: translateY(-6px);
  filter: brightness(1.1);
}
.uno-card.is-dim {
  filter: grayscale(0.55) brightness(0.65);
}
.uno-card:disabled {
  cursor: default;
}
</style>
