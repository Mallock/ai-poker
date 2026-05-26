import { defaultBlindSchedule, currentBlinds, advanceLevelIfNeeded } from './blindSchedule.js'
import { defaultStudLimitSchedule } from './limitSchedule.js'
import { freshShuffledDeck, draw } from './deck.js'
import { createRng } from './rng.js'
import { parseCard, RANKS } from './cards.js'

const VALID_GAME_TYPES = new Set(['holdem', 'stud'])
const VALID_LIMIT_STRUCTURES = new Set(['no-limit', 'fixed-limit'])

// Build a tournament-ready state. Doesn't deal any cards yet — call startHand() for that.
export function createInitialState({
  seats,
  startingStack = 10000,
  blindSchedule,
  limitSchedule,
  rngSeed,
  gameType = 'holdem',
  limitStructure,
} = {}) {
  if (!VALID_GAME_TYPES.has(gameType)) {
    throw new Error(`Unknown gameType: ${gameType}`)
  }
  const maxSeats = gameType === 'stud' ? 8 : 10
  if (!Array.isArray(seats) || seats.length < 2 || seats.length > maxSeats) {
    throw new Error(`seats must be an array of 2..${maxSeats} players for ${gameType}`)
  }
  const resolvedLimitStructure = limitStructure
    ?? (gameType === 'stud' ? 'fixed-limit' : 'no-limit')
  if (!VALID_LIMIT_STRUCTURES.has(resolvedLimitStructure)) {
    throw new Error(`Unknown limitStructure: ${resolvedLimitStructure}`)
  }
  const resolvedLimitSchedule = limitSchedule
    ?? (gameType === 'stud' ? defaultStudLimitSchedule() : null)

  const rng = createRng(rngSeed ?? Date.now())
  const players = seats.map((seat, idx) => ({
    id: seat.id,
    seatIndex: idx,
    name: seat.name,
    characterId: seat.characterId ?? null,
    isHuman: !!seat.isHuman,
    stack: startingStack,
    cards: [],
    currentBet: 0,
    totalContributed: 0,
    folded: false,
    allIn: false,
    eliminated: false,
    hasActedThisStreet: false,
    isBringIn: false,
  }))
  return {
    gameType,
    limitStructure: resolvedLimitStructure,
    blindSchedule: blindSchedule ?? defaultBlindSchedule(),
    limitSchedule: resolvedLimitSchedule,
    blindLevel: 0,
    handsAtCurrentLevel: 0,
    handNumber: 0,
    startingStack,
    rngState: rng.snapshot(),
    dealerIndex: gameType === 'stud' ? -1 : -1, // moves to 0 on first hand (Hold'em); stud doesn't use it
    street: 'idle',
    deck: [],
    communityCards: [],
    currentBet: 0,
    lastRaiseSize: 0,
    raisesThisStreet: 0,
    bigBetUnlocked: false,
    toAct: null,
    actionHistory: [],
    // Rolling table chat log across the session. Every action with a non-empty `say`
    // appends an entry here. Kept bounded (see MAX_TABLE_CHAT in betting.js) so it
    // doesn't grow unboundedly over a long tournament. Cross-hand on purpose — rivalries
    // and running jokes should outlive a single hand.
    tableChat: [],
    players,
  }
}

// Filter a player's cards array by visibility. Returns plain card strings.
export function getHoleCards(player) {
  if (!player || !Array.isArray(player.cards)) return []
  return player.cards.filter((c) => c && c.visibility === 'private').map((c) => c.card)
}

export function getUpCards(player) {
  if (!player || !Array.isArray(player.cards)) return []
  return player.cards.filter((c) => c && c.visibility === 'public').map((c) => c.card)
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
    p.cards = []
    p.currentBet = 0
    p.totalContributed = 0
    p.folded = false
    p.allIn = false
    p.hasActedThisStreet = false
    p.isBringIn = false
  }
  state.raisesThisStreet = 0
  state.bigBetUnlocked = false

  // Shuffle fresh deck deterministically from current RNG state.
  const rng = createRng(state.rngState)
  state.deck = freshShuffledDeck(rng)
  state.rngState = rng.snapshot()

  if (state.gameType === 'stud') {
    return startHandStud(state)
  }
  return startHandHoldem(state)
}

