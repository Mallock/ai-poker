<script setup>
import { computed, ref, watch } from 'vue'
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

// Place seats evenly around the perimeter of a rounded-rectangle table, with index 0
// (the human) anchored at bottom-centre and remaining seats walking counter-clockwise.
// Spacing is in *pixel* terms (vertical edges weighted by 1/ASPECT) so adjacent seats
// land the same physical distance apart whether they're on a long edge or a short one.
const SEAT_INSET = 16          // % from table edge to the seat arc on all sides
const TABLE_ASPECT = 2         // table width / height — keep in sync with the aspect-[2/1] class
function seatPos(index, total) {
  const L = SEAT_INSET, R = 100 - SEAT_INSET, T = SEAT_INSET, B = 100 - SEAT_INSET
  const horizHalf = (R - L) / 2          // bottom (and top) half-edge length in width-%
  const vertEdge = (B - T) / TABLE_ASPECT // side length converted to width-equivalent %
  const topEdge  = (R - L)
  const perimeter = horizHalf * 2 + vertEdge * 2 + topEdge

  const d = (index / total) * perimeter
  let x, y
  if (d <= horizHalf) {
    // bottom edge, centre → left
    x = 50 - d; y = B
  } else if (d <= horizHalf + vertEdge) {
    // left edge, bottom → top
    x = L; y = B - (d - horizHalf) * TABLE_ASPECT
  } else if (d <= horizHalf + vertEdge + topEdge) {
    // top edge, left → right
    x = L + (d - horizHalf - vertEdge); y = T
  } else if (d <= horizHalf + vertEdge + topEdge + vertEdge) {
    // right edge, top → bottom
    x = R; y = T + (d - horizHalf - vertEdge - topEdge) * TABLE_ASPECT
  } else {
    // bottom edge, right → centre
    x = R - (d - horizHalf - vertEdge - topEdge - vertEdge); y = B
  }
  return { x, y }
}

// Top-edge seats get the speech bubble flipped to below the portrait so it doesn't
// fly off the table. Side and bottom seats keep the default above-portrait bubble.
function seatAnchor(index, total) {
  const { y } = seatPos(index, total)
  return y < 22 ? 'top' : 'side'
}

function seatStyle(index, total) {
  const { x, y } = seatPos(index, total)
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: 'translate(-50%, -50%)',
  }
}

// Bet chips sit between each seat and the table centre (along the radial),
// so each player has their committed chips visible in front of them.
const BET_RADIAL_OFFSET = 0.42 // 0 = at seat, 1 = at centre
function betStyle(index, total) {
  const { x, y } = seatPos(index, total)
  const cx = 50, cy = 50
  return {
    left: `${x + (cx - x) * BET_RADIAL_OFFSET}%`,
    top: `${y + (cy - y) * BET_RADIAL_OFFSET}%`,
    transform: 'translate(-50%, -50%)',
  }
}

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
         Wider aspect (2:1) + larger max-w give 10-player tables enough horizontal room
         for portraits, hole cards, chip stacks, and speech bubbles without crowding.
         max-h caps the table so it still fits a typical 1080p viewport. -->
    <div class="relative mx-auto aspect-[2/1] w-full max-w-[1900px] max-h-[920px]">
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
