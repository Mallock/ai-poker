<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Seat from './Seat.vue'
import Card from './Card.vue'
import PotDisplay from './PotDisplay.vue'
import ActionControls from './ActionControls.vue'
import HandHistory from './HandHistory.vue'
import FlyingChip from './FlyingChip.vue'
import PlayerBet from './PlayerBet.vue'
import { computePots } from '../engine/sidePots.js'

const props = defineProps({
  state: { type: Object, required: true },
  humanId: { type: String, required: true },
  legalActions: { type: Object, default: () => ({}) },
  showAllHoleCards: { type: Boolean, default: false },
})
const emit = defineEmits(['action'])

const orderedPlayers = computed(() => {
  const players = props.state.players
  const humanIdx = players.findIndex((p) => p.id === props.humanId)
  if (humanIdx < 0) return players
  return [...players.slice(humanIdx), ...players.slice(0, humanIdx)]
})

// Hand-tuned seat layouts per player count, modelled on real race-track poker
// tables: seats live only on the long top/bottom edges and the short side edges —
// never in the corners — and the central band y ∈ [40, 64] is reserved for the
// community cards, pot display, and winner banner. Each entry holds the seat
// position (x, y), the bet-chip position (bx, by) placed between the seat and
// that reserved centre band, and an anchor that drives speech-bubble direction.
// Seat 0 is always the human at bottom-centre; remaining seats walk counter-
// clockwise (bottom-left → left → top → right → bottom-right). All numbers are
// percentages of the 1900×950 design canvas (see TABLE_W / TABLE_H below).
const LAYOUTS = {
  2: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 50, y: 18, bx: 50, by: 37, anchor: 'top'  },
  ],
  3: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 22, y: 22, bx: 34, by: 37, anchor: 'top'  },
    { x: 78, y: 22, bx: 66, by: 37, anchor: 'top'  },
  ],
  4: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 14, y: 50, bx: 28, by: 50, anchor: 'side' },
    { x: 50, y: 18, bx: 50, by: 37, anchor: 'top'  },
    { x: 86, y: 50, bx: 72, by: 50, anchor: 'side' },
  ],
  5: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 18, y: 68, bx: 30, by: 64, anchor: 'side' },
    { x: 24, y: 22, bx: 36, by: 37, anchor: 'top'  },
    { x: 76, y: 22, bx: 64, by: 37, anchor: 'top'  },
    { x: 82, y: 68, bx: 70, by: 64, anchor: 'side' },
  ],
  6: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 16, y: 70, bx: 30, by: 64, anchor: 'side' },
    { x: 16, y: 30, bx: 30, by: 38, anchor: 'side' },
    { x: 50, y: 18, bx: 50, by: 37, anchor: 'top'  },
    { x: 84, y: 30, bx: 70, by: 38, anchor: 'side' },
    { x: 84, y: 70, bx: 70, by: 64, anchor: 'side' },
  ],
  7: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 22, y: 72, bx: 33, by: 66, anchor: 'side' },
    { x: 13, y: 44, bx: 25, by: 46, anchor: 'side' },
    { x: 30, y: 20, bx: 38, by: 37, anchor: 'top'  },
    { x: 70, y: 20, bx: 62, by: 37, anchor: 'top'  },
    { x: 87, y: 44, bx: 75, by: 46, anchor: 'side' },
    { x: 78, y: 72, bx: 67, by: 66, anchor: 'side' },
  ],
  8: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 22, y: 74, bx: 33, by: 67, anchor: 'side' },
    { x: 12, y: 50, bx: 24, by: 50, anchor: 'side' },
    { x: 22, y: 22, bx: 33, by: 38, anchor: 'top'  },
    { x: 50, y: 18, bx: 50, by: 37, anchor: 'top'  },
    { x: 78, y: 22, bx: 67, by: 38, anchor: 'top'  },
    { x: 88, y: 50, bx: 76, by: 50, anchor: 'side' },
    { x: 78, y: 74, bx: 67, by: 67, anchor: 'side' },
  ],
  9: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 25, y: 75, bx: 34, by: 68, anchor: 'side' },
    { x: 13, y: 55, bx: 25, by: 53, anchor: 'side' },
    { x: 14, y: 28, bx: 26, by: 38, anchor: 'side' },
    { x: 36, y: 18, bx: 42, by: 37, anchor: 'top'  },
    { x: 64, y: 18, bx: 58, by: 37, anchor: 'top'  },
    { x: 86, y: 28, bx: 74, by: 38, anchor: 'side' },
    { x: 87, y: 55, bx: 75, by: 53, anchor: 'side' },
    { x: 75, y: 75, bx: 66, by: 68, anchor: 'side' },
  ],
  10: [
    { x: 50, y: 78, bx: 50, by: 70, anchor: 'side' },
    { x: 26, y: 75, bx: 34, by: 68, anchor: 'side' },
    { x: 12, y: 56, bx: 24, by: 54, anchor: 'side' },
    { x: 12, y: 32, bx: 24, by: 38, anchor: 'side' },
    { x: 28, y: 19, bx: 36, by: 37, anchor: 'top'  },
    { x: 50, y: 17, bx: 50, by: 36, anchor: 'top'  },
    { x: 72, y: 19, bx: 64, by: 37, anchor: 'top'  },
    { x: 88, y: 32, bx: 76, by: 38, anchor: 'side' },
    { x: 88, y: 56, bx: 76, by: 54, anchor: 'side' },
    { x: 74, y: 75, bx: 66, by: 68, anchor: 'side' },
  ],
}

