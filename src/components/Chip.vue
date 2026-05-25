<script setup>
import { computed } from 'vue'

const props = defineProps({
  denomination: { type: String, default: 'white' }, // white|red|blue|green|black
  size: { type: Number, default: 28 },
})

// Casino-grade colors keyed to denomination tradition (white=1, red=5, blue=10, green=25, black=100, etc.)
// We tune for OKLCH so darks aren't muddy.
const palette = {
  white: { face: '#f4ecd8', dark: '#c9bea7', ink: '#3a3329' },
  red:   { face: '#b32a2a', dark: '#7a1818', ink: '#fbe9e9' },
  blue:  { face: '#1f4ea0', dark: '#0e2c66', ink: '#e6efff' },
  green: { face: '#1f6b3a', dark: '#0e3b1f', ink: '#e9f6ec' },
  black: { face: '#1a1a1f', dark: '#000000', ink: '#e9e6e0' },
}

const p = computed(() => palette[props.denomination] ?? palette.white)
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 40 40" aria-hidden="true">
    <defs>
      <radialGradient :id="`chip-face-${denomination}`" cx="40%" cy="35%" r="70%">
        <stop offset="0%" :stop-color="p.face" stop-opacity="1" />
        <stop offset="100%" :stop-color="p.dark" stop-opacity="1" />
      </radialGradient>
      <linearGradient :id="`chip-edge-${denomination}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="p.dark" />
        <stop offset="100%" stop-color="#000" />
      </linearGradient>
    </defs>

    <!-- Outer edge ring -->
    <circle cx="20" cy="20" r="19" :fill="`url(#chip-edge-${denomination})`" />
    <!-- Edge dashes (chip flutes) -->
    <g :stroke="p.ink" stroke-opacity="0.55" stroke-width="2.4">
      <line x1="20" y1="1.5" x2="20" y2="5.5" />
      <line x1="20" y1="34.5" x2="20" y2="38.5" />
      <line x1="1.5" y1="20" x2="5.5" y2="20" />
      <line x1="34.5" y1="20" x2="38.5" y2="20" />
      <line x1="6" y1="6" x2="8.8" y2="8.8" />
      <line x1="31.2" y1="31.2" x2="34" y2="34" />
      <line x1="6" y1="34" x2="8.8" y2="31.2" />
      <line x1="31.2" y1="8.8" x2="34" y2="6" />
    </g>
    <!-- Inner face -->
    <circle cx="20" cy="20" r="13.5" :fill="`url(#chip-face-${denomination})`" :stroke="p.dark" stroke-width="0.6" />
    <!-- Subtle dashed inner ring -->
    <circle cx="20" cy="20" r="10.5" fill="none" :stroke="p.ink" stroke-opacity="0.35" stroke-width="0.8" stroke-dasharray="2 2.5" />
    <!-- Specular highlight -->
    <ellipse cx="15" cy="13" rx="6" ry="2.4" fill="#ffffff" fill-opacity="0.18" />
  </svg>
</template>
