import { isWild } from './cards.js'
import {
  activeColor,
  discardTop,
  topCard,
  nextSeat,
  skipEmptyHands,
  drawCards,
  pushAction,
} from './state.js'
import { UNO_EVENTS } from './events.js'

// Is `card` playable on top of `state.discardPile`'s top entry?
//
// Rules:
//   - Wild and Wild Draw 4 are always playable (we do not enforce the "no playable
//     non-wild-draw-4 card" rule at play-time — that's enforced post-hoc via challenge).
//   - Numeric/action cards play if color matches activeColor OR value matches top card's value.
//   - When the round opener is a Wild whose color hasn't been chosen yet (activeColor is null),
//     no plays are legal until the first-to-act seat picks a starting color via
//     `chooseStartingColor` — `canPlayOn` returns false for everything in that state.
export function canPlayOn(card, state) {
  if (!card) return false
  if (card.value === 'wild' || card.value === 'wild_draw4') return true
  const ac = activeColor(state)
  if (ac === null) return false
  if (card.color === ac) return true
  const top = topCard(state)
  if (top && card.value === top.value) return true
  return false
}

// Returns the set of legal actions for `seatIndex`. Includes both turn-bound actions
// (only available when it's seatIndex's turn) and out-of-turn actions like catchMissedUno.
export function legalActions(state, seatIndex) {
  const empty = {
    plays: [],
    canDraw: false,
    canPass: false,
    canChallenge: false,
    canAccept: false,
    canCallUno: false,
    canCatchMissedUno: false,
    mustChooseStartingColor: false,
  }
  if (state.roundComplete || state.matchComplete) return empty

  const canCatch = (
    state.pendingUnoCatch !== null
    && state.pendingUnoCatch.seatIndex !== seatIndex
  )

  if (state.currentSeatIndex !== seatIndex) {
    return { ...empty, canCatchMissedUno: canCatch }
  }

  // Starting-color choice gates all other actions.
  if (state.pendingWildColor === null
      && discardTop(state)?.chosenColor === null
      && topCard(state)?.value === 'wild') {
    return { ...empty, mustChooseStartingColor: true, canCatchMissedUno: canCatch }
  }

  // WD4 challenge against this seat: only challenge / accept are legal.
  const wdc = state.pendingWildDraw4Challenge
  if (wdc && wdc.victimSeatIndex === seatIndex) {
    return {
      ...empty,
      canChallenge: true,
      canAccept: true,
      canCatchMissedUno: canCatch,
    }
  }

  // Mid-turn-after-draw: the just-drawn card may be played (if playable) and pass is legal.
  if (state.midTurnDraw && state.midTurnDraw.seatIndex === seatIndex) {
    const drawnIdx = state.midTurnDraw.cardIndex
    const drawn = state.hands[seatIndex][drawnIdx]
    const plays = []
    if (drawn && canPlayOn(drawn, state)) {
      plays.push({ cardIndex: drawnIdx, requiresWildColor: isWild(drawn) })
    }
    const handAfterPlay = state.hands[seatIndex].length - 1
    return {
      ...empty,
      plays,
      canPass: true,
      canCallUno: handAfterPlay === 1 && plays.length > 0,
      canCatchMissedUno: canCatch,
    }
  }

  // Normal turn.
  const hand = state.hands[seatIndex]
  const plays = []
  for (let i = 0; i < hand.length; i++) {
    if (canPlayOn(hand[i], state)) {
      plays.push({ cardIndex: i, requiresWildColor: isWild(hand[i]) })
    }
  }
  const canDraw = plays.length === 0
  const handAfterPlay = hand.length - 1
  return {
    plays,
    canDraw,
    canPass: false,
    canChallenge: false,
    canAccept: false,
    canCallUno: handAfterPlay === 1 && plays.length > 0,
    canCatchMissedUno: canCatch,
    mustChooseStartingColor: false,
  }
}

