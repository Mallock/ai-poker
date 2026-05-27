import { describe, it, expect } from 'vitest'
import { createInitialState } from '../state.js'
import { legalActions, applyAction, canPlayOn } from '../rules.js'
import { makeCard } from '../cards.js'
import { UNO_EVENTS } from '../events.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0 }))
}

// Build a state with controlled hands, discard top, and draw pile. Skips the random start
// so tests are deterministic. Hands must be passed in.
function buildControlledState({ seatCount = 4, hands, topCard, chosenColor, drawPile = [], currentSeatIndex = 0, direction = 1, totalRounds = 7 } = {}) {
  const s = createInitialState({ seats: seats(seatCount), totalRounds, rngSeed: 1 })
  s.hands = hands ?? Array.from({ length: seatCount }, () => [])
  const entry = { card: topCard }
  if (chosenColor !== undefined) entry.chosenColor = chosenColor
  s.discardPile = [entry]
  s.drawPile = drawPile
  s.currentSeatIndex = currentSeatIndex
  s.direction = direction
  s.roundNumber = 1
  s.firstToActForRound = currentSeatIndex
  return s
}

describe('canPlayOn', () => {
  it('matches by color', () => {
    const state = buildControlledState({ topCard: makeCard('red', 5, 'a') })
    expect(canPlayOn(makeCard('red', 9, 'a'), state)).toBe(true)
  })
  it('matches by value across colors', () => {
    const state = buildControlledState({ topCard: makeCard('red', 5, 'a') })
    expect(canPlayOn(makeCard('blue', 5, 'a'), state)).toBe(true)
  })
  it('wild and wild_draw4 always play', () => {
    const state = buildControlledState({ topCard: makeCard('red', 5, 'a') })
    expect(canPlayOn(makeCard('wild', 'wild', '1'), state)).toBe(true)
    expect(canPlayOn(makeCard('wild', 'wild_draw4', '1'), state)).toBe(true)
  })
  it('non-matching non-wild fails', () => {
    const state = buildControlledState({ topCard: makeCard('red', 5, 'a') })
    expect(canPlayOn(makeCard('blue', 9, 'a'), state)).toBe(false)
  })
})

describe('legalActions', () => {
  it('lists only playable cards as plays', () => {
    // Top is red 5. red 9 matches by color; blue 5 matches by value; wild always plays;
    // blue 9 matches neither.
    const hand = [
      makeCard('red', 9, 'a'),
      makeCard('blue', 5, 'a'),
      makeCard('wild', 'wild', '1'),
      makeCard('blue', 9, 'a'),
    ]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    const la = legalActions(state, 0)
    expect(la.plays.map((p) => p.cardIndex).sort()).toEqual([0, 1, 2])
    expect(la.plays.find((p) => p.cardIndex === 2).requiresWildColor).toBe(true)
    expect(la.canDraw).toBe(false)
  })
  it('reports canDraw when nothing is playable', () => {
    const hand = [makeCard('blue', 9, 'a'), makeCard('green', 7, 'a')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    const la = legalActions(state, 0)
    expect(la.plays).toEqual([])
    expect(la.canDraw).toBe(true)
  })
})

describe('applyAction — basic play', () => {
  it('plays a numeric card and advances turn clockwise', () => {
    const hand = [makeCard('red', 9, 'a'), makeCard('blue', 7, 'a')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    const events = applyAction(state, 0, { action: 'play', cardIndex: 0 })
    expect(state.hands[0]).toHaveLength(1)
    expect(state.discardPile[state.discardPile.length - 1].card.value).toBe(9)
    expect(state.currentSeatIndex).toBe(1)
    expect(events.find((e) => e.type === UNO_EVENTS.CARD_PLAYED)).toBeTruthy()
  })

  it('throws on a play that does not match', () => {
    const hand = [makeCard('blue', 9, 'a')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    expect(() => applyAction(state, 0, { action: 'play', cardIndex: 0 })).toThrow()
  })

  it('rejects a wild play without a color', () => {
    const hand = [makeCard('wild', 'wild', '1')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    expect(() => applyAction(state, 0, { action: 'play', cardIndex: 0 })).toThrow()
  })
})

describe('action card effects', () => {
  // A buffer card keeps the hand non-empty so the play doesn't end the round before
  // card effects (skip/reverse/draw2/wild) run.
  const bufferCard = () => makeCard('blue', 2, 'buffer')

  it('Skip advances past the next seat', () => {
    const hand = [makeCard('red', 'skip', 'a'), bufferCard()]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0 })
    expect(state.currentSeatIndex).toBe(2)
  })

  it('Reverse with 4 players flips direction', () => {
    const hand = [makeCard('red', 'reverse', 'a'), bufferCard()]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0 })
    expect(state.direction).toBe(-1)
    // From seat 0 going counter-clockwise → seat 3.
    expect(state.currentSeatIndex).toBe(3)
  })

  it('Reverse with 2 players acts as Skip', () => {
    const hand = [makeCard('red', 'reverse', 'a'), bufferCard()]
    const state = buildControlledState({
      seatCount: 2,
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, []],
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0 })
    expect(state.direction).toBe(1) // unchanged
    expect(state.currentSeatIndex).toBe(0) // same player plays again
  })

  it('Draw 2 makes next player draw 2 and skips them', () => {
    const hand = [makeCard('red', 'draw2', 'a'), bufferCard()]
    const drawPile = [makeCard('blue', 1, 'a'), makeCard('green', 3, 'a')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      drawPile,
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0 })
    expect(state.hands[1]).toHaveLength(2)
    expect(state.currentSeatIndex).toBe(2)
  })

  it('Wild with chosen color sets activeColor', () => {
    const hand = [makeCard('wild', 'wild', '1'), bufferCard()]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0, wildColor: 'green' })
    expect(state.discardPile[state.discardPile.length - 1].chosenColor).toBe('green')
    expect(state.currentSeatIndex).toBe(1)
  })

  it('Wild Draw 4 puts the victim into a challenge state', () => {
    const hand = [makeCard('wild', 'wild_draw4', '1'), bufferCard()]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0, wildColor: 'green' })
    expect(state.pendingWildDraw4Challenge).toBeTruthy()
    expect(state.pendingWildDraw4Challenge.victimSeatIndex).toBe(1)
    expect(state.currentSeatIndex).toBe(1)
    const la = legalActions(state, 1)
    expect(la.canChallenge).toBe(true)
    expect(la.canAccept).toBe(true)
  })
})

