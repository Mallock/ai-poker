import { defaultBlindSchedule, currentBlinds, advanceLevelIfNeeded } from './blindSchedule.js'
import { freshShuffledDeck, draw } from './deck.js'
import { createRng } from './rng.js'

// Build a tournament-ready state. Doesn't deal any cards yet — call startHand() for that.
export function createInitialState({
  seats,
  startingStack = 10000,
  blindSchedule,
  rngSeed,
} = {}) {
  if (!Array.isArray(seats) || seats.length < 2 || seats.length > 10) {
    throw new Error('seats must be an array of 2..10 players')
  }
  const rng = createRng(rngSeed ?? Date.now())
  const players = seats.map((seat, idx) => ({
    id: seat.id,
    seatIndex: idx,
    name: seat.name,
    characterId: seat.characterId ?? null,
    isHuman: !!seat.isHuman,
    stack: startingStack,
    holeCards: [],
    currentBet: 0,
    totalContributed: 0,
    folded: false,
    allIn: false,
    eliminated: false,
    hasActedThisStreet: false,
  }))
  return {
    blindSchedule: blindSchedule ?? defaultBlindSchedule(),
    blindLevel: 0,
    handsAtCurrentLevel: 0,
    handNumber: 0,
    startingStack,
    rngState: rng.snapshot(),
    dealerIndex: -1, // moves to 0 on first hand
    street: 'idle',
    deck: [],
    communityCards: [],
    currentBet: 0,
    lastRaiseSize: 0,
    toAct: null,
    actionHistory: [],
    players,
  }
}

function activePlayers(state) {
  return state.players.filter((p) => !p.eliminated)
}

function nextActiveIndex(state, fromIdx) {
  const total = state.players.length
  for (let i = 1; i <= total; i++) {
    const idx = (fromIdx + i) % total
    if (!state.players[idx].eliminated) return idx
  }
  return -1
}

// Deal a new hand. Assumes at least 2 non-eliminated players.
export function startHand(state) {
  // Auto-eliminate any player with a zero stack from the prior hand.
  for (const p of state.players) {
    if (!p.eliminated && p.stack <= 0) p.eliminated = true
  }

  const active = activePlayers(state)
  if (active.length < 2) {
    state.street = 'tournamentComplete'
    return state
  }

  advanceLevelIfNeeded(state)
  state.handNumber += 1
  state.handsAtCurrentLevel += 1

  // Reset per-hand player state.
  for (const p of state.players) {
    p.holeCards = []
    p.currentBet = 0
    p.totalContributed = 0
    p.folded = false
    p.allIn = false
    p.hasActedThisStreet = false
  }

  // Advance dealer button to next active player.
  state.dealerIndex = state.dealerIndex < 0
    ? 0
    : nextActiveIndex(state, state.dealerIndex)
  // Skip eliminated.
  while (state.players[state.dealerIndex].eliminated) {
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length
  }

  // Shuffle fresh deck deterministically from current RNG state.
  const rng = createRng(state.rngState)
  state.deck = freshShuffledDeck(rng)
  state.rngState = rng.snapshot()

  // Deal 2 hole cards each, in order.
  const dealOrder = []
  for (let card = 0; card < 2; card++) {
    let idx = nextActiveIndex(state, state.dealerIndex)
    for (let n = 0; n < active.length; n++) {
      const p = state.players[idx]
      p.holeCards.push(...draw(state.deck, 1))
      dealOrder.push(p.id)
      idx = nextActiveIndex(state, idx)
    }
  }

  state.communityCards = []
  state.currentBet = 0
  state.lastRaiseSize = 0
  state.actionHistory = []
  state.street = 'preflop'

  // Post blinds.
  const blinds = currentBlinds(state)
  const isHeadsUp = active.length === 2
  let sbIdx, bbIdx
  if (isHeadsUp) {
    sbIdx = state.dealerIndex
    bbIdx = nextActiveIndex(state, sbIdx)
  } else {
    sbIdx = nextActiveIndex(state, state.dealerIndex)
    bbIdx = nextActiveIndex(state, sbIdx)
  }
  postBlind(state, sbIdx, blinds.smallBlind)
  postBlind(state, bbIdx, blinds.bigBlind)
  state.currentBet = blinds.bigBlind
  state.lastRaiseSize = blinds.bigBlind

  // First to act preflop: UTG = player after BB. Heads-up: SB (button) acts first.
  state.toAct = isHeadsUp
    ? state.players[sbIdx].id
    : state.players[nextActiveIndex(state, bbIdx)].id

  return state
}

function postBlind(state, playerIdx, amount) {
  const p = state.players[playerIdx]
  const post = Math.min(amount, p.stack)
  p.stack -= post
  p.currentBet += post
  p.totalContributed += post
  if (p.stack === 0) p.allIn = true
  // Posting blinds does NOT count as "having acted this street" — the BB still has option preflop.
}

// Helpers used by other engine modules.
export { activePlayers, nextActiveIndex }