function startHandHoldem(state) {
  const active = activePlayers(state)

  // Advance dealer button to next active player.
  state.dealerIndex = state.dealerIndex < 0
    ? 0
    : nextActiveIndex(state, state.dealerIndex)
  // Skip eliminated.
  while (state.players[state.dealerIndex].eliminated) {
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length
  }

  // Deal 2 hole cards each, in order. Cards carry visibility for the unified shape.
  for (let card = 0; card < 2; card++) {
    let idx = nextActiveIndex(state, state.dealerIndex)
    for (let n = 0; n < active.length; n++) {
      const p = state.players[idx]
      const [drawn] = draw(state.deck, 1)
      p.cards.push({ card: drawn, visibility: 'private' })
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

const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])) // 2..14
const SUIT_ORDER = { C: 0, D: 1, H: 2, S: 3 }

// Pick the bring-in player on 3rd street: lowest-rank upcard (2 = lowest, A = highest).
// Tiebreak by suit order C < D < H < S.
function pickBringInIndex(state) {
  const active = state.players
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => !p.eliminated && !p.folded)
  let bestIdx = -1
  let bestKey = null
  for (const { p, idx } of active) {
    const upCardStr = p.cards.find((c) => c.visibility === 'public')?.card
    if (!upCardStr) continue
    const { rank, suit } = parseCard(upCardStr)
    const key = RANK_VALUE[rank] * 10 + SUIT_ORDER[suit]
    if (bestKey === null || key < bestKey) {
      bestKey = key
      bestIdx = idx
    }
  }
  return bestIdx
}

function startHandStud(state) {
  const active = activePlayers(state)
  const level = Math.min(state.blindLevel, state.limitSchedule.length - 1)
  const limit = state.limitSchedule[level]

  // Collect ante from every active player (debits stack, contributes to pot).
  for (const idx of active.map((_, i) => state.players.indexOf(active[i]))) {
    const p = state.players[idx]
    const pay = Math.min(limit.ante, p.stack)
    p.stack -= pay
    p.totalContributed += pay
    if (p.stack === 0) p.allIn = true
  }

  // Deal 3 cards per active player: 2 private + 1 public.
  // Deal one card at a time across the table (standard cardroom procedure).
  const activeIndexes = state.players
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => !p.eliminated)
    .map(({ idx }) => idx)
  for (let n = 0; n < 2; n++) {
    for (const idx of activeIndexes) {
      const p = state.players[idx]
      const [drawn] = draw(state.deck, 1)
      p.cards.push({ card: drawn, visibility: 'private' })
    }
  }
  for (const idx of activeIndexes) {
    const p = state.players[idx]
    const [drawn] = draw(state.deck, 1)
    p.cards.push({ card: drawn, visibility: 'public' })
  }

  state.communityCards = []
  state.currentBet = 0
  state.lastRaiseSize = 0
  state.actionHistory = []
  state.street = 'third'

  // Bring-in: lowest upcard pays the bring-in amount, becomes toAct.
  const bringInIdx = pickBringInIndex(state)
  if (bringInIdx >= 0) {
    const bp = state.players[bringInIdx]
    const pay = Math.min(limit.bringIn, bp.stack)
    bp.stack -= pay
    bp.currentBet += pay
    bp.totalContributed += pay
    if (bp.stack === 0) bp.allIn = true
    bp.isBringIn = true
    state.currentBet = limit.bringIn
    // The bring-in itself is a forced post — `lastRaiseSize` is the small bet so a
    // completion is a full raise.
    state.lastRaiseSize = limit.smallBet - limit.bringIn
    state.toAct = bp.id
  }

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
