import { describe, it, expect } from 'vitest'
import { createInitialState, startHand } from '../state.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    isHuman: i === 0,
  }))
}

describe('createInitialState', () => {
  it('rejects fewer than 2 seats', () => {
    expect(() => createInitialState({ seats: makeSeats(1) })).toThrow()
  })

  it('rejects more than 10 seats', () => {
    expect(() => createInitialState({ seats: makeSeats(11) })).toThrow()
  })

  it('initializes stacks to startingStack', () => {
    const s = createInitialState({ seats: makeSeats(4), startingStack: 5000, rngSeed: 1 })
    expect(s.players.every((p) => p.stack === 5000)).toBe(true)
  })
})

describe('startHand', () => {
  it('deals 2 hole cards to each player and N cards leave the deck', () => {
    const s = createInitialState({ seats: makeSeats(6), rngSeed: 1 })
    startHand(s)
    expect(s.players.every((p) => p.holeCards.length === 2)).toBe(true)
    expect(s.deck).toHaveLength(52 - 12)
  })

  it('all dealt cards are unique', () => {
    const s = createInitialState({ seats: makeSeats(10), rngSeed: 99 })
    startHand(s)
    const all = s.players.flatMap((p) => p.holeCards)
    expect(new Set(all).size).toBe(20)
  })

  it('posts SB and BB and sets toAct to UTG', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 5 })
    startHand(s)
    expect(s.currentBet).toBe(100) // default BB
    expect(s.street).toBe('preflop')
    // dealer index 0 → SB p1, BB p2, UTG p3 first to act
    expect(s.toAct).toBe('p3')
  })

  it('heads-up: SB = button = first to act preflop', () => {
    const s = createInitialState({ seats: makeSeats(2), rngSeed: 5 })
    startHand(s)
    // dealerIndex 0; heads-up SB is the button
    expect(s.toAct).toBe('p0')
    expect(s.players[0].currentBet).toBe(50) // SB
    expect(s.players[1].currentBet).toBe(100) // BB
  })
})
