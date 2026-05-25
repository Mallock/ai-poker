import { describe, it, expect } from 'vitest'
import { createInitialState, startHand } from '../state.js'
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
  it('hides folded opponents\' hole cards even when others reached showdown', () => {
    // 3-handed: p0 folds preflop, p1 and p2 go to showdown.
    const s = createInitialState({ seats: makeSeats(3), startingStack: 1000, rngSeed: 7 })
    startHand(s)
    // toAct is p0 (button = UTG in 3-handed)
    applyAction(s, 'p0', { action: 'fold' })
    // Now p1 (SB) and p2 (BB). p1 acts. Limp + check + check around to showdown.
    applyAction(s, 'p1', { action: 'call' })
    applyAction(s, 'p2', { action: 'check' })
    while (s.street !== 'handComplete') {
      applyAction(s, s.toAct, { action: 'check' })
    }

    // p1 watches the hand back.
    const view = getHandSummaryView(s, 'p1')
    expect(view.wentToShowdown).toBe(true)
    const folded = view.opponents.find((o) => o.id === 'p0')
    expect(folded.folded).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(folded, 'holeCards')).toBe(false)
  })

  it('reveals showdown opponents\' hole cards', () => {
    const s = createInitialState({ seats: makeSeats(2), startingStack: 1000, rngSeed: 3 })
    startHand(s)
    playToShowdownCheckAround(s)
    expect(s.street).toBe('handComplete')

    const view = getHandSummaryView(s, 'p0')
    expect(view.wentToShowdown).toBe(true)
    const opp = view.opponents.find((o) => o.id === 'p1')
    expect(opp.holeCards).toBeDefined()
    expect(opp.holeCards).toHaveLength(2)
    expect(opp.holeCards).toEqual(s.players[1].holeCards)
  })

  it('hides everyone\'s hole cards on an uncontested fold-around', () => {
    // 3-handed: p0 folds, p1 folds, p2 wins uncontested with no showdown.
    const s = createInitialState({ seats: makeSeats(3), startingStack: 1000, rngSeed: 9 })
    startHand(s)
    applyAction(s, 'p0', { action: 'fold' })
    applyAction(s, 'p1', { action: 'fold' })
    expect(s.street).toBe('handComplete')

    const view = getHandSummaryView(s, 'p0')
    expect(view.wentToShowdown).toBe(false)
    for (const opp of view.opponents) {
      expect(Object.prototype.hasOwnProperty.call(opp, 'holeCards')).toBe(false)
    }
  })

  it('returns only documented fields (no engine internals)', () => {
    const s = createInitialState({ seats: makeSeats(2), startingStack: 1000, rngSeed: 1 })
    startHand(s)
    playToShowdownCheckAround(s)
    const view = getHandSummaryView(s, 'p0')

    const allowedTop = new Set([
      'handNumber', 'blinds', 'dealerId', 'communityCards', 'wentToShowdown',
      'self', 'opponents', 'actionHistory', 'potOutcomes',
    ])
    for (const key of Object.keys(view)) {
      expect(allowedTop.has(key)).toBe(true)
    }
    const allowedSelf = new Set([
      'id', 'seatIndex', 'name', 'characterId', 'isHuman',
      'folded', 'allIn', 'eliminated', 'holeCards',
    ])
    for (const key of Object.keys(view.self)) {
      expect(allowedSelf.has(key)).toBe(true)
    }
    const allowedOpp = new Set([
      'id', 'seatIndex', 'name', 'characterId', 'isHuman',
      'folded', 'allIn', 'eliminated', 'holeCards',
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
    view.self.holeCards[0] = 'XX'

    expect(s.communityCards).toEqual(originalCommunity)
    expect(s.actionHistory).toEqual(originalHistory)
    expect(s.players[0].holeCards).not.toContain('XX')
  })
})
