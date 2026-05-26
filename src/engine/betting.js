import { currentBlinds } from './blindSchedule.js'
import { currentLimits } from './limitSchedule.js'
import { nextActiveIndex } from './state.js'
import { advanceStreetIfReady } from './streets.js'

// Cap the cross-hand chat log so it doesn't grow unboundedly. The AI prompt only ever
// reads the tail anyway; this just keeps state size sane over a long tournament.
export const MAX_TABLE_CHAT = 60

function findPlayer(state, playerId) {
  const p = state.players.find((x) => x.id === playerId)
  if (!p) throw new Error(`Unknown player: ${playerId}`)
  return p
}

function activeBetUnit(state) {
  const limits = currentLimits(state)
  if (!limits) return 0
  return state.bigBetUnlocked ? limits.bigBet : limits.smallBet
}

// Compute the set of legal actions for the current player.
export function legalActions(state, playerId) {
  const empty = {
    canFold: false, canCheck: false, canCall: false, callAmount: 0,
    canRaise: false, minRaise: 0, maxRaise: 0,
    canAllIn: false, allInAmount: 0,
  }
  if (state.toAct !== playerId) return empty
  const p = findPlayer(state, playerId)
  if (p.folded || p.allIn || p.eliminated) return empty

  const callAmount = Math.max(0, state.currentBet - p.currentBet)
  const canCall = callAmount > 0 && p.stack >= callAmount
  const canCheck = callAmount === 0
  const canFold = true
  const canAllIn = p.stack > 0

  let canRaise = false
  let minRaiseTo = 0
  let maxRaiseTo = 0
  const playerMaxTotal = p.currentBet + p.stack

  if (state.limitStructure === 'fixed-limit') {
    const limits = currentLimits(state)
    const unit = activeBetUnit(state)
    // Bring-in completion special case: on 3rd street while state.currentBet is still the
    // bring-in amount, a raise lands at exactly the small bet (not bringIn + smallBet).
    const isBringInCompletion =
      limits
      && state.street === 'third'
      && state.currentBet > 0
      && state.currentBet < limits.smallBet
    const raiseTo = isBringInCompletion
      ? limits.smallBet
      : state.currentBet + unit
    // Cap: with 3+ live players, no more than 1 bet + 3 raises (raisesThisStreet === 3).
    // Heads-up is exempt from the cap.
    const liveCount = state.players.filter((pl) => !pl.folded && !pl.eliminated).length
    const capReached = liveCount >= 3 && (state.raisesThisStreet ?? 0) >= 3
    if (!capReached && playerMaxTotal >= raiseTo) {
      canRaise = true
      minRaiseTo = raiseTo
      maxRaiseTo = raiseTo
    }
  } else {
    const bb = currentBlinds(state).bigBlind
    const minRaiseIncrement = Math.max(state.lastRaiseSize, bb)
    minRaiseTo = state.currentBet + minRaiseIncrement
    if (playerMaxTotal >= minRaiseTo) {
      canRaise = true
      maxRaiseTo = playerMaxTotal
    }
  }

  return {
    canFold,
    canCheck,
    canCall,
    callAmount,
    canRaise,
    minRaise: canRaise ? minRaiseTo : 0,
    maxRaise: canRaise ? maxRaiseTo : 0,
    canAllIn,
    allInAmount: p.stack,
  }
}

