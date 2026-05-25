import { buildFullDeck } from './cards.js'
import { createRng } from './rng.js'

// Fisher-Yates shuffle using the supplied RNG (mutates the input array).
export function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function freshShuffledDeck(rngOrSeed) {
  const rng = (typeof rngOrSeed === 'object' && rngOrSeed?.next)
    ? rngOrSeed
    : createRng(rngOrSeed)
  return shuffleInPlace(buildFullDeck(), rng)
}

// Draw `n` cards from the top of the deck. Mutates the deck.
export function draw(deck, n = 1) {
  if (deck.length < n) throw new Error(`Deck underflow: requested ${n}, have ${deck.length}`)
  return deck.splice(0, n)
}
