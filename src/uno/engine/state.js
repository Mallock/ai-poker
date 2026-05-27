import { createRng } from './rng.js'
import { buildDeck, shuffle, deal } from './deck.js'
import { isWild } from './cards.js'

// Match-level state. `hands`, `drawPile`, `discardPile` are populated by startRound().
//
// Per the engine spec:
//   seats              Seat[]              { id, name, isHuman, characterId? }
//   hands              Card[][]            one per seat (length = seats.length)
//   drawPile           Card[]              face-down draw pile
//   discardPile        DiscardEntry[]      [..., { card, chosenColor? }] — top is last entry
//   direction          1 | -1              1 = clockwise, -1 = counter-clockwise
//   currentSeatIndex   number              seat whose turn it currently is
//   pendingDraw        number              cards the next-to-act seat owes (from Draw 2 / WD4)
//   pendingSkip        boolean             next-to-act seat is skipped on turn advance
//   pendingWildColor   color | null        explicit "starting color not chosen yet" marker
//                                          (used when round opens on a Wild)
//   lastPlay           { seatIndex, card, chosenColor? } | null
//   pendingUnoCatch    { seatIndex, expiresOnTurnAdvance: true } | null
//   pendingWildDraw4Challenge  { playerSeatIndex, victimSeatIndex, previousColor,
//                                previousTopCard, playerHandBeforePlay } | null
//   lastDrawnUnplayable  { seatIndex } | null  — pass is legal only when this is set
//   roundComplete      boolean
//   roundWinnerSeatIndex  number | null
//   recentActions      ActionLogEntry[]    bounded ring buffer for the UI / AI prompt
//   scores             number[]            cumulative match scores, one per seat
//   roundNumber        number              1-indexed once a round has started; 0 before
//   totalRounds        number              best-of-N
//   matchComplete      boolean
//   matchWinnerSeatIndex  number | null    set when matchComplete
//   tieBreakSeatIndices  number[] | null   seat indices participating in a sudden-death round
//   firstToActForRound number              who started the current round (rotation key)
//   _rng               Rng                  PRNG (private — see rng.js)

const RECENT_ACTIONS_CAP = 32

export function createInitialState({ seats, totalRounds = 7, rngSeed } = {}) {
  if (!Array.isArray(seats) || seats.length < 2) {
    throw new Error('Uno needs at least 2 seats')
  }
  if (seats.length > 8) {
    throw new Error('Uno table caps at 8 seats')
  }
  const seatCount = seats.length
  const rng = createRng(rngSeed ?? Date.now())
  return {
    seats: seats.map((s) => ({ ...s })),
    hands: Array.from({ length: seatCount }, () => []),
    drawPile: [],
    discardPile: [],
    direction: 1,
    currentSeatIndex: 0,
    pendingDraw: 0,
    pendingSkip: false,
    pendingWildColor: null,
    lastPlay: null,
    pendingUnoCatch: null,
    pendingWildDraw4Challenge: null,
    lastDrawnUnplayable: null,
    roundComplete: false,
    roundWinnerSeatIndex: null,
    recentActions: [],
    scores: Array.from({ length: seatCount }, () => 0),
    roundNumber: 0,
    totalRounds,
    matchComplete: false,
    matchWinnerSeatIndex: null,
    tieBreakSeatIndices: null,
    firstToActForRound: 0,
    _rng: rng,
  }
}

// Deal 7 cards to each seat, turn up the first discard, apply starting-card effects, and
// seed first-to-act according to the rotation rule. Mutates state. Idempotent only in the
// sense that re-calling it deals a fresh round on top of the existing match-level state
// (scores, roundNumber, etc. are preserved/incremented by `advanceMatch`, not by us).
export function startRound(state, { seatSubset } = {}) {
  if (state.matchComplete) throw new Error('Cannot start a round on a completed match')
  const seatCount = state.seats.length
  // Build & shuffle a fresh deck.
  const deck = shuffle(buildDeck(), state._rng)
  // Deal 7 to each seat (or to the subset for sudden-death).
  const dealtSeats = seatSubset ?? state.seats.map((_, i) => i)
  const { hands, remainingDeck } = deal(deck, dealtSeats.length, 7)
  // Place hands at the correct seat indices, leaving non-participating seats empty.
  const newHands = Array.from({ length: seatCount }, () => [])
  dealtSeats.forEach((seatIdx, k) => { newHands[seatIdx] = hands[k] })
  state.hands = newHands

  // Pick first discard: redraw until it isn't a Wild Draw 4.
  let firstDiscard = remainingDeck.shift()
  while (firstDiscard.value === 'wild_draw4') {
    // Put it back somewhere in the middle and reshuffle.
    remainingDeck.push(firstDiscard)
    shuffle(remainingDeck, state._rng)
    firstDiscard = remainingDeck.shift()
  }
  state.drawPile = remainingDeck
  state.discardPile = [{ card: firstDiscard }]

  // Reset per-round transient state.
  state.direction = 1
  state.pendingDraw = 0
  state.pendingSkip = false
  state.pendingWildColor = null
  state.lastPlay = null
  state.pendingUnoCatch = null
  state.pendingWildDraw4Challenge = null
  state.lastDrawnUnplayable = null
  state.roundComplete = false
  state.roundWinnerSeatIndex = null
  state.recentActions = []

  // Seed first-to-act.
  state.roundNumber = state.roundNumber + 1
  let firstToAct
  if (state.tieBreakSeatIndices && state.tieBreakSeatIndices.length > 0) {
    // Sudden-death: random among the tied seats.
    const tied = state.tieBreakSeatIndices
    firstToAct = tied[state._rng.int(tied.length)]
  } else if (state.roundNumber === 1) {
    firstToAct = state._rng.int(seatCount)
  } else {
    firstToAct = (state.firstToActForRound + 1) % seatCount
  }
  state.firstToActForRound = firstToAct
  state.currentSeatIndex = firstToAct

  // Apply the first-discard's effect on the first-to-act seat.
  applyStartingCardEffect(state, firstDiscard)
  return state
}

