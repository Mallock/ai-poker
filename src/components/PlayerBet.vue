<script setup>
import { computed } from 'vue'
import Chip from './Chip.vue'

const props = defineProps({
  // The player object (we read currentBet, folded, allIn).
  player: { type: Object, required: true },
  // The player's last action on the CURRENT street, or null if they haven't acted yet.
  lastAction: { type: Object, default: null },
  // Whether this player just acted (the latest action in the whole history).
  isMostRecent: { type: Boolean, default: false },
})

const ACTION_LABELS = {
  check:    { label: 'Check',  tone: 'neutral' },
  call:     { label: 'Call',   tone: 'neutral' },
  raise:    { label: 'Raise',  tone: 'hot' },
  'all-in': { label: 'All-In', tone: 'hot' },
  fold:     { label: 'Fold',   tone: 'cold' },
}

const showActionBadge = computed(() => {
  if (!props.lastAction) return false
  // For bets/calls/raises the chip stack itself reads as the indicator; the badge
  // adds the verb (check/fold) and the "just acted" flash for everyone else.
  return true
})

const actionInfo = computed(() => {
  if (!props.lastAction) return null
  return ACTION_LABELS[props.lastAction.action] ?? null
})

function chipDenominationsFor(amount) {
  const denoms = [
    { name: 'black', value: 1000 },
    { name: 'green', value: 500 },
    { name: 'blue', value: 100 },
    { name: 'red', value: 25 },
    { name: 'white', value: 5 },
  ]
  const out = []
  let remaining = amount
  for (const d of denoms) {
    const count = Math.min(3, Math.floor(remaining / d.value))
    for (let i = 0; i < count; i++) out.push(d.name)
    remaining -= count * d.value
    if (out.length >= 6) break
  }
  if (out.length === 0 && amount > 0) out.push('white')
  return out
}

const chipStack = computed(() => chipDenominationsFor(props.player.currentBet))
const hasChips = computed(() => props.player.currentBet > 0)
</script>

<template>
  <div class="pointer-events-none flex flex-col items-center gap-1">
    <!-- Chip stack (only when there's a bet on this street) -->
    <div
      v-if="hasChips"
      :class="['flex flex-col items-center', isMostRecent ? 'animate-bet-pulse' : '']"
    >
      <div class="flex -space-x-2.5 drop-shadow-[0_3px_4px_oklch(0_0_0/0.55)]">
        <Chip
          v-for="(denom, idx) in chipStack"
          :key="idx"
          :denomination="denom"
          :size="20"
        />
      </div>
      <div class="num-tab mt-0.5 font-display text-[12px] tracking-wide text-[oklch(0.86_0.08_82)]">
        {{ player.currentBet.toLocaleString() }}
      </div>
    </div>

    <!-- Action badge (verb only — useful for check/fold where chips don't exist) -->
    <div
      v-if="actionInfo && (!hasChips || isMostRecent)"
      :class="[
        'action-badge font-display text-[10px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full',
        actionInfo.tone === 'hot' ? 'badge-hot' : actionInfo.tone === 'cold' ? 'badge-cold' : 'badge-neutral',
        isMostRecent ? 'badge-flash' : '',
      ]"
    >
      {{ actionInfo.label }}<span v-if="lastAction.amount && (lastAction.action === 'raise' || lastAction.action === 'all-in')" class="num-tab ml-1">{{ lastAction.amount.toLocaleString() }}</span>
    </div>
  </div>
</template>

<style scoped>
.action-badge {
  border: 1px solid oklch(0.35 0.03 50 / 0.6);
  box-shadow: 0 2px 6px oklch(0 0 0 / 0.5);
  white-space: nowrap;
}
.badge-neutral {
  background: linear-gradient(180deg, oklch(0.30 0.025 45), oklch(0.20 0.020 40));
  color: oklch(0.88 0.018 80);
}
.badge-hot {
  background: linear-gradient(180deg, oklch(0.42 0.13 25), oklch(0.30 0.10 25));
  color: oklch(0.96 0.02 25);
  border-color: oklch(0.50 0.14 25 / 0.55);
}
.badge-cold {
  background: linear-gradient(180deg, oklch(0.26 0.018 45), oklch(0.18 0.015 40));
  color: oklch(0.68 0.018 75);
}

.badge-flash {
  animation: badge-flash 700ms ease-out 1;
}
@keyframes badge-flash {
  0%   { transform: scale(0.85); opacity: 0; filter: brightness(1.4); }
  40%  { transform: scale(1.06); opacity: 1; filter: brightness(1.4); }
  100% { transform: scale(1);    opacity: 1; filter: brightness(1); }
}

.animate-bet-pulse {
  animation: bet-pulse 600ms ease-out 1;
}
@keyframes bet-pulse {
  0%   { transform: scale(0.6); opacity: 0; }
  60%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .animate-bet-pulse, .badge-flash { animation: none; }
}
</style>
