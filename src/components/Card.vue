<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  card: { type: String, default: null }, // e.g. "AS" or null
  faceDown: { type: Boolean, default: false },
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
})

const sizeMap = {
  sm: { w: 'w-11', h: 'h-[60px]', rank: 'text-[15px]', pip: 'text-[12px]', center: 'text-2xl', radius: 'rounded-[5px]' },
  md: { w: 'w-14', h: 'h-20',     rank: 'text-[20px]', pip: 'text-[14px]', center: 'text-[34px]', radius: 'rounded-[7px]' },
  lg: { w: 'w-[88px]', h: 'h-[124px]', rank: 'text-[30px]', pip: 'text-[18px]', center: 'text-[56px]', radius: 'rounded-[9px]' },
}
const sz = computed(() => sizeMap[props.size] ?? sizeMap.md)

// Finnish deck (sgh_kortit) filename scheme: <suit>_<NN>.png
//   hertta = hearts, pata = spades, risti = clubs, ruutu = diamonds
//   01 = Ace, 11 = Jack, 12 = Queen, 13 = King; T = 10
const SUIT_TO_NAME = { H: 'hertta', S: 'pata', C: 'risti', D: 'ruutu' }
const RANK_TO_NN = {
  A: '01', 2: '02', 3: '03', 4: '04', 5: '05', 6: '06', 7: '07', 8: '08', 9: '09',
  T: '10', J: '11', Q: '12', K: '13',
}

const assetUrl = computed(() => {
  if (props.faceDown || !props.card) return '/assets/sgh_kortit/tausta_punainen.png'
  const code = props.card.toUpperCase()
  const suitName = SUIT_TO_NAME[code.slice(-1)]
  const rankNN = RANK_TO_NN[code.slice(0, -1)]
  if (!suitName || !rankNN) return '/assets/sgh_kortit/tausta_punainen.png'
  return `/assets/sgh_kortit/${suitName}_${rankNN}.png`
})

// CSS render is always present underneath; PNG overlays on top only if it loads.
const imageLoaded = ref(false)
watch(assetUrl, () => { imageLoaded.value = false })

const suit = computed(() => (props.card?.slice(-1).toUpperCase() ?? ''))
const rank = computed(() => (props.card?.slice(0, -1).toUpperCase() ?? ''))
const isRed = computed(() => suit.value === 'H' || suit.value === 'D')
const suitChar = computed(() => ({ S: '♠', H: '♥', D: '♦', C: '♣' })[suit.value] ?? '')
const inkColor = computed(() => isRed.value ? 'var(--card-red)' : 'var(--card-ink)')
</script>

<template>
  <div
    :class="['card-frame card-dealt relative shrink-0 select-none', sz.w, sz.h, sz.radius]"
  >
    <!-- CSS face is always rendered underneath; PNG overlays only on successful load. -->
    <!-- Face-down ornamental back -->
    <div
      v-if="faceDown || !card"
      :class="['card-back absolute inset-0', sz.radius]"
    >
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="absolute inset-[6%]" aria-hidden="true">
        <defs>
          <pattern id="diaback" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="14" height="14" fill="oklch(0.22 0.06 25)"/>
            <path d="M7 0 L14 7 L7 14 L0 7 Z" fill="none" stroke="oklch(0.58 0.10 65)" stroke-width="0.7" opacity="0.55"/>
            <circle cx="7" cy="7" r="0.9" fill="oklch(0.65 0.11 72)" opacity="0.8"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="100" height="140" fill="url(#diaback)"/>
        <rect x="0" y="0" width="100" height="140" fill="none"
              stroke="oklch(0.62 0.10 72)" stroke-width="1.2" opacity="0.85"/>
        <rect x="3" y="3" width="94" height="134" fill="none"
              stroke="oklch(0.62 0.10 72)" stroke-width="0.5" opacity="0.7"/>
      </svg>
    </div>

    <!-- Face-up: ivory stock with Didone indices + center pip -->
    <div
      v-else
      :class="['card-face absolute inset-0 overflow-hidden', sz.radius]"
      :style="{ color: inkColor }"
    >
      <!-- top-left index -->
      <div class="absolute left-[7%] top-[5%] flex flex-col items-center leading-none font-display">
        <span :class="[sz.rank, 'font-semibold tracking-tight']">{{ rank }}</span>
        <span :class="[sz.pip, 'mt-[1px]']">{{ suitChar }}</span>
      </div>
      <!-- bottom-right index (rotated) -->
      <div class="absolute right-[7%] bottom-[5%] flex flex-col items-center leading-none rotate-180 font-display">
        <span :class="[sz.rank, 'font-semibold tracking-tight']">{{ rank }}</span>
        <span :class="[sz.pip, 'mt-[1px]']">{{ suitChar }}</span>
      </div>
      <!-- center pip -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span :class="[sz.center, 'leading-none font-display']">{{ suitChar }}</span>
      </div>
    </div>

    <!-- PNG overlay (fades in if it loads successfully). Loaded for face-up cards and
         face-down backs alike; the CSS face/back underneath is the fallback if the PNG fails. -->
    <img
      v-if="card || faceDown"
      :src="assetUrl"
      alt=""
      :class="['absolute inset-0 h-full w-full object-cover transition-opacity duration-200', sz.radius]"
      :style="{ opacity: imageLoaded ? 1 : 0 }"
      @load="imageLoaded = true"
      @error="imageLoaded = false"
    />
  </div>
</template>

<style scoped>
.card-frame {
  background: var(--card-ivory);
  box-shadow:
    inset 0 0 0 1px var(--card-ivory-edge),
    inset 0 1px 0 oklch(1 0 0 / 0.7),
    0 1px 0 oklch(0 0 0 / 0.15),
    0 8px 18px var(--card-shadow),
    0 2px 4px oklch(0.10 0.02 30 / 0.4);
}
.card-face {
  background:
    radial-gradient(ellipse 80% 70% at 50% 20%, oklch(1 0 0 / 0.5), transparent 60%),
    linear-gradient(180deg, var(--card-ivory), oklch(0.93 0.020 84));
}
.card-back {
  background:
    radial-gradient(ellipse 80% 70% at 50% 20%, oklch(0.45 0.18 25), oklch(0.22 0.10 25) 80%);
  box-shadow:
    inset 0 0 0 1px oklch(0.55 0.10 72 / 0.6),
    inset 0 1px 0 oklch(1 0 0 / 0.15);
}

/* Deal animation: card flies in from above with a slight horizontal sweep + face-flip.
   Triggered every time the Card element mounts (parents use a key bound to the card id
   so a real deal causes a remount). */
.card-dealt {
  animation: card-deal 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--deal-delay, 0ms);
  transform-origin: 50% 50%;
  will-change: transform, opacity;
}
@keyframes card-deal {
  0% {
    transform: translate3d(-30px, -180px, 0) rotate(-14deg);
    opacity: 0;
  }
  60% {
    opacity: 1;
  }
  100% {
    transform: translate3d(0, 0, 0) rotate(0);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .card-dealt { animation: none; }
}
</style>