// Apply an action: mutates state in place. Returns state (for chaining).
// `action` is one of { action: 'fold'|'check'|'call'|'raise'|'all-in', amount?: number }
export function applyAction(state, playerId, actionObj) {
  if (state.toAct !== playerId) {
    throw new Error(`It is not ${playerId}'s turn (toAct=${state.toAct})`)
  }
  const p = findPlayer(state, playerId)
  if (p.folded || p.allIn || p.eliminated) {
    throw new Error(`${playerId} cannot act (folded/all-in/eliminated)`)
  }
  const la = legalActions(state, playerId)

  switch (actionObj.action) {
    case 'fold':
      p.folded = true
      recordAction(state, p, 'fold', 0)
      break

    case 'check':
      if (!la.canCheck) throw new Error('Cannot check: there is a bet to call')
      recordAction(state, p, 'check', 0)
      break

    case 'call': {
      if (!la.canCall) {
        // If callAmount equals 0, treat as check; otherwise illegal.
        if (la.canCheck) {
          recordAction(state, p, 'check', 0)
          break
        }
        throw new Error('Cannot call')
      }
      const pay = la.callAmount
      p.stack -= pay
      p.currentBet += pay
      p.totalContributed += pay
      if (p.stack === 0) p.allIn = true
      recordAction(state, p, 'call', pay)
      break
    }

    case 'raise': {
      const raiseTo = actionObj.amount
      if (typeof raiseTo !== 'number') throw new Error('raise requires amount')
      if (raiseTo > la.maxRaise) throw new Error(`Raise exceeds stack (max ${la.maxRaise})`)
      if (raiseTo < la.minRaise) throw new Error(`Raise below minimum (min ${la.minRaise})`)
      if (state.limitStructure === 'fixed-limit' && raiseTo !== la.minRaise) {
        throw new Error(`Fixed-limit raise must equal ${la.minRaise}`)
      }
      const additional = raiseTo - p.currentBet
      p.stack -= additional
      const raiseIncrement = raiseTo - state.currentBet
      p.currentBet = raiseTo
      p.totalContributed += additional
      if (p.stack === 0) p.allIn = true
      state.currentBet = raiseTo
      state.lastRaiseSize = raiseIncrement
      state.raisesThisStreet = (state.raisesThisStreet ?? 0) + 1
      // A full raise reopens action: clear hasActedThisStreet for everyone else.
      for (const other of state.players) {
        if (other.id !== p.id && !other.folded && !other.allIn && !other.eliminated) {
          other.hasActedThisStreet = false
        }
      }
      recordAction(state, p, 'raise', raiseTo)
      break
    }

    case 'all-in': {
      if (!la.canAllIn) throw new Error('Cannot all-in')
      const additional = p.stack
      const newTotal = p.currentBet + additional
      p.currentBet = newTotal
      p.totalContributed += additional
      p.stack = 0
      p.allIn = true
      const raiseIncrement = newTotal - state.currentBet
      if (newTotal > state.currentBet) {
        const bb = currentBlinds(state).bigBlind
        const minRaiseIncrement = state.limitStructure === 'fixed-limit'
          ? activeBetUnit(state)
          : Math.max(state.lastRaiseSize, bb)
        state.currentBet = newTotal
        if (raiseIncrement >= minRaiseIncrement) {
          // Full raise: reopens action.
          state.lastRaiseSize = raiseIncrement
          state.raisesThisStreet = (state.raisesThisStreet ?? 0) + 1
          for (const other of state.players) {
            if (other.id !== p.id && !other.folded && !other.allIn && !other.eliminated) {
              other.hasActedThisStreet = false
            }
          }
        }
        // else: short all-in, action NOT reopened.
      }
      recordAction(state, p, 'all-in', newTotal)
      break
    }

    default:
      throw new Error(`Unknown action: ${actionObj.action}`)
  }

  p.hasActedThisStreet = true
  // Once the bring-in player has acted, they are no longer "the forced bring-in" — clear the flag
  // so subsequent street logic doesn't treat them specially.
  if (p.isBringIn) p.isBringIn = false
  recordTableChat(state, p, actionObj.say)
  advanceTurnOrStreet(state)
  return state
}

function recordTableChat(state, player, raw) {
  if (typeof raw !== 'string') return
  const text = raw.trim()
  if (!text) return
  if (!Array.isArray(state.tableChat)) state.tableChat = []
  state.tableChat.push({
    handNumber: state.handNumber,
    street: state.street,
    playerId: player.id,
    name: player.name,
    characterId: player.characterId ?? null,
    text,
  })
  if (state.tableChat.length > MAX_TABLE_CHAT) {
    state.tableChat.splice(0, state.tableChat.length - MAX_TABLE_CHAT)
  }
}

function recordAction(state, player, action, amount) {
  state.actionHistory.push({
    handNumber: state.handNumber,
    street: state.street,
    playerId: player.id,
    action,
    amount,
  })
}

function advanceTurnOrStreet(state) {
  // First check if hand has ended via fold-around.
  const stillIn = state.players.filter((p) => !p.folded && !p.eliminated)
  if (stillIn.length === 1) {
    // Award pot uncontested.
    awardPotUncontested(state, stillIn[0])
    state.street = 'handComplete'
    state.toAct = null
    return
  }

  // Otherwise: try to advance street (handled in streets.js if everyone has acted).
  const advanced = advanceStreetIfReady(state)
  if (advanced) return

  // Otherwise pass action to next eligible player.
  state.toAct = nextEligibleId(state, findIndexById(state, state.toAct))
}

function findIndexById(state, id) {
  return state.players.findIndex((p) => p.id === id)
}

function nextEligibleId(state, fromIdx) {
  const total = state.players.length
  for (let i = 1; i <= total; i++) {
    const idx = (fromIdx + i) % total
    const p = state.players[idx]
    if (!p.folded && !p.allIn && !p.eliminated) return p.id
  }
  return null
}

function awardPotUncontested(state, winner) {
  const total = state.players.reduce((s, p) => s + p.totalContributed, 0)
  winner.stack += total
  state.actionHistory.push({
    handNumber: state.handNumber,
    street: state.street,
    potIndex: 0,
    potAmount: total,
    winners: [winner.id],
    winningHand: null, // no showdown — opponents folded
    uncontested: true,
    action: 'award',
  })
}