function getSeat(index, total) {
  const layout = LAYOUTS[total] ?? LAYOUTS[10]
  return layout[index] ?? layout[layout.length - 1]
}

function seatPos(index, total) {
  const s = getSeat(index, total)
  return { x: s.x, y: s.y }
}

function seatAnchor(index, total) {
  return getSeat(index, total).anchor
}

function seatStyle(index, total) {
  const s = getSeat(index, total)
  return {
    left: `${s.x}%`,
    top: `${s.y}%`,
    transform: 'translate(-50%, -50%)',
  }
}

function betStyle(index, total) {
  const s = getSeat(index, total)
  return {
    left: `${s.bx}%`,
    top: `${s.by}%`,
    transform: 'translate(-50%, -50%)',
  }
}

// Uniform scaling: the inner table is laid out on a fixed 1900×950 canvas and
// scaled with a single CSS transform so every child (portraits, cards, chips)
// shrinks together instead of overflowing the felt on smaller viewports.
const TABLE_W = 1900
const TABLE_H = 950
const tableHostRef = ref(null)
const tableScale = ref(1)
let tableResizeObserver = null
function updateTableScale() {
  if (!tableHostRef.value) return
  const rect = tableHostRef.value.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  tableScale.value = Math.min(rect.width / TABLE_W, rect.height / TABLE_H)
}
onMounted(() => {
  updateTableScale()
  tableResizeObserver = new ResizeObserver(updateTableScale)
  tableResizeObserver.observe(tableHostRef.value)
})
onBeforeUnmount(() => {
  tableResizeObserver?.disconnect()
  tableResizeObserver = null
})

function denominationFor(amount) {
  if (amount >= 1000) return 'black'
  if (amount >= 500) return 'green'
  if (amount >= 100) return 'blue'
  if (amount >= 25) return 'red'
  return 'white'
}

const flyingChips = ref([])
let nextChipId = 0
const CHIP_FLY_MS = 700

