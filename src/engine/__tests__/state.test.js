import { describe, it, expect } from 'vitest'
import { createInitialState, startHand, getHoleCards, getUpCards } from '../state.js'
import { defaultStudLimitSchedule } from '../limitSchedule.js'

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
    expect(s.players.every((p) => p.cards.length === 2)).toBe(true)
    expect(s.players.every((p) => p.cards.every((c) => c.visibility === 'private'))).toBe(true)
    expect(s.deck).toHaveLength(52 - 12)
  })

  it('all dealt cards are unique', () => {
    const s = createInitialState({ seats: makeSeats(10), rngSeed: 99 })
    startHand(s)
    const all = s.players.flatMap((p) => p.cards.map((c) => c.card))
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

describe('stud createInitialState + startHand', () => {
  it('rejects more than 8 seats in stud', () => {
    expect(() => createInitialState({ seats: makeSeats(9), gameType: 'stud', limitSchedule: defaultStudLimitSchedule() })).toThrow()
  })

  it('rejects unknown gameType', () => {
    expect(() => createInitialState({ seats: makeSeats(4), gameType: 'omaha' })).toThrow(/omaha/)
  })

  it('initializes stud state with fixed-limit defaults', () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud' })
    expect(s.gameType).toBe('stud')
    expect(s.limitStructure).toBe('fixed-limit')
    expect(s.communityCards).toEqual([])
    expect(s.bigBetUnlocked).toBe(false)
    expect(s.raisesThisStreet).toBe(0)
    expect(s.street).toBe('idle')
  })

  it('deals 3 cards (2 private + 1 public) on 3rd street and collects antes', () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    expect(s.street).toBe('third')
    for (const p of s.players) {
      expect(p.cards).toHaveLength(3)
      expect(p.cards[0].visibility).toBe('private')
      expect(p.cards[1].visibility).toBe('private')
      expect(p.cards[2].visibility).toBe('public')
      expect(getHoleCards(p)).toHaveLength(2)
      expect(getUpCards(p)).toHaveLength(1)
    }
    // Ante 10 deducted from every player; bring-in player additionally pays bring-in.
    const totalAntes = s.players.reduce((sum, p) => sum + (p.totalContributed - (p.isBringIn ? 25 : 0)), 0)
    expect(totalAntes).toBe(40)
  })

  it('bring-in is the player with the lowest upcard (suit tiebreak C<D<H<S)', () => {
    // Hand-craft a deck so the upcards are predictable.
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    // Whoever has the lowest visible card (rank then suit) is the bring-in.
    const bringIn = s.players.find((p) => p.isBringIn)
    expect(bringIn).toBeDefined()
    expect(s.toAct).toBe(bringIn.id)
    expect(bringIn.currentBet).toBe(25) // default bring-in
  })
})
