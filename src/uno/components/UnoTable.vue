<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import UnoCard from './UnoCard.vue'
import UnoSeat from './UnoSeat.vue'
import UnoColorPicker from './UnoColorPicker.vue'
import UnoActionControls from './UnoActionControls.vue'
import UnoScorecard from './UnoScorecard.vue'
import SpeechBubble from '../../components/SpeechBubble.vue'
import { useUnoGameStore } from '../../stores/unoGame.js'
import { useUiStore } from '../../stores/ui.js'
import { isWild, cardLabel } from '../engine/cards.js'
import { tableBackgroundAsset } from '../engine/cardAssets.js'

const store = useUnoGameStore()
const { matchState, scorecardPending } = storeToRefs(store)
const { activeBubbles } = storeToRefs(useUiStore())

const humanIdx = computed(() => store.humanSeatIndex)
const view = computed(() => store.humanView)
const legalActions = computed(() => store.humanLegalActions ?? {
  plays: [], canDraw: false, canPass: false, canChallenge: false, canAccept: false,
  canCallUno: false, canCatchMissedUno: false, mustChooseStartingColor: false,
})

const isHumanTurn = computed(() => matchState.value && matchState.value.currentSeatIndex === humanIdx.value)

// "Mode" of the color picker: 'play' when bundling with a play action, 'starting' when
// resolving the round-opener Wild color.
const pickerMode = ref(null)
const pickerCardIndex = ref(null)
const pickerOpen = computed(() => pickerMode.value !== null
  || legalActions.value.mustChooseStartingColor)

// Indices of human-playable cards.
const playableSet = computed(() => new Set(legalActions.value.plays.map((p) => p.cardIndex)))

// Pretty arrows for direction.
const directionLabel = computed(() => {
  if (!matchState.value) return ''
  return matchState.value.direction === 1 ? '↻ Clockwise' : '↺ Counter-clockwise'
})

// Opponents arranged in clockwise order from the seat to the human's left.
const opponentsArc = computed(() => {
  if (!matchState.value) return []
  const seats = matchState.value.seats
  const n = seats.length
  const human = humanIdx.value
  if (human < 0) return []
  const order = []
  for (let i = 1; i < n; i++) {
    const idx = (human + i) % n
    order.push({ seat: seats[idx], seatIndex: idx, handSize: matchState.value.hands[idx].length })
  }
  return order
})

const discardTop = computed(() => {
  const m = matchState.value
  if (!m || m.discardPile.length === 0) return null
  return m.discardPile[m.discardPile.length - 1]
})

const activeColor = computed(() => view.value?.activeColor ?? null)

const showCallUno = computed(() => view.value?.legalActions.canCallUno ?? false)

const callUnoRef = ref(null) // ref to UnoActionControls for reading the checkbox + say draft

// Single submission point: bundle the optional table-talk draft (from the controls) into the
// action and clear it, so every human action — plays, draws, challenges — can carry a line.
function submit(action) {
  const say = (callUnoRef.value?.sayText || '').trim()
  store.submitHumanAction(say ? { ...action, say } : action)
  if (callUnoRef.value) callUnoRef.value.sayText = ''
}

function onCardClick(cardIndex) {
  if (!isHumanTurn.value) return
  if (!playableSet.value.has(cardIndex)) return
  const card = view.value.self.hand[cardIndex]
  if (isWild(card)) {
    pickerMode.value = 'play'
    pickerCardIndex.value = cardIndex
    return
  }
  submit({
    action: 'play',
    cardIndex,
    callUno: !!callUnoRef.value?.callUno,
  })
}

function onPickColor(color) {
  if (legalActions.value.mustChooseStartingColor) {
    submit({ action: 'chooseStartingColor', color })
    return
  }
  if (pickerMode.value === 'play' && pickerCardIndex.value !== null) {
    submit({
      action: 'play',
      cardIndex: pickerCardIndex.value,
      wildColor: color,
      callUno: !!callUnoRef.value?.callUno,
    })
    pickerMode.value = null
    pickerCardIndex.value = null
  }
}

function onPickerCancel() {
  pickerMode.value = null
  pickerCardIndex.value = null
}

function onAction(payload) {
  if (!matchState.value) return
  submit(payload)
}

const pendingWildDraw4ForHuman = computed(() => {
  const p = matchState.value?.pendingWildDraw4Challenge
  return !!p && p.victimSeatIndex === humanIdx.value
})

const pendingUnoCatchForHuman = computed(() => {
  const p = matchState.value?.pendingUnoCatch
  if (!p) return false
  return p.seatIndex !== humanIdx.value
})

const humanSeatId = computed(() => matchState.value?.seats[humanIdx.value]?.id ?? null)
const humanBubbleText = computed(() => {
  const k = humanSeatId.value
  return k ? (activeBubbles.value[k]?.text ?? null) : null
})

const bgUrl = computed(() => tableBackgroundAsset(((matchState.value?.roundNumber ?? 1) - 1) % 5))
</script>