// Skip / Reverse / Draw 2 / Wild as the starting discard.
function applyStartingCardEffect(state, card) {
  const seatCount = state.seats.length
  if (card.value === 'skip') {
    state.currentSeatIndex = nextSeat(state.currentSeatIndex, state.direction, seatCount)
    return
  }
  if (card.value === 'reverse') {
    if (seatCount === 2) {
      // 2-player Reverse = Skip; in this start-of-round case it means the "dealer" (the
      // seat after the would-be first-to-act) plays first. With first-to-act seeded by
      // random/rotation and a 2-player table, this swaps to the other seat.
      state.currentSeatIndex = nextSeat(state.currentSeatIndex, state.direction, seatCount)
    } else {
      // Flip direction and shift first-to-act to the player who would otherwise have acted
      // last under the original direction.
      state.direction = -state.direction
      state.currentSeatIndex = nextSeat(state.currentSeatIndex, -1, seatCount) // step backwards
      // (After reversing direction, "next" from the original seat goes the new way; the
      // seat to act first under counter-clockwise play is one to the left of the seated
      // first-to-act, which is exactly `nextSeat(..., -1)` under the ORIGINAL direction.)
    }
    return
  }
  if (card.value === 'draw2') {
    // Apply pendingDraw against the first-to-act seat and skip them. They draw 2 immediately
    // on turn-advance? Cleaner: draw now and advance past them.
    drawCards(state, state.currentSeatIndex, 2)
    state.currentSeatIndex = nextSeat(state.currentSeatIndex, state.direction, seatCount)
    return
  }
  if (card.value === 'wild') {
    // First-to-act must choose the starting color before acting.
    state.pendingWildColor = null
    state.discardPile[state.discardPile.length - 1].chosenColor = null // explicit "unchosen"
    return
  }
  // Numeric or Wild Draw 4: nothing to apply (WD4 was filtered upstream).
}

// Step to the next seat in the given direction, wrapping at boundaries.
export function nextSeat(seatIndex, direction, seatCount) {
  return ((seatIndex + direction) % seatCount + seatCount) % seatCount
}

// In sudden-death rounds, only a subset of seats are dealt cards — the rest are out of the
// round entirely. Move `currentSeatIndex` past any non-participating seats. In normal play
// the field is null and this is a no-op.
export function skipEmptyHands(state) {
  if (!state.tieBreakSeatIndices) return
  const participating = new Set(state.tieBreakSeatIndices)
  const seatCount = state.seats.length
  let safety = 0
  while (!participating.has(state.currentSeatIndex) && safety < seatCount) {
    state.currentSeatIndex = nextSeat(state.currentSeatIndex, state.direction, seatCount)
    safety++
  }
}

// Reshuffle-aware draw. Pulls `n` cards from the draw pile into the seat's hand. If the
// draw pile underflows, reshuffles the discard pile (except the top card with its chosen
// color) into the draw pile and continues. If neither pile has anything left, the draw
// silently stops short.
export function drawCards(state, seatIndex, n) {
  let drawn = 0
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length <= 1) break // nothing left to reshuffle
      reshuffleDiscardIntoDraw(state)
      if (state.drawPile.length === 0) break
    }
    state.hands[seatIndex].push(state.drawPile.shift())
    drawn++
  }
  return drawn
}

function reshuffleDiscardIntoDraw(state) {
  const top = state.discardPile[state.discardPile.length - 1]
  const rest = state.discardPile.slice(0, -1)
  // Convert the rest (DiscardEntry[]) back into bare cards. The chosen color on intermediate
  // entries is irrelevant once they're back in the deck (Wilds become colorless again).
  const cards = rest.map((e) => e.card)
  shuffle(cards, state._rng)
  state.drawPile = cards
  state.discardPile = [top]
}

// Push an entry into the bounded recentActions ring.
export function pushAction(state, entry) {
  state.recentActions.push(entry)
  if (state.recentActions.length > RECENT_ACTIONS_CAP) {
    state.recentActions.splice(0, state.recentActions.length - RECENT_ACTIONS_CAP)
  }
}

// Active color at the top of the discard pile — chosenColor if a Wild is on top, else the
// card's own color. Returns null if the round opener was a Wild whose color hasn't been
// chosen yet.
export function activeColor(state) {
  const top = discardTop(state)
  if (!top) return null
  if (top.chosenColor !== undefined) return top.chosenColor // may be null when unchosen
  return top.card.color === 'wild' ? null : top.card.color
}

export function discardTop(state) {
  return state.discardPile.length === 0 ? null : state.discardPile[state.discardPile.length - 1]
}

export function topCard(state) {
  const top = discardTop(state)
  return top ? top.card : null
}
