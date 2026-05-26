import { describe, it, expect } from 'vitest'
import { createInitialState, startHand, getHoleCards } from '../state.js'
import { applyAction } from '../betting.js'
import { getHandSummaryView } from '../view.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

function playToShowdownCheckAround(state) {
  // Heads-up: button/SB calls, BB checks, then everyone checks every street.
  applyAction(state, state.toAct, { action: 'call' })
  applyAction(state, state.toAct, { action: 'check' })
  while (state.street !== 'handComplete') {
    applyAction(state, state.toAct, { action: 'check' })
  }
}

describe('getHandSummaryView', () => {
  it('hides folded opponents\' cards even when others reached showdown', () => {
    // 3-handed: p0 folds preflop, p1 and p2 go to showdown.
    const s = createInitialState({ seats: makeSeats(3), startingStack: 1000, rngSeed: 7 })
    startHand(s)
    applyAction(s, 'p0', { action: 'fold' })
    applyAction(s, 'p1', { action: 'call' })
    applyAction(s, 'p2', { action: 'check' })
    while (s.street !== 'handComplete') {
      applyAction(s, s.toAct, { action: 'check' })
    }

    const view = getHandSummaryView(s, 'p1')
    expect(view.wentToShowdown).toBe(true)
    const folded = view.opponents.find((o) => o.id === 'p0')
    expect(folded.folded).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(folded, 'cards')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(folded, 'holeCards')).toBe(false)
  })

  it('reveals showdown opponents\' cards', () => {
    const s = createInitialState({ seats: makeSeats(2), startingStack: 1000, rngSeed: 3 })
    startHand(s)
    playToShowdownCheckAround(s)
    expect(s.street).toBe('handComplete')

    const view = getHandSummaryView(s, 'p0')
    expect(view.wentToShowdown).toBe(true)
    const opp = view.opponents.find((o) => o.id === 'p1')
    expect(opp.cards).toBeDefined()
    expect(opp.cards).toHaveLength(2)
    expect(opp.cards.map((c) => c.card)).toEqual(getHoleCards(s.players[1]))
  })

  it('hides everyone\'s cards on an uncontested fold-around', () => {
    const s = createInitialState({ seats: makeSeats(3), startingStack: 1000, rngSeed: 9 })
    startHand(s)
    applyAction(s, 'p0', { action: 'fold' })
    applyAction(s, 'p1', { action: 'fold' })
    expect(s.street).toBe('handComplete')

    const view = getHandSummaryView(s, 'p0')
    expect(view.wentToShowdown).toBe(false)
    for (const opp of view.opponents) {
      expect(Object.prototype.hasOwnProperty.call(opp, 'cards')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(opp, 'holeCards')).toBe(false)
    }
  })

  it('returns only documented fields (no engine internals)', () => {
    const s = createInitialState({ seats: makeSeats(2), startingStack: 1000, rngSeed: 1 })
    startHand(s)
    playToShowdownCheckAround(s)
    const view = getHandSummaryView(s, 'p0')

    const allowedTop = new Set([
      'gameType', 'handNumber', 'blinds', 'dealerId', 'communityCards', 'wentToShowdown',
      'self', 'opponents', 'actionHistory', 'potOutcomes',
    ])
    for (const key of Object.keys(view)) {
      expect(allowedTop.has(key)).toBe(true)
    }
    const allowedSelf = new Set([
      'id', 'seatIndex', 'name', 'characterId', 'isHuman',
      'folded', 'allIn', 'eliminated', 'cards',
    ])
    for (const key of Object.keys(view.self)) {
      expect(allowedSelf.has(key)).toBe(true)
    }
    const allowedOpp = new Set([
      'id', 'seatIndex', 'name', 'characterId', 'isHuman',
      'folded', 'allIn', 'eliminated', 'cards', 'upCards',
    ])
    for (const opp of view.opponents) {
      for (const key of Object.keys(opp)) {
        expect(allowedOpp.has(key)).toBe(true)
      }
    }
  })

  it('mutating the view does not affect engine state', () => {
    const s = createInitialState({ seats: makeSeats(2), startingStack: 1000, rngSeed: 5 })
    startHand(s)
    playToShowdownCheckAround(s)
    const view = getHandSummaryView(s, 'p0')
    const originalCommunity = [...s.communityCards]
    const originalHistory = [...s.actionHistory]

    view.communityCards.push('XX')
    view.actionHistory.push({ tampered: true })
    view.self.cards[0].card = 'XX'

    expect(s.communityCards).toEqual(originalCommunity)
    expect(s.actionHistory).toEqual(originalHistory)
    expect(getHoleCards(s.players[0])).not.toContain('XX')
  })
})