<template>
  <div v-if="matchState" class="uno-table" :style="{ backgroundImage: `url(${bgUrl})` }">
    <!-- Header: round + scores -->
    <header class="uno-header">
      <div class="round-info">Round {{ matchState.roundNumber }} of {{ matchState.totalRounds }}</div>
      <div class="direction-info">{{ directionLabel }}</div>
      <div class="score-row">
        <span v-for="(seat, i) in matchState.seats" :key="seat.id" class="score-pill">
          {{ seat.name }}: <b>{{ matchState.scores[i] }}</b>
        </span>
      </div>
    </header>

    <!-- Upper arc: opponents -->
    <section class="opponent-arc">
      <UnoSeat
        v-for="opp in opponentsArc"
        :key="opp.seat.id"
        :seat="opp.seat"
        :seat-index="opp.seatIndex"
        :hand-size="opp.handSize"
        :is-active="matchState.currentSeatIndex === opp.seatIndex"
        :pending-uno-catch="matchState.pendingUnoCatch?.seatIndex === opp.seatIndex"
        anchor="top"
      />
    </section>

    <!-- Center: draw + discard piles -->
    <section class="center-piles">
      <div class="pile">
        <button
          class="draw-pile"
          :disabled="!isHumanTurn || !legalActions.canDraw"
          @click="onAction({ action: 'draw' })"
          :title="`Draw pile (${matchState.drawPile.length} cards)`"
        >
          <UnoCard face="down" size="lg" />
        </button>
        <div class="pile-label">Draw ({{ matchState.drawPile.length }})</div>
      </div>
      <div class="pile">
        <div :class="['discard-pile', activeColor ? `active-${activeColor}` : '']">
          <UnoCard v-if="discardTop" :card="discardTop.card" size="lg" />
        </div>
        <div class="pile-label">
          Discard
          <span v-if="discardTop && isWild(discardTop.card) && activeColor">
            — active: <b :style="{ color: colorHex(activeColor) }">{{ activeColor }}</b>
          </span>
        </div>
      </div>
    </section>

    <!-- Human hand row -->
    <section class="human-row">
      <div class="human-banner">
        <span class="human-name">{{ matchState.seats[humanIdx]?.name }}</span>
        <span class="human-handsize">{{ view?.self.handSize ?? 0 }} card{{ (view?.self.handSize ?? 0) === 1 ? '' : 's' }}</span>
        <SpeechBubble v-if="humanBubbleText" :text="humanBubbleText" position="above" />
      </div>
      <div class="human-hand">
        <UnoCard
          v-for="(card, i) in view?.self.hand ?? []"
          :key="card.id"
          :card="card"
          size="md"
          :playable="isHumanTurn && playableSet.has(i)"
          :dim="isHumanTurn && !playableSet.has(i)"
          @click="onCardClick(i)"
        />
      </div>

      <UnoActionControls
        ref="callUnoRef"
        :legal-actions="legalActions"
        :is-human-turn="isHumanTurn"
        :show-call-uno="showCallUno"
        :can-catch-missed-uno="pendingUnoCatchForHuman"
        :pending-wild-draw4="pendingWildDraw4ForHuman"
        @action="onAction"
      />
    </section>

    <UnoColorPicker
      :open="pickerOpen"
      :title="legalActions.mustChooseStartingColor ? 'Choose the starting color' : 'Choose a color for your Wild'"
      @pick="onPickColor"
      @cancel="onPickerCancel"
    />

    <UnoScorecard
      v-if="scorecardPending"
      :match-state="matchState"
      @next="store.dismissScorecard()"
    />

    <UnoScorecard
      v-if="matchState.matchComplete"
      :match-state="matchState"
      final-card
      @new-match="$emit('newMatch')"
    />
  </div>
</template>

<script>
function colorHex(c) {
  switch (c) {
    case 'red':    return '#d23028'
    case 'yellow': return '#e6b800'
    case 'green':  return '#1aa84a'
    case 'blue':   return '#1f6fb4'
    default:       return 'inherit'
  }
}
export default { name: 'UnoTable' }
</script>

<style scoped>
.uno-table {
  position: relative;
  min-height: 100%;
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-size: cover;
  background-position: center;
}
.uno-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
  padding: 8px 14px;
  border-radius: 10px;
  background: oklch(0.16 0.02 40 / 0.65);
  border: 1px solid oklch(0.30 0.035 50 / 0.5);
}
.round-info {
  font-family: 'Public Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: oklch(0.84 0.08 82);
  letter-spacing: 0.06em;
}
.direction-info {
  font-size: 12px;
  color: oklch(0.78 0.05 78);
  letter-spacing: 0.08em;
}
.score-row {
  display: flex; gap: 8px; flex-wrap: wrap;
}
.score-pill {
  font-size: 11px;
  color: oklch(0.86 0.04 80);
  background: oklch(0.18 0.02 45 / 0.7);
  padding: 3px 8px;
  border-radius: 4px;
}
.score-pill b { color: oklch(0.92 0.08 82); }

.opponent-arc {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}
.center-piles {
  display: flex; justify-content: center; gap: 36px; padding: 8px 0;
}
.pile { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.pile-label { font-size: 11px; color: oklch(0.78 0.06 80); letter-spacing: 0.08em; }
.draw-pile {
  border-radius: 9px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.draw-pile:disabled { cursor: default; opacity: 0.85; }
.discard-pile {
  position: relative;
  border-radius: 9px;
  padding: 2px;
}
.discard-pile.active-red    { box-shadow: 0 0 0 3px #d23028, 0 0 14px oklch(0.55 0.20 25 / 0.7); }
.discard-pile.active-yellow { box-shadow: 0 0 0 3px #e6b800, 0 0 14px oklch(0.82 0.20 90 / 0.7); }
.discard-pile.active-green  { box-shadow: 0 0 0 3px #1aa84a, 0 0 14px oklch(0.60 0.18 150 / 0.7); }
.discard-pile.active-blue   { box-shadow: 0 0 0 3px #1f6fb4, 0 0 14px oklch(0.55 0.18 240 / 0.7); }

.human-row {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: oklch(0.13 0.02 40 / 0.7);
  border: 1px solid oklch(0.30 0.035 50 / 0.5);
}
.human-banner {
  display: flex; align-items: baseline; gap: 12px;
}
.human-name { font-weight: 700; color: oklch(0.84 0.08 82); }
.human-handsize { font-size: 12px; color: oklch(0.78 0.05 78); }
.human-hand {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-end;
  min-height: 100px;
}
</style>