watch(
  () => props.state.actionHistory.length,
  (newLen, oldLen = 0) => {
    if (newLen <= oldLen) return // hand reset or no growth
    for (let i = oldLen; i < newLen; i++) {
      const a = props.state.actionHistory[i]
      if (!a || !['call', 'raise', 'all-in'].includes(a.action)) continue
      if (!a.amount || a.amount <= 0) continue
      const idx = orderedPlayers.value.findIndex((p) => p.id === a.playerId)
      if (idx < 0) continue
      const { x, y } = seatPos(idx, orderedPlayers.value.length)
      const id = ++nextChipId
      flyingChips.value.push({
        id,
        fromX: x,
        fromY: y,
        denomination: denominationFor(a.amount),
      })
      setTimeout(() => {
        flyingChips.value = flyingChips.value.filter((c) => c.id !== id)
      }, CHIP_FLY_MS)
    }
  },
)

const pots = computed(() => {
  const computed = computePots(props.state)
  return computed.filter((p) => p.amount > 0).map((p, i) => ({
    amount: p.amount,
    label: i === 0 ? 'Main' : `Side ${i}`,
  }))
})

const humanIsActive = computed(() => props.state.toAct === props.humanId)

const showAtShowdown = computed(() =>
  props.showAllHoleCards
  || props.state.street === 'showdown'
  || props.state.street === 'handComplete'
)

// Street banner: announce each new street as it begins. (Skip 'showdown' — Vue batches
// the rapid river→showdown→handComplete transitions into one watcher call, and the winner
// panel itself signals showdown more clearly than a banner could.)
const STREET_LABEL = { flop: 'Flop', turn: 'Turn', river: 'River' }
const streetBanner = ref(null) // { label, key } or null
let streetBannerTimer = null
watch(
  () => props.state.street,
  (next, prev) => {
    if (next === prev) return
    const label = STREET_LABEL[next]
    if (!label) return
    streetBanner.value = { label, key: `${props.state.handNumber}-${next}` }
    clearTimeout(streetBannerTimer)
    streetBannerTimer = setTimeout(() => { streetBanner.value = null }, 1700)
  },
)

// Winner panel: read the latest 'award' entries for the current hand.
const handComplete = computed(() => props.state.street === 'handComplete')
const awardEntries = computed(() => {
  if (!handComplete.value) return []
  return props.state.actionHistory.filter(
    (a) => a.action === 'award' && a.handNumber === props.state.handNumber,
  )
})
// Last action per player on the CURRENT street (drives the action badge).
// We skip 'award' entries — they don't belong to a single street.
const lastActionByPlayer = computed(() => {
  const out = {}
  const street = props.state.street
  const handNumber = props.state.handNumber
  for (const a of props.state.actionHistory) {
    if (a.handNumber !== handNumber) continue
    if (a.action === 'award') continue
    if (a.street !== street) continue
    out[a.playerId] = a
  }
  return out
})

// The most recently logged action overall (last entry in the history) — drives the
// "just acted" flash so the user can spot who just moved at a glance.
const mostRecentActorId = computed(() => {
  for (let i = props.state.actionHistory.length - 1; i >= 0; i--) {
    const a = props.state.actionHistory[i]
    if (a.handNumber !== props.state.handNumber) continue
    if (a.action === 'award') continue
    return a.playerId
  }
  return null
})

const winnerSummary = computed(() => {
  const awards = awardEntries.value
  if (awards.length === 0) return null
  // awards[0] is the main pot by engine convention; later entries are side pots.
  const main = awards[0]
  const playerName = (id) => props.state.players.find((p) => p.id === id)?.name ?? id
  return {
    names: main.winners.map(playerName),
    amount: main.potAmount,
    uncontested: !!main.uncontested,
    hand: main.winningHand,
    sidePots: awards.slice(1).map((a) => ({
      amount: a.potAmount,
      names: a.winners.map(playerName),
    })),
  }
})
</script>