// Apply an action to state in place. Returns an array of event objects the caller should
// emit on the shared event bus: `[{ type, ...payload }, ...]`. Throws on an illegal action
// (does NOT mutate state in that case).
export function applyAction(state, seatIndex, action) {
  if (state.roundComplete || state.matchComplete) {
    throw new Error('Round/match complete — no further actions accepted')
  }

  // catchMissedUno is the only out-of-turn action; handle it first.
  if (action.action === 'catchMissedUno') {
    return applyCatchMissedUno(state, seatIndex)
  }

  if (state.currentSeatIndex !== seatIndex) {
    throw new Error(`Not your turn (seat ${seatIndex}; current ${state.currentSeatIndex})`)
  }

  switch (action.action) {
    case 'chooseStartingColor': return applyChooseStartingColor(state, seatIndex, action)
    case 'play': return applyPlay(state, seatIndex, action)
    case 'draw': return applyDraw(state, seatIndex)
    case 'pass': return applyPass(state, seatIndex)
    case 'challenge': return applyChallenge(state, seatIndex)
    case 'accept': return applyAccept(state, seatIndex)
    default:
      throw new Error(`Unknown action: ${action.action}`)
  }
}

function applyChooseStartingColor(state, seatIndex, action) {
  if (!isPlayableColor(action.color)) {
    throw new Error(`Invalid starting color: ${action.color}`)
  }
  const top = discardTop(state)
  if (!top || top.card.value !== 'wild' || top.chosenColor !== null) {
    throw new Error('No starting color to choose')
  }
  top.chosenColor = action.color
  state.pendingWildColor = action.color
  pushAction(state, { type: 'choose_starting_color', seatIndex, color: action.color })
  return [{ type: UNO_EVENTS.WILD_COLOR_CHOSEN, seatIndex, color: action.color }]
}

function applyPlay(state, seatIndex, action) {
  const hand = state.hands[seatIndex]
  const cardIndex = action.cardIndex
  if (typeof cardIndex !== 'number' || cardIndex < 0 || cardIndex >= hand.length) {
    throw new Error(`Invalid cardIndex ${cardIndex}`)
  }
  const card = hand[cardIndex]
  if (!canPlayOn(card, state)) {
    throw new Error(`Card ${card.id} is not playable here`)
  }
  if (isWild(card) && !isPlayableColor(action.wildColor)) {
    throw new Error('Wild plays require a valid wildColor')
  }

  // Mid-turn-after-draw: only the just-drawn card may be played.
  if (state.midTurnDraw && state.midTurnDraw.seatIndex === seatIndex) {
    if (state.midTurnDraw.cardIndex !== cardIndex) {
      throw new Error('After drawing, only the drawn card may be played')
    }
  }

  const events = []
  const previousColor = activeColor(state)
  const previousTopCard = topCard(state)
  const handBeforePlay = [...hand] // snapshot for WD4 challenge

  // Move the card out of the hand onto the discard pile.
  hand.splice(cardIndex, 1)
  const entry = { card }
  if (isWild(card)) entry.chosenColor = action.wildColor
  state.discardPile.push(entry)
  state.lastPlay = { seatIndex, card, chosenColor: entry.chosenColor }
  state.lastDrawnUnplayable = null
  state.midTurnDraw = null
  // Each new play clears any prior catch window.
  state.pendingUnoCatch = null

  events.push({ type: UNO_EVENTS.CARD_PLAYED, seatIndex, card, chosenColor: entry.chosenColor })
  if (isWild(card)) {
    events.push({ type: UNO_EVENTS.WILD_COLOR_CHOSEN, seatIndex, color: action.wildColor })
  }
  pushAction(state, { type: 'play', seatIndex, card, chosenColor: entry.chosenColor })

  // Check round completion before applying card effects (Skip/Reverse/etc. don't matter on
  // a winning play, but the engine still records direction/pendingSkip for completeness).
  if (hand.length === 0) {
    state.roundComplete = true
    state.roundWinnerSeatIndex = seatIndex
    events.push({ type: UNO_EVENTS.ROUND_WON, seatIndex })
    return events
  }

  // UNO call window: if the play took them to 1 card without callUno, open the catch window.
  if (hand.length === 1) {
    if (action.callUno) {
      events.push({ type: UNO_EVENTS.UNO_CALLED, seatIndex })
      pushAction(state, { type: 'uno_called', seatIndex })
    } else {
      state.pendingUnoCatch = { seatIndex }
    }
  }

  // Apply card effects + advance turn.
  applyCardEffects(state, seatIndex, card, entry.chosenColor, {
    previousColor, previousTopCard, handBeforePlay,
  }, events)
  return events
}

