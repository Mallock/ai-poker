import { describe, it, expect } from 'vitest'
import { createInitialState, startHand } from '../state.js'
import { applyAction, legalActions } from '../betting.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

describe('fixed-limit legalActions', () => {
  it('on 3rd street, the bring-in player can complete (raise to smallBet)', () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    const la = legalActions(s, s.toAct)
    expect(la.canRaise).toBe(true)
    expect(la.minRaise).toBe(50) // small bet
    expect(la.maxRaise).toBe(50)
  })

  it('after completion, raises step by smallBet on 3rd/4th', () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    // Bring-in player completes to 50.
    applyAction(s, s.toAct, { action: 'raise', amount: 50 })
    // Next player faces a raise — their min/max raise should be 100 (50 + smallBet).
    const la = legalActions(s, s.toAct)
    expect(la.canRaise).toBe(true)
    expect(la.minRaise).toBe(100)
    expect(la.maxRaise).toBe(100)
  })

  it('caps raises at 3 with 3+ live players', () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    s.raisesThisStreet = 3 // simulate the cap
    const la = legalActions(s, s.toAct)
    expect(la.canRaise).toBe(false)
  })

  it('no raise cap heads-up', () => {
    const s = createInitialState({ seats: makeSeats(2), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    s.raisesThisStreet = 5 // way past the cap
    const la = legalActions(s, s.toAct)
    expect(la.canRaise).toBe(true)
  })

  it('rejects a raise amount that is not the fixed minRaise', () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    // Complete to 50 first
    applyAction(s, s.toAct, { action: 'raise', amount: 50 })
    // Next player attempts an off-amount raise
    expect(() => applyAction(s, s.toAct, { action: 'raise', amount: 150 })).toThrow()
  })

  it('Hold\'em min/max raise math is unchanged', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const la = legalActions(s, s.toAct)
    expect(la.minRaise).toBe(200) // BB 100 + BB 100
    expect(la.maxRaise).toBe(10000) // stack
  })
})
