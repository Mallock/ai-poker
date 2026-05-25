<script setup>
import Chip from './Chip.vue'

const props = defineProps({
  pots: { type: Array, default: () => [] },
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
    const count = Math.min(4, Math.floor(remaining / d.value))
    for (let i = 0; i < count; i++) out.push(d.name)
    remaining -= count * d.value
    if (out.length >= 8) break
  }
  if (out.length === 0 && amount > 0) out.push('white')
  return out
}
</script>

<template>
  <div class="flex flex-col items-center gap-2">
    <div
      v-for="(pot, i) in pots"
      :key="i"
      class="flex flex-col items-center gap-1"
    >
      <div class="flex -space-x-3 drop-shadow-[0_3px_3px_oklch(0_0_0/0.5)]">
        <Chip
          v-for="(denom, idx) in chipDenominationsFor(pot.amount)"
          :key="idx"
          :denomination="denom"
          :size="26"
        />
      </div>
      <div class="num-tab font-display text-[13px] tracking-wide text-[oklch(0.82_0.07_82)]">
        <span class="uppercase text-[10px] tracking-[0.2em] text-[oklch(0.70_0.06_82/0.85)] mr-1.5">
          {{ pot.label ?? (i === 0 ? 'Pot' : `Side ${i}`) }}
        </span>
        {{ pot.amount.toLocaleString() }}
      </div>
    </div>
  </div>
</template>
