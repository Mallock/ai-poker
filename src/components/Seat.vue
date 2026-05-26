<script setup>
import { ref, computed } from 'vue'
import Card from './Card.vue'
import PortraitPlaceholder from './PortraitPlaceholder.vue'
import SpeechBubble from './SpeechBubble.vue'
import { useUiStore } from '../stores/ui.js'
import { useAiStore } from '../stores/ai.js'
import { storeToRefs } from 'pinia'

const props = defineProps({
  player: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  isHuman: { type: Boolean, default: false },
  isDealer: { type: Boolean, default: false },
  showHoleCards: { type: Boolean, default: false },
  // 'top' | 'side' | 'bottom' — which arc of the table this seat sits on. Drives bubble
  // direction so top-arc seats render the speech bubble BELOW the portrait (otherwise it
  // would fly off the table edge).
  anchor: { type: String, default: 'side' },
})

const portraitError = ref(false)
const portraitUrl = computed(() => `/portraits/${props.player.characterId ?? 'human'}.png`)

// Build the displayed card row from the new `cards: [{ card, visibility }]` shape.
// For opponents: private cards are face-down (null), public cards are face-up.
// For the human (or at showdown): all cards are face-up.
const displayedCards = computed(() => {
  const cards = props.player.cards
  if (!Array.isArray(cards) || cards.length === 0) {
    // Hold'em-style placeholder for in-progress hands before deal: two face-downs.
    return [
      { face: null, visibility: 'private' },
      { face: null, visibility: 'private' },
    ]
  }
  return cards.map((c) => ({
    face: c.card,
    visibility: c.visibility,
  }))
})

const reveal = computed(() => props.showHoleCards || props.isHuman)

// Folded opponents keep their face-up cards visible (standard for stud — folded upcards are
// public information). Folded Hold'em players have no public cards, so the row disappears.
const shownCards = computed(() => {
  if (props.player.folded && !props.isHuman) {
    return displayedCards.value.filter((c) => c.visibility === 'public')
  }
  return displayedCards.value
})

const ui = useUiStore()
const ai = useAiStore()
const { activeBubbles } = storeToRefs(ui)
const { currentHandReasoning, activeEntryId } = storeToRefs(ai)

const bubbleText = computed(() => {
  if (!props.player.characterId) return null
  return activeBubbles.value[props.player.characterId]?.text ?? null
})

// Latest reasoning entry for THIS character in the current hand.
const entry = computed(() => {
  if (!props.player.characterId) return null
  const entries = currentHandReasoning.value.filter((e) => e.characterId === props.player.characterId)
  return entries.length ? entries[entries.length - 1] : null
})

const isThinking = computed(() => entry.value && entry.value.id === activeEntryId.value)

// Show the reasoning dialog ONLY for the seat currently thinking (avoids cluttering the table
// with stale dialogs from every player who has acted).
const showReasoningDialog = computed(() => isThinking.value)

const thinkPreview = computed(() => {
  const text = entry.value?.think ?? ''
  if (!text) return ''
  // Last ~120 chars so we see the freshest streaming reasoning.
  const tail = text.length > 120 ? '…' + text.slice(-120) : text
  return tail.replace(/\s+/g, ' ').trim()
})
</script>

