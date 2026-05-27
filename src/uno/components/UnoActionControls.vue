<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  legalActions: { type: Object, required: true },
  isHumanTurn: { type: Boolean, default: false },
  // True when the human's hand size is 2 and at least one play exists — show Call UNO toggle.
  showCallUno: { type: Boolean, default: false },
  // True when another seat has a pending missed-UNO window.
  canCatchMissedUno: { type: Boolean, default: false },
  // True when a Wild Draw 4 was just played at the human (canChallenge / canAccept).
  pendingWildDraw4: { type: Boolean, default: false },
})
const emit = defineEmits(['action'])

const callUno = ref(false)

// Reset the toggle when the human's hand size changes (next turn).
watch(() => props.showCallUno, (v) => { if (!v) callUno.value = false })

// "callUno" preference is read back by the parent when the play action is dispatched.
defineExpose({ callUno })

function emitAction(action) {
  emit('action', { ...action, callUno: props.showCallUno && callUno.value })
}
</script>

<template>
  <div class="uno-controls">
    <template v-if="pendingWildDraw4">
      <button class="btn btn-challenge" @click="emit('action', { action: 'challenge' })">Challenge!</button>
      <button class="btn btn-accept" @click="emit('action', { action: 'accept' })">Accept (draw 4)</button>
    </template>
    <template v-else>
      <button
        class="btn btn-draw"
        :disabled="!isHumanTurn || !legalActions.canDraw"
        @click="emitAction({ action: 'draw' })"
      >Draw</button>

      <button
        v-if="legalActions.canPass"
        class="btn btn-pass"
        :disabled="!isHumanTurn"
        @click="emitAction({ action: 'pass' })"
      >Pass</button>

      <label v-if="showCallUno" class="call-uno-toggle">
        <input type="checkbox" v-model="callUno" />
        Call UNO!
      </label>

      <button
        v-if="canCatchMissedUno"
        class="btn btn-catch"
        @click="emit('action', { action: 'catchMissedUno' })"
      >Catch missed UNO!</button>
    </template>
  </div>
</template>

<style scoped>
.uno-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  background: linear-gradient(180deg, oklch(0.20 0.030 40), oklch(0.14 0.020 35));
  border: 1px solid oklch(0.30 0.035 45 / 0.6);
  box-shadow:
    inset 0 1px 0 oklch(0.55 0.04 60 / 0.35),
    0 12px 24px oklch(0 0 0 / 0.45);
}
.btn {
  font-family: 'Public Sans', sans-serif;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.04em;
  padding: 8px 16px;
  border-radius: 6px;
  transition: transform 120ms ease, filter 120ms ease;
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.20),
    0 2px 6px oklch(0 0 0 / 0.4);
}
.btn:not(:disabled):hover { filter: brightness(1.10); }
.btn:not(:disabled):active { transform: translateY(1px); }
.btn:disabled { cursor: not-allowed; filter: grayscale(0.6) brightness(0.7); }

.btn-draw {
  background: linear-gradient(180deg, oklch(0.36 0.10 220), oklch(0.24 0.08 220));
  color: oklch(0.95 0.02 220);
}
.btn-pass {
  background: linear-gradient(180deg, oklch(0.34 0.025 50), oklch(0.24 0.020 45));
  color: oklch(0.92 0.015 80);
}
.btn-challenge {
  background: linear-gradient(180deg, oklch(0.45 0.16 25), oklch(0.32 0.14 25));
  color: oklch(0.96 0.02 25);
}
.btn-accept {
  background: linear-gradient(180deg, oklch(0.34 0.025 50), oklch(0.24 0.020 45));
  color: oklch(0.92 0.015 80);
}
.btn-catch {
  background: linear-gradient(180deg, oklch(0.55 0.20 60), oklch(0.42 0.18 60));
  color: white;
  animation: blink 1s ease-in-out infinite;
}
@keyframes blink {
  0%, 100% { box-shadow: 0 0 0 0 oklch(0.84 0.16 82 / 0); }
  50%      { box-shadow: 0 0 14px 2px oklch(0.84 0.16 82 / 0.7); }
}
.call-uno-toggle {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px;
  color: oklch(0.95 0.04 80);
  background: oklch(0.20 0.05 60 / 0.6);
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid oklch(0.50 0.18 60 / 0.6);
  cursor: pointer;
}
</style>