<template>
  <div class="relative h-full w-full">
    <!-- Table chrome: mahogany rail → brass outer rim → brass inner rim → felt.
         Outer host: an aspect-ratio box that fits the available width. The inner canvas
         is a fixed 1900×950 layout that we scale uniformly via CSS transform, so cards,
         chips, portraits, and seat positions all shrink together as the viewport shrinks
         instead of children overflowing the felt. -->
    <div
      ref="tableHostRef"
      class="relative mx-auto w-full"
      :style="{ aspectRatio: `${TABLE_W} / ${TABLE_H}`, maxWidth: `${TABLE_W}px`, maxHeight: `${TABLE_H}px` }"
    >
      <div
        class="absolute top-0 left-1/2"
        :style="{
          width: `${TABLE_W}px`,
          height: `${TABLE_H}px`,
          transform: `translateX(-50%) scale(${tableScale})`,
          transformOrigin: 'top center',
        }"
      >
      <!-- Mahogany rail (outer ring) — now a rounded rectangle so the corners become
           usable felt area and seats can be spaced along straight edges for less crowding. -->
      <div class="wood-rail absolute inset-0 rounded-[110px] shadow-rail">
        <!-- Brass outer hairline -->
        <div class="absolute inset-[2px] rounded-[108px] ring-1 ring-[oklch(0.55_0.09_70/0.55)]"></div>
        <!-- Brass inner rim (thick polished band) -->
        <div class="brass-rim absolute inset-[3.5%] rounded-[90px]"></div>
        <!-- Felt surface -->
        <div class="felt-weave absolute inset-[4.5%] overflow-hidden rounded-[80px] shadow-[inset_0_0_60px_oklch(0_0_0/0.55),inset_0_4px_12px_oklch(0_0_0/0.4)]"></div>
        <!-- Subtle brass keyline between rim and felt -->
        <div class="pointer-events-none absolute inset-[4.5%] rounded-[80px] ring-1 ring-[oklch(0.30_0.05_65/0.6)]"></div>
      </div>

      <!-- Centre of felt: community cards + pot (the visual focal point) -->
      <div class="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
        <div v-if="state.handNumber" class="font-display text-[11px] uppercase italic tracking-[0.3em] text-[oklch(0.68_0.06_82/0.7)]">
          Hand №{{ state.handNumber }}
        </div>
        <div class="flex gap-2.5">
          <Card
            v-for="(c, i) in state.communityCards.concat(Array(5 - state.communityCards.length).fill(null))"
            :key="c ? `${state.handNumber}-${c}` : `slot-${i}`"
            :card="c"
            :face-down="!c"
            size="lg"
            :style="{ '--deal-delay': `${i * 90}ms` }"
          />
        </div>
        <PotDisplay :pots="pots" />
      </div>

      <Seat
        v-for="(player, idx) in orderedPlayers"
        :key="player.id"
        :player="player"
        :is-active="state.toAct === player.id"
        :is-human="player.id === humanId"
        :is-dealer="state.players[state.dealerIndex]?.id === player.id"
        :show-hole-cards="showAtShowdown"
        :anchor="seatAnchor(idx, orderedPlayers.length)"
        class="absolute z-10"
        :style="seatStyle(idx, orderedPlayers.length)"
      />

      <!-- Bet chips + action badge in front of each player -->
      <PlayerBet
        v-for="(player, idx) in orderedPlayers"
        :key="player.id + '-bet'"
        :player="player"
        :last-action="lastActionByPlayer[player.id]"
        :is-most-recent="mostRecentActorId === player.id"
        class="absolute z-20"
        :style="betStyle(idx, orderedPlayers.length)"
      />

      <FlyingChip
        v-for="chip in flyingChips"
        :key="chip.id"
        :from-x="chip.fromX"
        :from-y="chip.fromY"
        :denomination="chip.denomination"
      />

      <!-- Street banner: brief announcement when each new street starts -->
      <div class="pointer-events-none absolute left-1/2 top-[18%] z-40 -translate-x-1/2">
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-3 scale-95"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition duration-300 ease-in"
          leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 -translate-y-1 scale-95"
        >
          <div
            v-if="streetBanner"
            :key="streetBanner.key"
            class="street-banner font-display text-[26px] font-medium tracking-[0.32em] uppercase"
          >
            {{ streetBanner.label }}
          </div>
        </Transition>
      </div>

      <!-- Winner panel: appears at handComplete with hand description + best 5 cards -->
      <div class="pointer-events-none absolute inset-x-0 top-[68%] z-40 flex justify-center">
        <Transition
          enter-active-class="transition duration-400 ease-out"
          enter-from-class="opacity-0 translate-y-3 scale-95"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="winnerSummary"
            :key="`winner-${state.handNumber}`"
            class="winner-banner rounded-2xl px-6 py-3 text-center"
          >
            <div class="font-display text-[10px] uppercase tracking-[0.4em] text-[oklch(0.68_0.07_82)]">
              {{ winnerSummary.uncontested ? 'Wins uncontested' : 'Winner' }}
            </div>
            <div class="mt-1 font-display text-[22px] font-medium tracking-wide text-[oklch(0.94_0.02_84)]">
              {{ winnerSummary.names.join(' & ') }}
              <span class="num-tab ml-2 font-display text-[18px] text-[oklch(0.80_0.09_82)]">
                +{{ winnerSummary.amount.toLocaleString() }}
              </span>
            </div>
            <div
              v-if="winnerSummary.hand"
              class="mt-1 font-display italic text-[14px] text-[oklch(0.84_0.04_82)]"
            >
              {{ winnerSummary.hand.descr }}
            </div>
            <div v-if="winnerSummary.hand" class="mt-2 flex justify-center gap-1.5">
              <Card
                v-for="c in winnerSummary.hand.cards"
                :key="`win-${c}`"
                :card="c"
                :face-down="false"
                size="sm"
              />
            </div>
            <div
              v-for="(sp, i) in winnerSummary.sidePots"
              :key="`sp-${i}`"
              class="mt-1.5 text-[11px] text-ink-300"
            >
              Side {{ i + 1 }}: {{ sp.names.join(' & ') }}
              <span class="num-tab ml-1 text-[oklch(0.78_0.08_82)]">+{{ sp.amount.toLocaleString() }}</span>
            </div>
          </div>
        </Transition>
      </div>
      </div>
    </div>

    <div class="mt-5 flex items-end justify-center gap-4">
      <HandHistory
        :history="state.actionHistory"
        :players="state.players"
        :hand-number="state.handNumber"
        class="hidden w-64 lg:block"
      />
      <ActionControls
        :legal-actions="legalActions"
        :disabled="!humanIsActive"
        @action="emit('action', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.street-banner {
  color: oklch(0.92 0.04 84);
  text-shadow:
    0 0 24px oklch(0.55 0.12 80 / 0.6),
    0 2px 4px oklch(0 0 0 / 0.7);
  padding: 6px 22px;
  background: linear-gradient(180deg, oklch(0.20 0.04 35 / 0.7), oklch(0.12 0.025 30 / 0.6));
  border: 1px solid oklch(0.42 0.07 78 / 0.5);
  border-radius: 999px;
  backdrop-filter: blur(8px);
  box-shadow:
    inset 0 1px 0 oklch(0.55 0.06 70 / 0.4),
    0 12px 32px oklch(0 0 0 / 0.6),
    0 0 80px oklch(0.55 0.12 80 / 0.18);
}

.winner-banner {
  background: linear-gradient(180deg, oklch(0.20 0.030 40 / 0.96), oklch(0.13 0.020 35 / 0.96));
  border: 1px solid oklch(0.50 0.09 78 / 0.55);
  box-shadow:
    inset 0 1px 0 oklch(0.55 0.06 70 / 0.4),
    0 30px 60px oklch(0 0 0 / 0.7),
    0 0 60px oklch(0.55 0.12 80 / 0.2);
  backdrop-filter: blur(10px);
  min-width: 320px;
}
</style>
