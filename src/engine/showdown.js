import { Hand } from 'pokersolver'
import { toSolverCard } from './cards.js'
import { computePots } from './sidePots.js'
import { nextActiveIndex } from './state.js'

// Awards pots to winners (mutates player stacks) and records 'showdown' action history.
// Called when the hand reaches showdown (≥2 players in, river complete) — also handles the
// degenerate case where a player won uncontested (in which case there are no winners to rank).
export function awardPotsAtShowdown(state) {
  const pots = computePots(state)
  const contenders = state.players.filter((p) => !p.folded && !p.eliminated)

  // Evaluate hands once per contender.
  const handsByPlayer = new Map()
  for (const p of contenders) {
    const all7 = [...p.holeCards, ...state.communityCards].map(toSolverCard)
    handsByPlayer.set(p.id, Hand.solve(all7))
  }

  for (let i = 0; i < pots.length; i++) {
    const pot = pots[i]
    if (pot.amount === 0) continue
    const eligibleHands = pot.eligible
      .map((pid) => ({ pid, hand: handsByPlayer.get(pid) }))
      .filter((entry) => entry.hand)

    if (eligibleHands.length === 0) continue

    const winnerHands = Hand.winners(eligibleHands.map((e) => e.hand))
    const winners = eligibleHands
      .filter((e) => winnerHands.includes(e.hand))
      .map((e) => e.pid)

    // Capture the winning hand description + best-5 cards from the first winner
    // (all tied winners share the same hand category and ranks by definition).
    const sampleWinner = eligibleHands.find((e) => winners.includes(e.pid))?.hand
    const winningHand = sampleWinner ? {
      name: sampleWinner.name,
      descr: sampleWinner.descr,
      cards: sampleWinner.cards.map((c) => c.toString().toUpperCase()),
    } : null

    distributePot(state, pot.amount, winners)

    state.actionHistory.push({
      handNumber: state.handNumber,
      street: 'showdown',
      potIndex: i,
      potAmount: pot.amount,
      winners,
      winningHand,
      action: 'award',
    })
  }
}

// Distribute `amount` among `winnerIds` evenly, with any odd chip going to the first eligible
// winner left of the button.
function distributePot(state, amount, winnerIds) {
  if (winnerIds.length === 0) return
  const each = Math.floor(amount / winnerIds.length)
  let remainder = amount - each * winnerIds.length

  for (const id of winnerIds) {
    const p = state.players.find((x) => x.id === id)
    p.stack += each
  }

  // Odd chips: award to the winner closest left of the dealer.
  if (remainder > 0) {
    let idx = state.dealerIndex
    while (remainder > 0) {
      idx = nextActiveIndex(state, idx)
      const candidate = state.players[idx]
      if (winnerIds.includes(candidate.id)) {
        candidate.stack += 1
        remainder -= 1
      }
      // Safety: don't loop forever.
      if (idx === state.dealerIndex) break
    }
  }
}
