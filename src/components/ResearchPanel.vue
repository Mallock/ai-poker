<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAiStore } from '../stores/ai.js'
import { useUiStore } from '../stores/ui.js'
import characters from '../ai/characters.js'
import { memoryState } from '../ai/characterMemory.js'

const ui = useUiStore()
const ai = useAiStore()
const { researchPanelOpen } = storeToRefs(ui)
const { currentHandReasoning, activeEntryId } = storeToRefs(ai)

const filterCharacterId = ref('all')
const collapsed = ref({}) // entryId → bool
const memorySectionOpen = ref(true)
const memoryCharCollapsed = ref({}) // characterId → bool

const filteredEntries = computed(() => {
  if (filterCharacterId.value === 'all') return currentHandReasoning.value
  return currentHandReasoning.value.filter((e) => e.characterId === filterCharacterId.value)
})

// Characters to render in the memory section, respecting the top-level filter.
const memoryCharacters = computed(() => {
  const ids = filterCharacterId.value === 'all'
    ? Object.keys(memoryState)
    : (memoryState[filterCharacterId.value] ? [filterCharacterId.value] : [])
  return ids
    .map((id) => ({ id, name: nameFor(id), memory: memoryState[id] }))
    .filter((c) => c.memory && (c.memory.handNotes.length > 0 || c.memory.longTerm))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const memoryHasAny = computed(() => memoryCharacters.value.length > 0)

function nameFor(characterId) {
  return characters.find((c) => c.id === characterId)?.name ?? characterId
}

function toggleEntry(id) {
  collapsed.value[id] = !collapsed.value[id]
}

function toggleMemoryChar(id) {
  memoryCharCollapsed.value[id] = !memoryCharCollapsed.value[id]
}
</script>

<template>
  <aside
    :class="[
      'h-full transition-all duration-300 overflow-hidden border-l border-slate-800 bg-slate-950/90',
      researchPanelOpen ? 'w-[380px]' : 'w-0',
    ]"
  >
    <div v-if="researchPanelOpen" class="flex h-full flex-col">
      <header class="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 class="text-sm font-semibold tracking-tight text-slate-100">Research panel</h2>
          <p class="text-[11px] text-slate-500">Live AI reasoning, current hand only</p>
        </div>
        <select
          v-model="filterCharacterId"
          class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
        >
          <option value="all">All characters</option>
          <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </header>

      <div class="flex-1 overflow-y-auto px-3 py-2">
        <section class="mb-3 rounded-xl border border-slate-800 bg-slate-900/40">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-t-xl px-3 py-2 text-left hover:bg-slate-800/40"
            @click="memorySectionOpen = !memorySectionOpen"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-300">Memory</span>
              <span class="text-[10px] text-slate-500">per character, this session</span>
            </div>
            <span class="text-xs text-slate-500">{{ memorySectionOpen ? '▾' : '▸' }}</span>
          </button>
          <div v-if="memorySectionOpen" class="px-3 pb-3">
            <div
              v-if="!memoryHasAny"
              class="rounded bg-slate-950/40 px-3 py-2 text-[11px] italic text-slate-500"
            >
              No memory yet — characters start writing notes after the first completed hand.
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="c in memoryCharacters"
                :key="c.id"
                class="rounded-lg border border-slate-800/80 bg-slate-950/50"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded-t-lg px-2 py-1.5 text-left hover:bg-slate-800/40"
                  @click="toggleMemoryChar(c.id)"
                >
                  <span class="text-[11px] font-semibold text-slate-200">{{ c.name }}</span>
                  <span class="text-[10px] text-slate-500">
                    {{ c.memory.handNotes.length }} note{{ c.memory.handNotes.length === 1 ? '' : 's' }}{{ c.memory.longTerm ? ' + long-term' : '' }}
                    <span class="ml-1">{{ memoryCharCollapsed[c.id] ? '▸' : '▾' }}</span>
                  </span>
                </button>
                <div v-if="!memoryCharCollapsed[c.id]" class="px-2 pb-2 pt-1">
                  <div
                    v-if="c.memory.longTerm"
                    class="mb-1.5 rounded bg-amber-950/30 px-2 py-1 text-[11px] leading-snug text-amber-100/90"
                  >
                    <div class="mb-0.5 text-[9px] uppercase tracking-wider text-amber-400/70">Lasting impressions</div>
                    {{ c.memory.longTerm }}
                  </div>
                  <ul v-if="c.memory.handNotes.length > 0" class="space-y-1">
                    <li
                      v-for="(n, i) in c.memory.handNotes"
                      :key="i"
                      class="rounded bg-slate-900/70 px-2 py-1 text-[11px] leading-snug text-slate-200"
                    >
                      <span v-if="n.handNumber != null" class="mr-1 font-mono text-[10px] text-slate-500">#{{ n.handNumber }}</span>{{ n.text }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div
          v-if="filteredEntries.length === 0"
          class="mt-10 px-4 text-center text-xs text-slate-500"
        >
          No AI has acted yet this hand.
        </div>

        <article
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="mb-3 rounded-xl border border-slate-800 bg-slate-900/60"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-t-xl px-3 py-2 text-left hover:bg-slate-800/60"
            @click="toggleEntry(entry.id)"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-slate-100">{{ nameFor(entry.characterId) }}</span>
              <span
                v-if="entry.id === activeEntryId"
                class="rounded-full bg-indigo-500/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white"
              >
                Thinking
              </span>
              <span
                v-else-if="entry.decision"
                class="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-200"
              >
                {{ entry.decision.action }}{{ entry.decision.amount ? ' ' + entry.decision.amount : '' }}
              </span>
              <span
                v-if="entry.error"
                class="rounded-full bg-rose-500/30 px-2 py-0.5 text-[10px] font-mono text-rose-200"
              >
                error
              </span>
            </div>
            <span class="text-xs text-slate-500">{{ collapsed[entry.id] ? '▸' : '▾' }}</span>
          </button>

          <div v-if="!collapsed[entry.id]" class="px-3 pb-3">
            <div v-if="entry.think" class="mb-2 whitespace-pre-wrap rounded bg-slate-950/60 p-2 font-mono text-[11px] leading-snug text-indigo-100/90">
              <div class="mb-1 text-[9px] uppercase tracking-wider text-indigo-400/70">Reasoning</div>
              {{ entry.think }}
              <span v-if="entry.id === activeEntryId" class="ml-0.5 inline-block h-3 w-1 animate-pulse bg-indigo-300/80 align-middle" />
            </div>
            <div v-if="entry.content && entry.content.trim()" class="mb-2 whitespace-pre-wrap rounded bg-slate-900/80 p-2 font-mono text-[11px] leading-snug text-emerald-100/90">
              <div class="mb-1 text-[9px] uppercase tracking-wider text-emerald-400/70">Reply</div>
              {{ entry.content }}
              <span v-if="entry.id === activeEntryId && !entry.think" class="ml-0.5 inline-block h-3 w-1 animate-pulse bg-emerald-300/80 align-middle" />
            </div>
            <div v-if="!entry.think && !entry.content && entry.id === activeEntryId" class="mb-2 rounded bg-slate-950/60 p-2 text-[11px] italic text-slate-500">
              Waiting for first token…
            </div>
            <div v-if="entry.decision?.say" class="mb-2 rounded bg-slate-800/60 px-2 py-1 text-xs italic text-amber-200">
              “{{ entry.decision.say }}”
            </div>
            <div v-if="entry.error" class="mt-1 text-[11px] text-rose-300">
              {{ entry.error }}
            </div>
          </div>
        </article>
      </div>
    </div>
  </aside>
</template>
