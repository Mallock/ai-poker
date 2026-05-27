import { COLORS, makeCard } from './cards.js'
import { createRng } from './rng.js'

// Per the spec: 4 colors × { one 0, two each of 1–9, two Skip, two Reverse, two Draw 2 }
// + 4 Wild + 4 Wild Draw 4 = 108 cards.
export function buildDeck() {
  const cards = []
  for (const color of COLORS) {
    cards.push(makeCard(color, 0, 'a'))
    for (let n = 1; n <= 9; n++) {
      cards.push(makeCard(color, n, 'a'))
      cards.push(makeCard(color, n, 'b'))
    }
    cards.push(makeCard(color, 'skip', 'a'))
    cards.push(makeCard(color, 'skip', 'b'))
    cards.push(makeCard(color, 'reverse', 'a'))
    cards.push(makeCard(color, 'reverse', 'b'))
    cards.push(makeCard(color, 'draw2', 'a'))
    cards.push(makeCard(color, 'draw2', 'b'))
  }
  for (let i = 1; i <= 4; i++) cards.push(makeCard('wild', 'wild', String(i)))
  for (let i = 1; i <= 4; i++) cards.push(makeCard('wild', 'wild_draw4', String(i)))
  return cards
}

// Fisher–Yates shuffle in place. Accepts an `Rng` from src/engine/rng.js (or any object
// with `.int(maxExclusive)`).
export function shuffle(deck, rng) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

// Resolve either a numeric/string seed or an Rng instance into an Rng.
function resolveRng(rngOrSeed) {
  if (rngOrSeed && typeof rngOrSeed.next === 'function') return rngOrSeed
  return createRng(rngOrSeed ?? Date.now())
}

export function freshShuffledDeck(rngOrSeed) {
  const rng = resolveRng(rngOrSeed)
  return shuffle(buildDeck(), rng)
}

// Deal `cardsPerSeat` cards (default 7) to each seat from the top of the deck. Mutates
// `deck`. Returns `{ hands, remainingDeck }` — `remainingDeck === deck` (same reference).
export function deal(deck, seats, cardsPerSeat = 7) {
  const seatCount = Array.isArray(seats) ? seats.length : seats
  const hands = Array.from({ length: seatCount }, () => [])
  // Standard Uno dealing order: one card at a time round-robin. The end result is the same
  // for shuffled decks but lots of player intuition assumes the round-robin form, so we
  // honor it for clarity rather than slicing seven cards at a time.
  for (let c = 0; c < cardsPerSeat; c++) {
    for (let s = 0; s < seatCount; s++) {
      hands[s].push(deck.shift())
    }
  }
  return { hands, remainingDeck: deck }
}