describe('Wild Draw 4 challenge', () => {
  it('successful challenge: player draws 4, challenger plays normally', () => {
    // Seat 0 has WD4 + a red 9 (which matches the previous color red). So a challenge succeeds.
    const hand = [makeCard('wild', 'wild_draw4', '1'), makeCard('red', 9, 'a')]
    const drawPile = Array.from({ length: 10 }, (_, i) => makeCard('blue', (i % 9) + 1, String(i)))
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [makeCard('green', 4, 'a')], [], []],
      drawPile,
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0, wildColor: 'green' })
    applyAction(state, 1, { action: 'challenge' })
    expect(state.hands[0]).toHaveLength(1 + 4) // original 1 leftover + 4 penalty
    expect(state.currentSeatIndex).toBe(1) // challenger acts normally
  })

  it('failed challenge: challenger draws 6 and is skipped', () => {
    // Seat 0 has WD4 only — no card matches the previous red color/value.
    const hand = [makeCard('wild', 'wild_draw4', '1'), makeCard('blue', 9, 'a')]
    const drawPile = Array.from({ length: 10 }, (_, i) => makeCard('green', (i % 9) + 1, String(i)))
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [makeCard('blue', 4, 'a')], [], []],
      drawPile,
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0, wildColor: 'green' })
    applyAction(state, 1, { action: 'challenge' })
    expect(state.hands[1]).toHaveLength(1 + 6)
    expect(state.currentSeatIndex).toBe(2) // challenger skipped
  })

  it('accept: challenger draws 4 and is skipped', () => {
    const hand = [makeCard('wild', 'wild_draw4', '1'), makeCard('blue', 2, 'buf')]
    const drawPile = Array.from({ length: 10 }, (_, i) => makeCard('blue', (i % 9) + 1, String(i)))
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [makeCard('blue', 4, 'a')], [], []],
      drawPile,
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0, wildColor: 'green' })
    applyAction(state, 1, { action: 'accept' })
    expect(state.hands[1]).toHaveLength(1 + 4)
    expect(state.currentSeatIndex).toBe(2)
  })
})

