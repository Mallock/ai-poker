import { draw } from './deck.js'
import { nextActiveIndex } from './state.js'
import { awardPotsAtShowdown } from './showdown.js'
import { advanceStreetIfReadyStud } from './streetsStud.js'

// Returns true if the street ended (and possibly more streets cascaded after).
export function advanceStreetIfReady(state) {
  if (!isStreetComplete(state)) return false

  // Move bets into per-player totalContributed (already updated incrementally) and reset per-street bets.
  for (const p of state.players) {
    p.currentBet = 0
    p.hasActedThisStreet = false
  }
  state.currentBet = 0
  state.lastRaiseSize = 0
  state.raisesThisStreet = 0

  if (state.gameType === 'stud') {
    return advanceStreetIfReadyStud(state)
  }
  return advanceStreetIfReadyHoldem(state)
}

function advanceStreetIfReadyHoldem(state) {
  // Check: do we still have ≥2 players with chips to bet? If not, deal remaining streets without action.
  const stillIn = state.players.filter((p) => !p.folded && !p.eliminated)
  const canBet = stillIn.filter((p) => !p.allIn)

  switch (state.street) {
    case 'preflop':
      dealFlop(state); break
    case 'flop':
      dealTurn(state); break
    case 'turn':
      dealRiver(state); break
    case 'river':
      goToShowdown(state); return true
    default:
      return false
  }

  if (canBet.length < 2) {
    // No more action possible — cascade to showdown, dealing remaining streets first.
    while (state.street !== 'showdown' && state.street !== 'handComplete') {
      switch (state.street) {
        case 'flop': dealTurn(state); break
        case 'turn': dealRiver(state); break
        case 'river': goToShowdown(state); break
        default: return true
      }
    }
    return true
  }

  // Set first-to-act on new street: first non-folded, non-all-in player left of dealer.
  state.toAct = firstToActOnPostflopStreet(state)
  if (!state.toAct) {
    // Everyone left is all-in — cascade.
    while (state.street !== 'showdown' && state.street !== 'handComplete') {
      switch (state.street) {
        case 'flop': dealTurn(state); break
        case 'turn': dealRiver(state); break
        case 'river': goToShowdown(state); break
        default: return true
      }
    }
  }
  return true
}

function isStreetComplete(state) {
  const stillIn = state.players.filter((p) => !p.folded && !p.eliminated)
  const canAct = stillIn.filter((p) => !p.allIn)
  if (canAct.length === 0) return true
  // All who can act must have acted this street AND have matched currentBet.
  for (const p of canAct) {
    if (!p.hasActedThisStreet) return false
    if (p.currentBet < state.currentBet) return false
  }
  return true
}

function firstToActOnPostflopStreet(state) {
  let idx = state.dealerIndex
  for (let i = 0; i < state.players.length; i++) {
    idx = nextActiveIndex(state, idx)
    const p = state.players[idx]
    if (!p.folded && !p.allIn && !p.eliminated) return p.id
  }
  return null
}

function dealFlop(state) {
  draw(state.deck, 1) // burn
  state.communityCards.push(...draw(state.deck, 3))
  state.street = 'flop'
}

function dealTurn(state) {
  draw(state.deck, 1)
  state.communityCards.push(...draw(state.deck, 1))
  state.street = 'turn'
}

function dealRiver(state) {
  draw(state.deck, 1)
  state.communityCards.push(...draw(state.deck, 1))
  state.street = 'river'
}

export function goToShowdown(state) {
  state.street = 'showdown'
  state.toAct = null
  awardPotsAtShowdown(state)
  state.street = 'handComplete'
}
