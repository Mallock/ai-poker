<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import UnoCard from './UnoCard.vue'
import PortraitPlaceholder from '../../components/PortraitPlaceholder.vue'
import SpeechBubble from '../../components/SpeechBubble.vue'
import { useUiStore } from '../../stores/ui.js'

const props = defineProps({
  seat: { type: Object, required: true },     // { id, name, isHuman, characterId? }
  seatIndex: { type: Number, required: true },
  handSize: { type: Number, required: true },
  isActive: { type: Boolean, default: false },
  isWinner: { type: Boolean, default: false },
  pendingUnoCatch: { type: Boolean, default: false },
  // 'top' | 'left' | 'right' | 'bottom' — used to direct the speech bubble.
  anchor: { type: String, default: 'top' },
})

const portraitError = ref(false)
const portraitUrl = computed(() => props.seat.characterId
  ? `/portraits/${props.seat.characterId}.png`
  : null,
)

// Cap the visible back stack at 5 with a "+N" overlay for larger hands.
const VISIBLE_BACKS_CAP = 5
const visibleBacks = computed(() => Math.min(props.handSize, VISIBLE_BACKS_CAP))
const overflow = computed(() => Math.max(0, props.handSize - VISIBLE_BACKS_CAP))

const ui = useUiStore()
const { activeBubbles } = storeToRefs(ui)
const bubbleText = computed(() => {
  if (!props.seat.characterId) return null
  return activeBubbles.value[props.seat.characterId]?.text ?? null
})
</script>

<template>
  <div :class="['uno-seat relative flex items-center gap-2', isActive ? 'is-active' : '']">
    <div class="portrait">
      <img
        v-if="portraitUrl && !portraitError"
        :src="portraitUrl"
        :alt="seat.name"
        class="h-full w-full object-cover"
        @error="portraitError = true"
      />
      <PortraitPlaceholder v-else :name="seat.name" :id="seat.characterId ?? seat.id" />
      <div v-if="isActive" class="active-ring"></div>
    </div>
    <div class="flex flex-col">
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-semibold text-ink-100">{{ seat.name }}</span>
        <span class="hand-count">{{ handSize }} card{{ handSize === 1 ? '' : 's' }}</span>
        <span v-if="handSize === 1" class="uno-pill">UNO</span>
        <span v-if="pendingUnoCatch" class="missed-uno-pill">missed!</span>
      </div>
      <div class="back-stack mt-1">
        <UnoCard
          v-for="i in visibleBacks"
          :key="i"
          face="down"
          size="sm"
          :style="{ marginLeft: i === 1 ? '0' : '-22px', zIndex: i }"
        />
        <span v-if="overflow > 0" class="overflow-badge">+{{ overflow }}</span>
      </div>
    </div>
    <SpeechBubble v-if="bubbleText" :text="bubbleText" :position="anchor === 'top' ? 'below' : 'above'" />
  </div>
</template>

<style scoped>
.uno-seat {
  padding: 6px 10px;
  border-radius: 10px;
  background: linear-gradient(180deg, oklch(0.20 0.030 40 / 0.7), oklch(0.13 0.020 35 / 0.7));
  border: 1px solid oklch(0.30 0.035 50 / 0.5);
  transition: box-shadow 200ms ease, transform 200ms ease;
}
.uno-seat.is-active {
  box-shadow:
    0 0 0 2px oklch(0.84 0.16 82 / 0.8),
    0 0 16px oklch(0.84 0.16 82 / 0.45);
}
.portrait {
  position: relative;
  width: 64px; height: 64px;
  border-radius: 999px;
  overflow: hidden;
  border: 2px solid oklch(0.32 0.035 50 / 0.6);
  background: oklch(0.20 0.02 50);
  flex-shrink: 0;
}
.active-ring {
  position: absolute; inset: -3px;
  border: 2px solid oklch(0.84 0.16 82);
  border-radius: 999px;
  pointer-events: none;
}
.hand-count {
  font-size: 11px;
  color: oklch(0.78 0.05 78);
  background: oklch(0.20 0.02 45 / 0.7);
  padding: 1px 6px;
  border-radius: 4px;
}
.uno-pill {
  font-size: 10px;
  font-weight: 700;
  color: white;
  background: oklch(0.55 0.20 25);
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.08em;
}
.missed-uno-pill {
  font-size: 10px;
  font-weight: 600;
  color: oklch(0.95 0.05 80);
  background: oklch(0.50 0.18 60);
  padding: 1px 6px;
  border-radius: 4px;
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1 }
  50%      { opacity: 0.6 }
}
.back-stack {
  position: relative;
  display: flex;
  align-items: center;
  height: 72px;
  padding-left: 0;
}
.overflow-badge {
  margin-left: 4px;
  font-size: 11px;
  color: oklch(0.82 0.06 78);
  background: oklch(0.20 0.02 50);
  padding: 1px 6px;
  border-radius: 4px;
  align-self: center;
}
</style>
