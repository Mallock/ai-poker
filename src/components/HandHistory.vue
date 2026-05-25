<script setup>
import { computed } from 'vue'

const props = defineProps({
  history: { type: Array, default: () => [] },
  players: { type: Array, default: () => [] },
  handNumber: { type: Number, default: 0 },
  limit: { type: Number, default: 5 },
})

function nameFor(id) {
  return props.players.find((p) => p.id === id)?.name ?? id
}

const recent = computed(() => {
  return props.history
    .filter((a) => a.handNumber === props.handNumber)
    .slice(-props.limit)
})

function describe(a) {
  if (a.action === 'award') return `${a.winners.map(nameFor).join(', ')} won ${a.potAmount}`
  const who = nameFor(a.playerId)
  const amt = a.amount ? ` ${a.amount}` : ''
  return `${who} ${a.action}${amt}`
}
</script>

<template>
  <div class="history-card rounded-lg px-3.5 py-2.5 text-[11px] text-ink-300">
    <div class="mb-1.5 flex items-center justify-between border-b border-[oklch(0.28_0.03_45/0.5)] pb-1.5">
      <span class="font-display text-[10px] uppercase tracking-[0.25em] text-[oklch(0.68_0.07_82)]">Hand log</span>
    </div>
    <div v-if="recent.length === 0" class="italic text-ink-500">No actions yet</div>
    <ul v-else class="space-y-1">
      <li v-for="(a, i) in recent" :key="i" class="flex items-start gap-2 leading-snug">
        <span class="font-display text-[10px] uppercase tracking-[0.18em] text-[oklch(0.62_0.06_82/0.85)] mt-0.5">{{ a.street }}</span>
        <span class="num-tab text-ink-200">{{ describe(a) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.history-card {
  background:
    linear-gradient(180deg, oklch(0.20 0.025 40), oklch(0.14 0.018 35));
  border: 1px solid oklch(0.30 0.035 45 / 0.55);
  box-shadow:
    inset 0 1px 0 oklch(0.55 0.04 60 / 0.25),
    0 8px 18px oklch(0 0 0 / 0.35);
}
</style>
