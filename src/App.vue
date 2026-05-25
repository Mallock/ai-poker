<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import Table from './components/Table.vue'
import Setup from './components/Setup.vue'
import ResearchPanel from './components/ResearchPanel.vue'
import { useGameStore } from './stores/game.js'
import { useUiStore } from './stores/ui.js'

const game = useGameStore()
const ui = useUiStore()
const { engineState, humanLegalActions, tournamentComplete, paused } = storeToRefs(game)
const { researchPanelOpen } = storeToRefs(ui)

const view = ref('setup') // 'setup' | 'table'

function onSetupStart(config) {
  game.startTournament(config)
  view.value = 'table'
}

function backToSetup() {
  game.pause()
  ui.clearAllBubbles()
  view.value = 'setup'
}

function handleAction(payload) {
  game.submitHumanAction(payload)
}

function togglePause() {
  if (game.paused) game.resume()
  else game.pause()
}

const winnerName = computed(() => {
  if (!engineState.value) return null
  const survivors = engineState.value.players.filter((p) => !p.eliminated)
  return survivors[0]?.name ?? null
})

const currentBlinds = computed(() => {
  if (!engineState.value) return null
  return engineState.value.blindSchedule[engineState.value.blindLevel]
})
</script>

<template>
  <main class="flex h-full flex-col">
    <header class="app-header flex items-center justify-between px-6 py-3">
      <div class="flex items-baseline gap-3">
        <h1 class="font-display text-[20px] font-medium tracking-wide text-ink-100">
          <span class="italic text-[oklch(0.82_0.09_82)]">Ai</span> Poker
        </h1>
        <span class="font-display text-[11px] uppercase tracking-[0.32em] text-[oklch(0.62_0.06_82/0.7)]">
          High Stakes Lounge
        </span>
      </div>
      <div class="flex items-center gap-3 text-[11px] text-ink-300">
        <span v-if="currentBlinds && view === 'table'" class="num-tab font-display tracking-wide text-[oklch(0.78_0.07_82)]">
          <span class="text-[10px] uppercase tracking-[0.2em] text-ink-400">Blinds</span>
          {{ currentBlinds.smallBlind }} / {{ currentBlinds.bigBlind }}
        </span>
        <template v-if="view === 'table'">
          <button class="hdr-btn" @click="togglePause">{{ paused ? 'Resume' : 'Pause' }}</button>
          <button class="hdr-btn" @click="ui.toggleResearchPanel()">
            {{ researchPanelOpen ? 'Hide panel' : 'Show panel' }}
          </button>
          <button class="hdr-btn" @click="backToSetup">New tournament</button>
        </template>
      </div>
    </header>

    <section class="flex flex-1 overflow-hidden">
      <div class="flex-1 overflow-hidden">
        <Setup v-if="view === 'setup'" @start="onSetupStart" />

        <div v-else-if="tournamentComplete" class="flex h-full items-center justify-center">
          <div class="winner-card rounded-2xl px-12 py-10 text-center">
            <div class="font-display text-[11px] uppercase tracking-[0.4em] text-[oklch(0.68_0.07_82)]">Tournament</div>
            <h2 class="mt-2 font-display text-[36px] font-medium tracking-wide text-ink-100">Over</h2>
            <p class="mt-4 text-ink-200">
              Winner
              <span class="block mt-1 font-display text-[24px] font-semibold tracking-wide text-[oklch(0.82_0.09_82)]">
                {{ winnerName }}
              </span>
            </p>
            <button class="hdr-btn mt-6 px-6 py-2 text-[12px]" @click="backToSetup">New tournament</button>
          </div>
        </div>

        <div v-else class="px-6 py-4">
          <Table
            :state="engineState"
            :legal-actions="humanLegalActions"
            :human-id="game.humanId"
            @action="handleAction"
          />
        </div>
      </div>

      <ResearchPanel v-if="view === 'table'" />
    </section>
  </main>
</template>

<style scoped>
.app-header {
  background: linear-gradient(180deg, oklch(0.16 0.025 32), oklch(0.12 0.018 32));
  border-bottom: 1px solid oklch(0.30 0.04 50 / 0.5);
  box-shadow:
    inset 0 1px 0 oklch(0.55 0.04 60 / 0.25),
    0 2px 8px oklch(0 0 0 / 0.4);
}
.hdr-btn {
  font-family: 'Public Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 6px 12px;
  border-radius: 5px;
  color: oklch(0.86 0.04 80);
  background: linear-gradient(180deg, oklch(0.24 0.03 45), oklch(0.16 0.02 40));
  border: 1px solid oklch(0.32 0.035 50 / 0.6);
  box-shadow:
    inset 0 1px 0 oklch(0.45 0.04 60 / 0.3),
    0 2px 4px oklch(0 0 0 / 0.4);
  transition: filter 120ms ease, transform 120ms ease;
}
.hdr-btn:hover { filter: brightness(1.15); }
.hdr-btn:active { transform: translateY(1px); }

.winner-card {
  background: linear-gradient(180deg, oklch(0.20 0.030 40), oklch(0.13 0.020 35));
  border: 1px solid oklch(0.42 0.07 78 / 0.4);
  box-shadow:
    inset 0 1px 0 oklch(0.55 0.06 70 / 0.35),
    0 30px 60px oklch(0 0 0 / 0.6);
}
</style>
