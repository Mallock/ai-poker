// Builds the "what hand do I have right now?" summary for the human player. The Seat
// component uses this to (a) render a one-line label above the human's hole/upcards and
// (b) highlight which of their cards are part of the best 5 the solver picked.

import { describeHandStrength, describePreflopHand, describeStudHand } from './handStrength.js'

// Returns { label, bestCards: Set<string>, isPreflop } or null when there's nothing
// meaningful to show (folded, eliminated, hand not yet dealt).
//
// `bestCards` is a Set of normalised "RankSuit" strings (uppercase both) that the parent
// can membership-test against any of the human's cards to decide whether to highlight.
export function describeHumanHud(state, humanId) {
  if (!state || !humanId) return null
  const human = state.players.find((p) => p.id === humanId)
  if (!human || human.folded || human.eliminated) return null
  if (!Array.isArray(human.cards) || human.cards.length === 0) return null

  if (state.gameType === 'stud') {
    return studHud(state, human)
  }
  return holdemHud(state, human)
}

function holdemHud(state, human) {
  const holeCards = human.cards.map((c) => c.card)
  const community = state.communityCards ?? []
  if (community.length < 3) {
    // Preflop / dealing: only a starting-hand label is meaningful.
    const label = describePreflopHand(holeCards)
    return label ? { label, bestCards: new Set(), isPreflop: true } : null
  }
  const summary = describeHandStrength(holeCards, community)
  if (!summary?.made) return null
  const drawSuffix = summary.draws && summary.draws.length > 0
    ? ` (+ ${summary.draws.join(', ')})`
    : ''
  return {
    label: summary.made.descr + drawSuffix,
    bestCards: normaliseCards(summary.made.cards),
    isPreflop: false,
  }
}

function studHud(state, human) {
  const opponentUpCards = state.players
    .filter((p) => p.id !== human.id)
    .map((p) => (p.cards ?? []).filter((c) => c.visibility === 'public').map((c) => c.card))
  const result = describeStudHand({
    selfCards: human.cards,
    communityCards: state.communityCards ?? [],
    opponentUpCards,
  })
  if (!result) return null
  // Prefer the made hand descriptor once we're past 3rd street; on 3rd street there are
  // only 3 cards so the structural label (split pair / three-flush / etc.) is what we want.
  if (result.made) {
    return {
      label: result.made.descr,
      bestCards: normaliseCards(result.made.cards),
      isPreflop: false,
    }
  }
  if (result.structure) {
    return { label: result.structure, bestCards: new Set(), isPreflop: true }
  }
  return null
}

// Pokersolver returns cards like "Ks" (lowercase suit). The rest of the codebase uses
// uppercase ("KS"), so normalise to uppercase + the codebase's "T" for tens, and return
// a Set for O(1) membership tests in the template.
function normaliseCards(cards) {
  const out = new Set()
  if (!Array.isArray(cards)) return out
  for (const c of cards) {
    if (typeof c !== 'string' || c.length < 2) continue
    let rank = c.slice(0, -1).toUpperCase()
    const suit = c.slice(-1).toUpperCase()
    if (rank === '10') rank = 'T'
    out.add(rank + suit)
  }
  return out
}