describe('draw and pass', () => {
  it('draw + drawn-card-unplayable auto-advances turn', () => {
    const hand = [makeCard('blue', 9, 'a')]
    const drawPile = [makeCard('yellow', 7, 'a')] // not red, not 5
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      drawPile,
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'draw' })
    expect(state.hands[0]).toHaveLength(2)
    expect(state.currentSeatIndex).toBe(1)
  })

  it('draw + drawn-card-playable opens a play-or-pass window', () => {
    const hand = [makeCard('blue', 9, 'a')]
    const drawPile = [makeCard('red', 2, 'a')] // matches red
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [], [], []],
      drawPile,
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'draw' })
    expect(state.midTurnDraw).toBeTruthy()
    expect(state.currentSeatIndex).toBe(0)
    const la = legalActions(state, 0)
    expect(la.plays).toHaveLength(1)
    expect(la.canPass).toBe(true)
    // Pass after a draw advances.
    applyAction(state, 0, { action: 'pass' })
    expect(state.currentSeatIndex).toBe(1)
  })
})

describe('reshuffle on draw-pile underflow', () => {
  it('reshuffles the discard except the top when draw pile empties', () => {
    // 1 card in the draw pile, but seat 0 needs to draw 2 (from a Draw 2 effect).
    const hand0 = [makeCard('red', 'draw2', 'a'), makeCard('blue', 2, 'buffer')]
    const drawPile = [makeCard('blue', 1, 'a')] // only one
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand0, [], [], []],
      drawPile,
      currentSeatIndex: 0,
    })
    // Inject some discard history we can reshuffle from.
    state.discardPile = [
      { card: makeCard('green', 2, 'a') },
      { card: makeCard('yellow', 8, 'a') },
      { card: makeCard('red', 5, 'a') }, // top — preserved
    ]
    applyAction(state, 0, { action: 'play', cardIndex: 0 })
    // Victim is seat 1: drew 2. One came from drawPile, the second forced a reshuffle.
    expect(state.hands[1]).toHaveLength(2)
    // Top of discard remains red 5 (... plus the draw2 that was just played on top).
    const top = state.discardPile[state.discardPile.length - 1]
    expect(top.card.value).toBe('draw2')
  })
})

describe('missed-UNO catch window', () => {
  it('flags a missed UNO when a play takes a seat to 1 card without callUno', () => {
    // Seat 0 has 2 cards, plays one and goes to 1 without calling UNO.
    const hand = [makeCard('red', 9, 'a'), makeCard('blue', 9, 'a')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [makeCard('green', 4, 'a')], [], []],
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0 })
    expect(state.pendingUnoCatch).toEqual({ seatIndex: 0 })
    // Another seat catches it (out of turn).
    applyAction(state, 2, { action: 'catchMissedUno' })
    expect(state.hands[0]).toHaveLength(2) // 1 leftover + 2 penalty - 1 played = 2
    expect(state.pendingUnoCatch).toBeNull()
  })

  it('no missed-UNO penalty when callUno is set', () => {
    const hand = [makeCard('red', 9, 'a'), makeCard('blue', 9, 'a')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [makeCard('green', 4, 'a')], [], []],
      currentSeatIndex: 0,
    })
    const events = applyAction(state, 0, { action: 'play', cardIndex: 0, callUno: true })
    expect(state.pendingUnoCatch).toBeNull()
    expect(events.find((e) => e.type === UNO_EVENTS.UNO_CALLED)).toBeTruthy()
  })

  it('window closes when the next seat plays / draws', () => {
    // Seat 0 misses; seat 1 starts their turn before any catch — window closes.
    const hand0 = [makeCard('red', 9, 'a'), makeCard('blue', 9, 'a')]
    const hand1 = [makeCard('green', 4, 'a')]
    const drawPile = [makeCard('blue', 2, 'a')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand0, hand1, [], []],
      drawPile,
      currentSeatIndex: 0,
    })
    applyAction(state, 0, { action: 'play', cardIndex: 0 })
    expect(state.pendingUnoCatch).toEqual({ seatIndex: 0 })
    // Seat 1's turn — they draw. This should close the window.
    applyAction(state, 1, { action: 'draw' })
    expect(state.pendingUnoCatch).toBeNull()
    // Seat 2 catch now fails (no pending).
    expect(() => applyAction(state, 2, { action: 'catchMissedUno' })).toThrow()
  })
})

describe('round end detection', () => {
  it('sets roundComplete and roundWinnerSeatIndex when the last card is played', () => {
    const hand = [makeCard('red', 9, 'a')]
    const state = buildControlledState({
      topCard: makeCard('red', 5, 'a'),
      hands: [hand, [makeCard('blue', 4, 'a')], [], []],
      currentSeatIndex: 0,
    })
    const events = applyAction(state, 0, { action: 'play', cardIndex: 0, callUno: true })
    expect(state.roundComplete).toBe(true)
    expect(state.roundWinnerSeatIndex).toBe(0)
    expect(events.find((e) => e.type === UNO_EVENTS.ROUND_WON)).toBeTruthy()
  })
})