function applyCardEffects(state, seatIndex, card, chosenColor, ctx, events) {
  const seatCount = state.seats.length
  if (card.value === 'skip') {
    pushAction(state, { type: 'skip', seatIndex })
    const skipped = nextSeat(seatIndex, state.direction, seatCount)
    events.push({ type: UNO_EVENTS.PLAYER_SKIPPED, seatIndex: skipped })
    state.currentSeatIndex = nextSeat(skipped, state.direction, seatCount)
    skipEmptyHands(state)
    return
  }
  if (card.value === 'reverse') {
    if (seatCount === 2) {
      // 2-player Reverse = Skip → same seat plays again.
      pushAction(state, { type: 'skip', seatIndex })
      events.push({ type: UNO_EVENTS.PLAYER_SKIPPED, seatIndex: nextSeat(seatIndex, state.direction, seatCount) })
      // currentSeatIndex stays at seatIndex (turn does not advance to the other seat).
      state.currentSeatIndex = seatIndex
    } else {
      state.direction = -state.direction
      events.push({ type: UNO_EVENTS.DIRECTION_REVERSED, direction: state.direction })
      pushAction(state, { type: 'reverse', seatIndex, direction: state.direction })
      state.currentSeatIndex = nextSeat(seatIndex, state.direction, seatCount)
      skipEmptyHands(state)
    }
    return
  }
  if (card.value === 'draw2') {
    const victim = nextSeat(seatIndex, state.direction, seatCount)
    const drew = drawCards(state, victim, 2)
    events.push({ type: UNO_EVENTS.CARD_DRAWN, seatIndex: victim, count: drew, reason: 'penalty' })
    events.push({ type: UNO_EVENTS.PLAYER_SKIPPED, seatIndex: victim })
    pushAction(state, { type: 'draw2', seatIndex, victimSeatIndex: victim, drew })
    state.currentSeatIndex = nextSeat(victim, state.direction, seatCount)
    skipEmptyHands(state)
    return
  }
  if (card.value === 'wild_draw4') {
    const victim = nextSeat(seatIndex, state.direction, seatCount)
    state.pendingWildDraw4Challenge = {
      playerSeatIndex: seatIndex,
      victimSeatIndex: victim,
      previousColor: ctx.previousColor,
      previousTopCard: ctx.previousTopCard,
      playerHandBeforePlay: ctx.handBeforePlay,
    }
    state.currentSeatIndex = victim
    return
  }
  if (card.value === 'wild') {
    // No effect beyond the color change. Advance normally.
    state.currentSeatIndex = nextSeat(seatIndex, state.direction, seatCount)
    skipEmptyHands(state)
    return
  }
  // Numeric card.
  state.currentSeatIndex = nextSeat(seatIndex, state.direction, seatCount)
  skipEmptyHands(state)
}

function applyDraw(state, seatIndex) {
  const events = []
  // Normal-turn draw: pull 1, evaluate playability.
  const before = state.hands[seatIndex].length
  const drew = drawCards(state, seatIndex, 1)
  events.push({ type: UNO_EVENTS.CARD_DRAWN, seatIndex, count: drew, reason: 'turn' })
  pushAction(state, { type: 'draw', seatIndex, count: drew })

  if (drew === 0) {
    // Couldn't draw — both piles exhausted; just pass.
    state.midTurnDraw = null
    state.lastDrawnUnplayable = { seatIndex }
    return events.concat(advanceAfterPass(state, seatIndex))
  }

  const drawnIdx = before
  const drawnCard = state.hands[seatIndex][drawnIdx]
  if (canPlayOn(drawnCard, state)) {
    state.midTurnDraw = { seatIndex, cardIndex: drawnIdx }
    state.lastDrawnUnplayable = null
    return events
  }
  // Unplayable — turn ends. Spec says "they SHALL pass" — we auto-pass to keep the flow tight.
  state.midTurnDraw = null
  state.lastDrawnUnplayable = { seatIndex }
  return events.concat(advanceAfterPass(state, seatIndex))
}

function applyPass(state, seatIndex) {
  if (!state.midTurnDraw && !state.lastDrawnUnplayable) {
    throw new Error('Cannot pass without first drawing')
  }
  state.midTurnDraw = null
  state.lastDrawnUnplayable = null
  return advanceAfterPass(state, seatIndex)
}

function advanceAfterPass(state, seatIndex) {
  state.currentSeatIndex = nextSeat(seatIndex, state.direction, state.seats.length)
  skipEmptyHands(state)
  state.pendingUnoCatch = null
  return []
}

