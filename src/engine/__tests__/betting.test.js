import { describe, it, expect } from 'vitest'
import { createInitialState, startHand } from '../state.js'
import { legalActions, applyAction } from '../betting.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

describe('legalActions', () => {
  it('returns empty for player not to act', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    expect(legalActions(s, 'p0').canFold).toBe(false)
  })

  it('UTG can fold/call/raise/all-in, cannot check', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const la = legalActions(s, s.toAct)
    expect(la.canFold).toBe(true)
    expect(la.canCall).toBe(true)
    expect(la.canCheck).toBe(false)
    expect(la.canRaise).toBe(true)
    expect(la.canAllIn).toBe(true)
    expect(la.callAmount).toBe(100) // call the BB
    expect(la.minRaise).toBe(200)   // min raise = currentBet + lastRaise = 100 + 100
  })
})

describe('applyAction', () => {
  it('rejects raise below min', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    expect(() => applyAction(s, s.toAct, { action: 'raise', amount: 150 })).toThrow()
  })

  it('accepts a min raise and reopens action', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const utg = s.toAct
    applyAction(s, utg, { action: 'raise', amount: 200 })
    expect(s.currentBet).toBe(200)
    expect(s.lastRaiseSize).toBe(100)
    // BB has hasActedThisStreet false even after the raise.
    const bb = s.players.find((p) => p.currentBet === 100)
    expect(bb.hasActedThisStreet).toBe(false)
  })

  it('rejects action from wrong player', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const notToAct = s.players.find((p) => p.id !== s.toAct).id
    expect(() => applyAction(s, notToAct, { action: 'fold' })).toThrow()
  })

  it('rejects check when there is a bet to call', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    expect(() => applyAction(s, s.toAct, { action: 'check' })).toThrow()
  })

  it('records a non-empty say into state.tableChat', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const utg = s.toAct
    applyAction(s, utg, { action: 'fold', say: 'Not my hand.' })
    expect(s.tableChat).toHaveLength(1)
    expect(s.tableChat[0]).toMatchObject({ playerId: utg, text: 'Not my hand.', street: 'preflop' })
  })

  it('ignores missing or blank say (no chat entry)', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    applyAction(s, s.toAct, { action: 'fold' })
    applyAction(s, s.toAct, { action: 'fold', say: '   ' })
    applyAction(s, s.toAct, { action: 'fold', say: null })
    expect(s.tableChat).toHaveLength(0)
  })

  it('fold-around wins the pot uncontested', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    // Everyone folds except BB.
    applyAction(s, s.toAct, { action: 'fold' }) // UTG (p3)
    applyAction(s, s.toAct, { action: 'fold' }) // button (p0)
    applyAction(s, s.toAct, { action: 'fold' }) // SB (p1)
    // Now BB (p2) is the last non-folded player; hand should end.
    expect(s.street).toBe('handComplete')
    const bb = s.players[2]
    // BB started with 10000, posted 100, won SB(50)+BB(100) = 150 pot, so net: 10000 - 100 + 150 = 10050
    expect(bb.stack).toBe(10050)
  })
})
