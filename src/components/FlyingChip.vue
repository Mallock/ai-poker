<script setup>
import { ref, onMounted } from 'vue'
import Chip from './Chip.vue'

const props = defineProps({
  fromX: { type: Number, required: true },
  fromY: { type: Number, required: true },
  denomination: { type: String, default: 'blue' },
})

const x = ref(props.fromX)
const y = ref(props.fromY)
const opacity = ref(1)
const scale = ref(1)

onMounted(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      x.value = 50
      y.value = 50
      opacity.value = 0
      scale.value = 0.55
    })
  })
})
</script>

<template>
  <div
    class="chip-fly pointer-events-none absolute z-20"
    :style="{
      left: `${x}%`,
      top: `${y}%`,
      opacity,
      transform: `translate(-50%, -50%) scale(${scale})`,
    }"
  >
    <Chip :denomination="denomination" :size="22" />
  </div>
</template>

<style scoped>
.chip-fly {
  transition:
    left 650ms cubic-bezier(0.4, 0, 0.2, 1),
    top 650ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 650ms ease-out,
    transform 650ms cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