<template>
  <div
    :class="[
      'flex flex-col items-center gap-2 px-3 py-2 transition-opacity duration-300',
      player.folded ? 'opacity-40 grayscale' : '',
      player.eliminated ? 'opacity-25 grayscale' : '',
    ]"
  >
    <!-- SpeechBubble is positioned relative to the SEAT container (not the portrait
         wrapper) so 'below' mode lands beneath the hole cards instead of overlapping the
         name/stack text. Top-arc seats use 'below' so the bubble never flies off the
         table edge. -->
    <SpeechBubble
      v-if="bubbleText"
      :text="bubbleText"
      :position="anchor === 'top' ? 'below' : 'above'"
    />

    <div class="relative">
      <div
        v-if="isThinking"
        class="absolute -top-2 -right-2 z-10 flex h-6 items-center gap-1.5 rounded-full bg-[oklch(0.32_0.10_280)] px-2.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-md ring-1 ring-[oklch(0.58_0.16_280/0.7)]"
      >
        <span class="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
        Thinking
      </div>

      <!-- Portrait with brass ring + active state. Active scales the ring slightly so the
           focal player stands out without pushing layout around. -->
      <div
        :class="[
          'portrait-ring relative h-24 w-24 overflow-hidden rounded-full transition-transform duration-300',
          isActive ? 'portrait-active scale-110' : '',
        ]"
      >
        <div class="absolute inset-[3px] overflow-hidden rounded-full bg-[oklch(0.18_0.02_60)]">
          <img
            v-if="!portraitError && !isHuman"
            :src="portraitUrl"
            alt=""
            class="h-full w-full object-cover"
            @error="portraitError = true"
          />
          <PortraitPlaceholder
            v-else
            :name="player.name"
            :id="player.characterId ?? player.id"
          />
        </div>
      </div>

      <!-- Dealer button: classic ivory disc -->
      <div
        v-if="isDealer"
        class="dealer-btn absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full font-display text-sm font-bold"
      >
        D
      </div>
      <div
        v-if="player.allIn"
        class="absolute -top-2 left-1/2 -translate-x-1/2 rounded-sm bg-[oklch(0.42_0.18_25)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow ring-1 ring-[oklch(0.55_0.18_25/0.6)]"
      >
        All-In
      </div>
      <div
        v-if="player.eliminated"
        class="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-sm bg-[oklch(0.25_0.02_60)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-300"
      >
        Out
      </div>
    </div>

    <div class="text-center">
      <div class="font-display text-[15px] font-semibold leading-tight tracking-wide text-ink-100">{{ player.name }}</div>
      <div class="num-tab font-display text-[15px] font-medium text-[oklch(0.78_0.08_82)]">
        {{ player.stack.toLocaleString() }}
      </div>
    </div>

    <div v-if="!player.eliminated && shownCards.length > 0" class="flex gap-1.5">
      <Card
        v-for="(c, i) in shownCards"
        :key="c.face ? `${player.id}-${c.face}-${i}` : `${player.id}-hole-${i}`"
        :card="c.visibility === 'public' ? c.face : (reveal ? c.face : null)"
        :face-down="c.visibility === 'private' && !reveal"
        :size="isHuman ? 'lg' : 'md'"
        :class="isHuman && c.visibility === 'private' ? 'tilt-down' : ''"
        :style="{ '--deal-delay': `${i * 100}ms` }"
      />
    </div>

    <!-- Inline reasoning preview: appears below the seat ONLY for the seat currently
         thinking. Absolutely positioned so mounting/unmounting it does NOT change the
         seat's bounding box (otherwise the parent's translate(-50%,-50%) would yank the
         portrait up/down each time). -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showReasoningDialog"
        class="reasoning-bubble absolute left-1/2 top-full mt-2 w-[220px] -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug italic text-ink-200"
      >
        <span v-if="thinkPreview">{{ thinkPreview }}</span>
        <span v-else class="text-ink-400">Waiting for first token…</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.portrait-ring {
  background: linear-gradient(180deg, var(--brass-hi), var(--brass-mid) 60%, var(--brass-lo));
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.6),
    inset 0 -1px 0 oklch(0.30 0.05 65 / 0.7),
    0 4px 10px oklch(0 0 0 / 0.5);
}
.portrait-active {
  background: linear-gradient(180deg, oklch(0.88 0.14 85), oklch(0.65 0.15 75) 60%, oklch(0.45 0.10 70));
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.7),
    inset 0 -1px 0 oklch(0.30 0.05 65 / 0.7),
    0 0 0 1px oklch(0.85 0.14 82 / 0.6),
    0 0 26px oklch(0.78 0.14 80 / 0.65),
    0 6px 14px oklch(0 0 0 / 0.55);
}
.dealer-btn {
  background: radial-gradient(circle at 40% 30%, oklch(0.98 0.01 84), oklch(0.86 0.02 80) 70%, oklch(0.72 0.02 78));
  color: oklch(0.20 0.03 50);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.8),
    inset 0 -1px 0 oklch(0.55 0.02 70 / 0.5),
    0 2px 4px oklch(0 0 0 / 0.5);
}
.tilt-down {
  transform: rotate(-3deg);
  filter: brightness(0.92);
}
.reasoning-bubble {
  background: linear-gradient(180deg, oklch(0.18 0.025 40 / 0.92), oklch(0.12 0.018 35 / 0.92));
  border: 1px solid oklch(0.34 0.05 60 / 0.5);
  box-shadow:
    inset 0 1px 0 oklch(0.50 0.04 60 / 0.3),
    0 8px 18px oklch(0 0 0 / 0.55);
  backdrop-filter: blur(6px);
}
</style>
