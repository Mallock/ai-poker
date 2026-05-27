import { describe, it, expect } from 'vitest'
import { createUnoDriver, pickDegradedAction, correctAgainstLegal } from '../unoDriver.js'
import { createInitialState, startRound } from '../../engine/state.js'
import { getPlayerView } from '../../engine/view.js'
import { applyAction } from '../../engine/rules.js'
import { makeCard } from '../../engine/cards.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0 }))
}

function buildView({ topCard, hand, mustChoose = false, canAccept = false, canChallenge = false }) {
  return {
    viewerSeatIndex: 1,
    self: { seatIndex: 1, id: 's1', name: 'AI', hand, handSize: hand.length, isHuman: false },
    opponents: [],
    discardTop: topCard,
    activeColor: topCard?.color !== 'wild' ? topCard?.color : 'red',
    drawPileSize: 50,
    direction: 1,
    currentSeatIndex: 1,
    recentActions: [],
    roundNumber: 1,
    totalRounds: 7,
    scores: [0, 0],
    legalActions: {
      plays: hand.map((c, i) => ({ cardIndex: i, requiresWildColor: c.value === 'wild' || c.value === 'wild_draw4' }))
        .filter((p) => {
          const c = hand[p.cardIndex]
          if (c.value === 'wild' || c.value === 'wild_draw4') return true
          if (!topCard) return false
          if (c.color === topCard.color) return true
          if (c.value === topCard.value) return true
          return false
        }),
      canDraw: hand.every((c) => {
        if (c.value === 'wild' || c.value === 'wild_draw4') return false
        if (!topCard) return false
        return c.color !== topCard.color && c.value !== topCard.value
      }),
      canPass: false,
      canChallenge,
      canAccept,
      canCallUno: false,
      canCatchMissedUno: false,
      mustChooseStartingColor: mustChoose,
    },
  }
}

describe('pickDegradedAction', () => {
  it('plays the lowest-value playable numeric, Wilds last', () => {
    const hand = [
      makeCard('blue', 9, 'a'),
      makeCard('red', 2, 'a'),
      makeCard('wild', 'wild', '1'),
      makeCard('red', 7, 'a'),
    ]
    const view = buildView({ topCard: makeCard('red', 5, 'a'), hand })
    const action = pickDegradedAction(view)
    expect(action.action).toBe('play')
    expect(action.cardIndex).toBe(1) // red 2 — lowest playable
  })

  it('draws when nothing is playable', () => {
    const hand = [makeCard('blue', 9, 'a'), makeCard('green', 7, 'a')]
    const view = buildView({ topCard: makeCard('red', 5, 'a'), hand })
    const action = pickDegradedAction(view)
    expect(action.action).toBe('draw')
  })

  it('chooseStartingColor with preferred (most-represented) color', () => {
    const hand = [
      makeCard('blue', 1, 'a'), makeCard('blue', 2, 'a'), makeCard('blue', 3, 'a'),
      makeCard('red', 7, 'a'),
    ]
    const view = buildView({ topCard: makeCard('wild', 'wild', '1'), hand, mustChoose: true })
    const action = pickDegradedAction(view)
    expect(action.action).toBe('chooseStartingColor')
    expect(action.color).toBe('blue')
  })

  it('accepts WD4 (v1 AI does not challenge)', () => {
    const view = buildView({ topCard: makeCard('wild', 'wild_draw4', '1'), hand: [makeCard('red', 5, 'a')], canAccept: true, canChallenge: true })
    const action = pickDegradedAction(view)
    expect(action.action).toBe('accept')
  })
})

describe('correctAgainstLegal', () => {
  it('passes a legal play through, attaching wildColor when needed', () => {
    const hand = [makeCard('red', 5, 'a'), makeCard('wild', 'wild', '1')]
    const view = buildView({ topCard: makeCard('red', 9, 'a'), hand })
    const action = correctAgainstLegal({ action: 'play', cardIndex: 1 }, view)
    expect(action.action).toBe('play')
    expect(action.cardIndex).toBe(1)
    expect(action.wildColor).toBeTruthy()
  })

  it('rewrites an illegal cardIndex to a heuristic legal action', () => {
    const hand = [makeCard('red', 5, 'a')]
    const view = buildView({ topCard: makeCard('red', 9, 'a'), hand })
    const action = correctAgainstLegal({ action: 'play', cardIndex: 7 }, view)
    expect(action.action).toBe('play')
    expect(action.cardIndex).toBe(0)
  })

  it('chooseStartingColor falls back to preferred color when model omits it', () => {
    const hand = [makeCard('green', 1, 'a'), makeCard('green', 2, 'a')]
    const view = buildView({ topCard: makeCard('wild', 'wild', '1'), hand, mustChoose: true })
    const action = correctAgainstLegal({ action: 'play', cardIndex: 0 }, view)
    expect(action.action).toBe('chooseStartingColor')
    expect(action.color).toBe('green')
  })
})

describe('createUnoDriver (degraded mode)', () => {
  it('returns a legal action without calling the LLM in degraded mode', async () => {
    const driver = createUnoDriver({ characterId: 'the-cowboy', degraded: true })
    const s = createInitialState({ seats: seats(2), totalRounds: 3, rngSeed: 1 })
    startRound(s)
    const view = getPlayerView(s, s.currentSeatIndex)
    const action = await driver(view)
    expect(action).toBeTruthy()
    expect(['play', 'draw', 'pass', 'chooseStartingColor', 'accept']).toContain(action.action)
  })

  it('round can play to completion using only the degraded driver', async () => {
    const driver = createUnoDriver({ characterId: 'the-cowboy', degraded: true })
    const s = createInitialState({ seats: seats(3), totalRounds: 3, rngSeed: 1 })
    startRound(s)
    // Step the engine until either the round completes or we exceed a safety cap.
    for (let step = 0; step < 500 && !s.roundComplete; step++) {
      const view = getPlayerView(s, s.currentSeatIndex)
      const action = await driver(view)
      applyAction(s, s.currentSeatIndex, action)
    }
    expect(s.roundComplete).toBe(true)
    expect(s.roundWinnerSeatIndex).not.toBeNull()
  })
})