function applyChallenge(state, seatIndex) {
  const wdc = state.pendingWildDraw4Challenge
  if (!wdc || wdc.victimSeatIndex !== seatIndex) {
    throw new Error('No Wild Draw 4 to challenge')
  }
  const events = []
  // Inspect the player's hand BEFORE the WD4 play for any non-WD4 card matching previous
  // color or previous top's value (excluding other WD4s).
  const hadAlternative = wdc.playerHandBeforePlay.some((c) => (
    c.value !== 'wild_draw4'
    && (c.color === wdc.previousColor || (wdc.previousTopCard && c.value === wdc.previousTopCard.value))
  ))
  if (hadAlternative) {
    // Successful challenge: player draws 4; challenger plays normally.
    const drew = drawCards(state, wdc.playerSeatIndex, 4)
    events.push({ type: UNO_EVENTS.CARD_DRAWN, seatIndex: wdc.playerSeatIndex, count: drew, reason: 'penalty' })
    events.push({ type: UNO_EVENTS.WILD_DRAW4_CHALLENGED, victorSeatIndex: seatIndex, loserSeatIndex: wdc.playerSeatIndex, success: true })
    pushAction(state, { type: 'challenge_success', challengerSeatIndex: seatIndex, playerSeatIndex: wdc.playerSeatIndex })
    state.pendingWildDraw4Challenge = null
    state.currentSeatIndex = seatIndex // challenger acts normally now
  } else {
    // Failed challenge: challenger draws 6, skipped.
    const drew = drawCards(state, seatIndex, 6)
    events.push({ type: UNO_EVENTS.CARD_DRAWN, seatIndex, count: drew, reason: 'penalty' })
    events.push({ type: UNO_EVENTS.WILD_DRAW4_CHALLENGED, victorSeatIndex: wdc.playerSeatIndex, loserSeatIndex: seatIndex, success: false })
    pushAction(state, { type: 'challenge_failed', challengerSeatIndex: seatIndex, playerSeatIndex: wdc.playerSeatIndex })
    state.pendingWildDraw4Challenge = null
    state.currentSeatIndex = nextSeat(seatIndex, state.direction, state.seats.length)
    skipEmptyHands(state)
  }
  state.pendingUnoCatch = null
  return events
}

function applyAccept(state, seatIndex) {
  const wdc = state.pendingWildDraw4Challenge
  if (!wdc || wdc.victimSeatIndex !== seatIndex) {
    throw new Error('No Wild Draw 4 to accept')
  }
  const events = []
  const drew = drawCards(state, seatIndex, 4)
  events.push({ type: UNO_EVENTS.CARD_DRAWN, seatIndex, count: drew, reason: 'penalty' })
  events.push({ type: UNO_EVENTS.WILD_DRAW4_ACCEPTED, seatIndex })
  events.push({ type: UNO_EVENTS.PLAYER_SKIPPED, seatIndex })
  pushAction(state, { type: 'wd4_accepted', seatIndex, drew })
  state.pendingWildDraw4Challenge = null
  state.currentSeatIndex = nextSeat(seatIndex, state.direction, state.seats.length)
  skipEmptyHands(state)
  state.pendingUnoCatch = null
  return events
}

function applyCatchMissedUno(state, seatIndex) {
  if (!state.pendingUnoCatch) throw new Error('No pending UNO catch')
  if (state.pendingUnoCatch.seatIndex === seatIndex) {
    throw new Error('Cannot catch your own missed UNO')
  }
  const target = state.pendingUnoCatch.seatIndex
  const drew = drawCards(state, target, 2)
  state.pendingUnoCatch = null
  pushAction(state, { type: 'uno_caught', catcherSeatIndex: seatIndex, missedSeatIndex: target, drew })
  return [
    { type: UNO_EVENTS.UNO_MISSED, seatIndex: target, penalty: drew },
    { type: UNO_EVENTS.UNO_CAUGHT, catcherSeatIndex: seatIndex, missedSeatIndex: target },
    { type: UNO_EVENTS.CARD_DRAWN, seatIndex: target, count: drew, reason: 'penalty' },
  ]
}

function isPlayableColor(c) {
  return c === 'red' || c === 'yellow' || c === 'green' || c === 'blue'
}
