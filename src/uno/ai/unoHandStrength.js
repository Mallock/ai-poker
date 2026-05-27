import { cardLabel, cardValue, isWild } from '../engine/cards.js'

// Produce a compact, human-readable description of the viewer's hand alongside the
// current discard. Used to keep the user message short and easy for the model to scan.
//
// Example output:
//   "5 cards: Red 3, Red 7, Blue 9, Wild, Wild Draw 4 — 2 playable on top Red 5 (Red 3, Red 7), 1 wild reserve"
export function describeUnoHand(view) {
  const hand = view?.self?.hand ?? []
  if (hand.length === 0) return '(no cards)'

  const top = view.discardTop
  const activeColor = view.activeColor
  const playableIdx = []
  hand.forEach((c, i) => {
    if (isCardPlayable(c, top, activeColor)) playableIdx.push(i)
  })
  const wildReserve = hand.filter(isWild).length
  const totalValue = hand.reduce((acc, c) => acc + cardValue(c), 0)
  const labels = hand.map((c) => cardLabel(c)).join(', ')
  const topLabel = top ? cardLabel(top) : '(none)'
  const playableLabels = playableIdx.map((i) => `[${i}] ${cardLabel(hand[i])}`).join(', ')
  const playableStr = playableIdx.length > 0
    ? `${playableIdx.length} playable on top ${topLabel} (${playableLabels})`
    : `none playable on top ${topLabel} — you must draw`
  return `${hand.length} cards (sum ${totalValue}): ${labels} — ${playableStr}, ${wildReserve} wild reserve`
}

function isCardPlayable(card, top, activeColor) {
  if (!card) return false
  if (card.value === 'wild' || card.value === 'wild_draw4') return true
  if (!top) return false
  if (activeColor && card.color === activeColor) return true
  if (card.value === top.value) return true
  return false
}
