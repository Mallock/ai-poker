<script setup>
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAiStore } from '../stores/ai.js'
import { useUiStore } from '../stores/ui.js'
import PortraitPlaceholder from './PortraitPlaceholder.vue'
import { getCharacter } from '../ai/characters.js'

const props = defineProps({
  player: { type: Object, required: true },
})

const ai = useAiStore()
const ui = useUiStore()
const { currentHandReasoning, activeEntryId } = storeToRefs(ai)
const { activeBubbles } = storeToRefs(ui)

const character = computed(() => getCharacter(props.player.characterId))

const portraitError = ref(false)
const portraitUrl = computed(() => `/portraits/${props.player.characterId ?? 'human'}.png`)
watch(portraitUrl, () => { portraitError.value = false })

// Latest reasoning entry for THIS character in the current hand.
const entry = computed(() => {
  const entries = currentHandReasoning.value.filter((e) => e.characterId === props.player.characterId)
  return entries.length ? entries[entries.length - 1] : null
})

const isThinking = computed(() => entry.value && entry.value.id === activeEntryId.value)

const bubbleText = computed(() => {
  if (!props.player.characterId) return null
  return activeBubbles.value[props.player.characterId]?.text ?? null
})

const thinkingExpanded = ref(false)
const reasoningEl = ref(null)

watch(
  () => entry.value?.think,
  () => {
    if (thinkingExpanded.value && reasoningEl.value) {
      reasoningEl.value.scrollTop = reasoningEl.value.scrollHeight
    }
  },
)

const thinkPreview = computed(() => {
  const text = entry.value?.think ?? ''
  if (!text) return ''
  // Last ~140 chars so we see the freshest reasoning as it streams.
  const tail = text.length > 140 ? '…' + text.slice(-140) : text
  return tail.replace(/\s+/g, ' ').trim()
})

const decisionLabel = computed(() => {
  const d = entry.value?.decision
  if (!d) return null
  const amt = d.amount ? ` ${d.amount}` : ''
  return `${d.action}${amt}`
})
</script>

<template>
  <div class="pointer-events-auto flex flex-col items-center gap-1.5 text-slate-100">
    <div class="relative">
      <!-- Speech bubble anchored above the portrait -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="bubbleText"
          class="absolute left-1/2 -top-4 -translate-x-1/2 -translate-y-full z-10 w-max max-w-[360px]"
        >
          <div class="relative rounded-2xl bg-white px-5 py-3 text-base text-slate-900 shadow-2xl">
            <p class="leading-snug">{{ bubbleText }}</p>
            <div class="absolute left-1/2 -bottom-2 h-0 w-0 -translate-x-1/2 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white" />
          </div>
        </div>
      </Transition>

      <!-- Glow ring while thinking -->
      <div
        v-if="isThinking"
        class="absolute inset-0 rounded-full ring-[6px] ring-[oklch(0.55_0.16_280/0.55)] animate-pulse"
      />
      <div class="spotlight-ring relative h-80 w-80 overflow-hidden rounded-full">
        <div class="absolute inset-[6px] overflow-hidden rounded-full bg-[oklch(0.18_0.02_60)]">
          <img
            v-if="!portraitError"
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
    </div>

    <div class="text-center">
      <div class="font-display text-[24px] font-medium leading-tight tracking-wide">{{ player.name }}</div>
      <div v-if="character?.archetype" class="mt-0.5 font-display text-[11px] uppercase tracking-[0.3em] text-[oklch(0.72_0.08_82/0.85)]">
        {{ character.archetype }}
      </div>
      <div class="num-tab mt-1.5 font-display text-[14px] tracking-wide text-[oklch(0.80_0.08_82)]">
        <span class="text-[10px] uppercase tracking-[0.2em] text-ink-400 mr-1">Stack</span>
        {{ player.stack.toLocaleString() }}<span v-if="player.currentBet > 0" class="text-ink-400"> · <span class="text-[10px] uppercase tracking-[0.2em] mr-0.5">bet</span><span class="text-[oklch(0.78_0.08_150)]">{{ player.currentBet.toLocaleString() }}</span></span>
      </div>
    </div>

    <!-- Status / decision pill -->
    <div class="flex items-center gap-2 text-xs">
      <span
        v-if="isThinking"
        class="flex items-center gap-1 rounded-full bg-indigo-500/80 px-2 py-1 text-white"
      >
        <span class="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
        Thinking
      </span>
      <span
        v-else-if="decisionLabel"
        class="rounded-full bg-emerald-500/30 px-2 py-1 font-mono text-emerald-200"
      >
        {{ decisionLabel }}
      </span>
    </div>

    <!-- Expandable reasoning — MTG-card style, sits on top of everything below -->
    <div
      v-if="entry?.think || entry?.content"
      :class="[
        'pointer-events-auto w-[min(440px,82vw)] overflow-hidden rounded-xl border-2 border-indigo-500/40 bg-slate-950 shadow-[0_18px_40px_rgba(0,0,0,0.7)]',
        thinkingExpanded ? '' : 'bg-slate-950/95',
      ]"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 border-b border-indigo-500/30 bg-gradient-to-r from-indigo-900/60 to-slate-900/60 px-3 py-2 text-xs text-slate-100 hover:from-indigo-900/80 hover:to-slate-900/80"
        @click="thinkingExpanded = !thinkingExpanded"
      >
        <span class="font-semibold uppercase tracking-wider text-indigo-200">Reasoning</span>
        <span class="text-slate-300">{{ thinkingExpanded ? '▴ collapse' : '▾ expand' }}</span>
      </button>
      <div
        v-if="!thinkingExpanded"
        class="line-clamp-2 px-3 py-2 text-sm italic text-slate-300"
      >
        {{ thinkPreview || 'Waiting for first token…' }}
      </div>
      <div
        v-else
        ref="reasoningEl"
        class="max-h-36 overflow-y-auto whitespace-pre-wrap bg-slate-950 px-3 py-2 font-mono text-[13px] leading-snug text-indigo-100"
      >
        {{ entry.think || entry.content || 'Waiting for first token…' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.spotlight-ring {
  background: linear-gradient(180deg, var(--brass-hi), var(--brass) 50%, var(--brass-lo));
  box-shadow:
    inset 0 2px 0 oklch(1 0 0 / 0.5),
    inset 0 -2px 0 oklch(0.30 0.05 65 / 0.7),
    0 0 0 1px oklch(0.40 0.06 65),
    0 0 60px oklch(0.55 0.12 80 / 0.35),
    0 18px 40px oklch(0 0 0 / 0.65);
}
</style>
