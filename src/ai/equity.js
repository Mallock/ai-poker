// Monte Carlo equity estimator for the human player. Used to show "odds" on the table HUD
// so the user has a feel for how strong their hand is right now.
//
// Hold'em uses a strict (no-overlap) sample: the remaining community + every opponent's
// hole cards are drawn from the same shrinking deck within a trial, so the simulated trial
// is a valid runout the dealer could actually deliver.
//
// Stud uses an independent-sample approximation: at 3rd street with 8 active players the
// remaining deck is too thin to deal everyone the cards they still need (8 × 6 missing >
// 28 left). Sampling each player's missing cards independently from the same known-card
// exclusion pool keeps the sim valid at any street and any player count — at the cost of
// rare card collisions across opponents, which is a small bias the wider poker community
// also accepts in its own equity tools.
//
// Result shape: { win, tie, equity, samples, opponents } or null when the sim is skipped
// (human folded/eliminated/no contest yet).

import { Hand } from 'pokersolver'
import { buildFullDeck, toSolverCard } from '../engine/cards.js'

const DEFAULT_TRIALS = 250

export function estimateHumanEquity(state, humanId, opts = {}) {
  if (!state || !humanId) return null
  if (state.street === 'idle' || state.street === 'tournamentComplete') return null
  if (state.street === 'handComplete' || state.street === 'showdown') return null

  const human = state.players.find((p) => p.id === humanId)
  if (!human || human.folded || human.eliminated) return null

  const activeOpps = state.players.filter(
    (p) => p.id !== humanId && !p.folded && !p.eliminated,
  )
  if (activeOpps.length === 0) return null

  if (state.gameType === 'stud') {
    return monteCarloStud(state, human, activeOpps, opts)
  }
  return monteCarloHoldem(state, human, activeOpps, opts)
}

function monteCarloHoldem(state, human, activeOpps, opts) {
  const trials = opts.trials ?? DEFAULT_TRIALS
  const humanHole = (human.cards ?? []).map((c) => c.card)
  if (humanHole.length < 2) return null
  const community = [...state.communityCards]

  const known = new Set([...humanHole, ...community])
  const remainingDeck = buildFullDeck().filter((c) => !known.has(c))

  const communityNeeded = 5 - community.length
  const oppCount = activeOpps.length
  const sampleSize = communityNeeded + oppCount * 2
  if (remainingDeck.length < sampleSize) return null

  let wins = 0
  let ties = 0

  const workDeck = remainingDeck.slice()
  for (let t = 0; t < trials; t++) {
    partialShuffle(workDeck, sampleSize)
    const fullBoard = community.concat(workDeck.slice(0, communityNeeded))
    const humanHand = Hand.solve(humanHole.concat(fullBoard).map(toSolverCard))

    const allHands = [humanHand]
    let offset = communityNeeded
    for (let i = 0; i < oppCount; i++) {
      const hole = [workDeck[offset], workDeck[offset + 1]]
      offset += 2
      allHands.push(Hand.solve(hole.concat(fullBoard).map(toSolverCard)))
    }
    const winners = Hand.winners(allHands)
    if (winners.includes(humanHand)) {
      if (winners.length === 1) wins++
      else ties++
    }
  }
  return {
    win: wins / trials,
    tie: ties / trials,
    equity: (wins + ties * 0.5) / trials,
    samples: trials,
    opponents: oppCount,
  }
}

function monteCarloStud(state, human, activeOpps, opts) {
  const trials = opts.trials ?? DEFAULT_TRIALS
  const humanCards = (human.cards ?? []).map((c) => c.card)
  if (humanCards.length < 3) return null

  const community = [...(state.communityCards ?? [])]
  const known = new Set([...humanCards, ...community])
  for (const opp of activeOpps) {
    for (const c of (opp.cards ?? [])) {
      if (c.visibility === 'public') known.add(c.card)
    }
  }
  const remainingDeck = buildFullDeck().filter((c) => !known.has(c))
  if (remainingDeck.length === 0) return null

  const humanNeed = Math.max(0, 7 - humanCards.length - community.length)
  const oppInfo = activeOpps.map((opp) => {
    const upcards = (opp.cards ?? []).filter((c) => c.visibility === 'public').map((c) => c.card)
    return { upcards, need: Math.max(0, 7 - upcards.length - community.length) }
  })

  // Sanity check: if even one player has no cards needed AND can't make a 5-card hand
  // from the known cards alone, bail.
  if (humanCards.length + community.length < 5 && humanNeed === 0) return null

  let wins = 0
  let ties = 0
  let valid = 0
  const workDeck = remainingDeck.slice()

  for (let t = 0; t < trials; t++) {
    let humanHand
    try {
      const sample = sampleIndependent(workDeck, humanNeed)
      humanHand = Hand.solve(humanCards.concat(community, sample).map(toSolverCard))
    } catch {
      continue
    }
    const allHands = [humanHand]
    let trialValid = true
    for (const opp of oppInfo) {
      try {
        const sample = sampleIndependent(workDeck, opp.need)
        allHands.push(Hand.solve(opp.upcards.concat(community, sample).map(toSolverCard)))
      } catch {
        trialValid = false
        break
      }
    }
    if (!trialValid) continue
    valid++
    const winners = Hand.winners(allHands)
    if (winners.includes(humanHand)) {
      if (winners.length === 1) wins++
      else ties++
    }
  }
  if (valid === 0) return null
  return {
    win: wins / valid,
    tie: ties / valid,
    equity: (wins + ties * 0.5) / valid,
    samples: valid,
    opponents: activeOpps.length,
  }
}

// In-place partial Fisher-Yates: after the call, deck[0..n-1] is a uniformly random
// n-subset of the original deck. Stays O(n), not O(len).
function partialShuffle(deck, n) {
  const len = deck.length
  for (let i = 0; i < n && i < len - 1; i++) {
    const j = i + Math.floor(Math.random() * (len - i))
    if (j !== i) {
      const tmp = deck[i]
      deck[i] = deck[j]
      deck[j] = tmp
    }
  }
}

// Returns a fresh n-card sample drawn uniformly at random from `deck` without modifying
// `deck`. For small n (which is the only case we use), rejection sampling on indices is
// faster than allocating a permutation index array per trial.
function sampleIndependent(deck, n) {
  if (n <= 0) return []
  const len = deck.length
  if (n >= len) return deck.slice()
  const picked = new Set()
  const out = []
  while (out.length < n) {
    const i = Math.floor(Math.random() * len)
    if (picked.has(i)) continue
    picked.add(i)
    out.push(deck[i])
  }
  return out
}
