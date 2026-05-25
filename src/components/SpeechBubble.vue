<script setup>
const props = defineProps({
  text: { type: String, required: true },
  // 'above' (default) — bubble sits above the portrait with the tail pointing down.
  // 'below' — bubble sits below the portrait with the tail pointing up. Used by top-arc
  // seats where an above-portrait bubble would clip past the table edge.
  position: { type: String, default: 'above' },
})
</script>

<template>
  <div
    :class="[
      'absolute left-1/2 -translate-x-1/2 z-20 w-max max-w-[320px]',
      position === 'below' ? 'top-full mt-3' : '-top-3 -translate-y-full',
    ]"
  >
    <div class="relative rounded-2xl bg-white px-4 py-2.5 text-sm text-slate-900 shadow-xl">
      <p class="leading-snug">{{ text }}</p>
      <!-- Tail: points DOWN for above-portrait bubbles, UP for below-portrait bubbles. -->
      <div
        v-if="position === 'below'"
        class="absolute left-1/2 -top-2 h-0 w-0 -translate-x-1/2 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white"
      />
      <div
        v-else
        class="absolute left-1/2 -bottom-2 h-0 w-0 -translate-x-1/2 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white"
      />
    </div>
  </div>
</template>
