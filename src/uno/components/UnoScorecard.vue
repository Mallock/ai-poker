<script setup>
import { computed } from 'vue'
import { cardValue, cardLabel } from '../engine/cards.js'

const props = defineProps({
  matchState: { type: Object, required: true },
  finalCard: { type: Boolean, default: false }, // when true, show the match-end card instead
})
const emit = defineEmits(['next', 'newMatch'])

const result = computed(() => props.matchState.lastRoundResult ?? null)
const winnerName = computed(() => {
  if (!result.value) return ''
  return props.matchState.seats[result.value.winnerSeatIndex]?.name ?? '?'
})
</script>

<template>
  <div class="overlay">
    <div class="card">
      <div v-if="!finalCard" class="title-block">
        <div class="kicker">Round {{ result?.roundNumber ?? '?' }} of {{ matchState.totalRounds }}</div>
        <h2 class="title">Round to <span class="highlight">{{ winnerName }}</span></h2>
        <p class="points">+{{ result?.points ?? 0 }} points</p>
      </div>
      <div v-else class="title-block">
        <div class="kicker">Match</div>
        <h2 class="title">Winner: <span class="highlight">{{ matchState.seats[matchState.matchWinnerSeatIndex]?.name }}</span></h2>
      </div>

      <table class="score-table">
        <thead>
          <tr>
            <th>Seat</th>
            <th>Cards left</th>
            <th>Round value</th>
            <th>Cumulative</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(seat, i) in matchState.seats" :key="seat.id" :class="i === result?.winnerSeatIndex ? 'is-winner' : ''">
            <td>{{ seat.name }}</td>
            <td>{{ matchState.hands[i].length }}</td>
            <td>{{ result?.perSeatRemainingValues?.[i] ?? 0 }}</td>
            <td>{{ matchState.scores[i] }}</td>
          </tr>
        </tbody>
      </table>

      <div class="actions">
        <button v-if="!finalCard" class="btn-next" @click="emit('next')">Next round</button>
        <button v-else class="btn-next" @click="emit('newMatch')">New match</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0;
  background: oklch(0 0 0 / 0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 40;
}
.card {
  background: linear-gradient(180deg, oklch(0.20 0.030 40), oklch(0.14 0.020 35));
  border: 1px solid oklch(0.42 0.07 78 / 0.4);
  border-radius: 14px;
  padding: 24px 28px;
  min-width: 420px;
  box-shadow: 0 30px 60px oklch(0 0 0 / 0.6);
}
.title-block { text-align: center; margin-bottom: 16px; }
.kicker {
  font-family: 'Public Sans', sans-serif;
  font-size: 11px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: oklch(0.68 0.07 82);
}
.title {
  font-family: 'Public Sans', sans-serif;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: oklch(0.92 0.04 80);
  margin-top: 4px;
}
.highlight { color: oklch(0.82 0.09 82); }
.points {
  font-size: 14px;
  color: oklch(0.78 0.05 78);
  margin-top: 6px;
}
.score-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: oklch(0.88 0.03 80);
}
.score-table th, .score-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid oklch(0.30 0.03 50 / 0.4);
}
.score-table th {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 10px;
  color: oklch(0.70 0.04 80);
}
.is-winner { background: oklch(0.30 0.10 82 / 0.2); }
.actions { display: flex; justify-content: flex-end; margin-top: 14px; }
.btn-next {
  font-family: 'Public Sans', sans-serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.06em;
  padding: 8px 18px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--brass-hi, oklch(0.84 0.16 82)), oklch(0.65 0.12 78));
  color: oklch(0.18 0.03 50);
  text-shadow: 0 1px 0 oklch(1 0 0 / 0.4);
  box-shadow: 0 2px 6px oklch(0 0 0 / 0.45);
  cursor: pointer;
}
.btn-next:hover { filter: brightness(1.1); }
</style>
