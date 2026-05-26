import { describe, it, expect } from 'vitest'
import { estimateHumanEquity } from '../equity.js'

function privateCards(cards) {
  return cards.map((c) => ({ card: c, visibility: 'private' }))
}
function withVisibility(pairs) {
  return pairs.map(([card, visibility]) => ({ card, visibility }))
}

// Minimal state factory matching the engine shape. We only set the fields equity reads.
function holdemState({ humanCards, community = [], opponents }) {
  return {
    gameType: 'holdem',
    street: community.length === 0 ? 'preflop' : community.length === 3 ? 'flop' : community.length === 4 ? 'turn' : 'river',
    communityCards: community,
    players: [
      { id: 'human', folded: false, eliminated: false, cards: privateCards(humanCards) },
      ...opponents.map((opp, i) => ({
        id: `opp${i}`,
        folded: !!opp.folded,
        eliminated: !!opp.eliminated,
        cards: opp.cards ? privateCards(opp.cards) : [],
      })),
    ],
  }
}

function studState({ humanCards, opponents }) {
  // humanCards/opponent cards: array of [card, visibility] pairs.
  return {
    gameType: 'stud',
    street: 'third',
    communityCards: [],
    players: [
      { id: 'human', folded: false, eliminated: false, cards: withVisibility(humanCards) },
      ...opponents.map((opp, i) => ({
        id: `opp${i}`,
        folded: !!opp.folded,
        eliminated: !!opp.eliminated,
        cards: withVisibility(opp.cards ?? []),
      })),
    ],
  }
}

describe('estimateHumanEquity — Hold\'em', () => {
  it('returns null when human has folded', () => {
    const s = holdemState({ humanCards: ['AS', 'AD'], opponents: [{ cards: [] }] })
    s.players[0].folded = true
    expect(estimateHumanEquity(s, 'human')).toBeNull()
  })

  it('returns null when there are no active opponents', () => {
    const s = holdemState({ humanCards: ['AS', 'AD'], opponents: [{ folded: true }] })
    expect(estimateHumanEquity(s, 'human')).toBeNull()
  })

  it('aces-full vs naked opponent on the river is essentially a lock', () => {
    // Human: AS AD. Board: AH AC 7D 4S 2C → quads aces.
    const s = holdemState({
      humanCards: ['AS', 'AD'],
      community: ['AH', 'AC', '7D', '4S', '2C'],
      opponents: [{ cards: [] }],
    })
    const r = estimateHumanEquity(s, 'human', { trials: 200 })
    expect(r).not.toBeNull()
    expect(r.equity).toBeGreaterThan(0.99)
  })

  it('72o vs aces preflop should be far below 50%', () => {
    const s = holdemState({
      humanCards: ['7C', '2H'],
      community: [],
      opponents: [{ cards: [] }, { cards: [] }],
    })
    const r = estimateHumanEquity(s, 'human', { trials: 200 })
    expect(r).not.toBeNull()
    expect(r.equity).toBeLessThan(0.45)
  })

  it('returns a result with all expected fields populated', () => {
    const s = holdemState({
      humanCards: ['KS', 'KH'],
      community: ['QH', '5D', '2C'],
      opponents: [{ cards: [] }, { cards: [] }],
    })
    const r = estimateHumanEquity(s, 'human', { trials: 100 })
    expect(r).toMatchObject({
      win: expect.any(Number),
      tie: expect.any(Number),
      equity: expect.any(Number),
      samples: expect.any(Number),
      opponents: 2,
    })
    expect(r.equity).toBeGreaterThan(0)
    expect(r.equity).toBeLessThanOrEqual(1)
  })
})

describe('estimateHumanEquity — Stud', () => {
  it('returns null at 3rd street with no opponents', () => {
    const s = studState({
      humanCards: [['AS', 'private'], ['AD', 'private'], ['AH', 'public']],
      opponents: [{ folded: true, cards: [['QS', 'public']] }],
    })
    expect(estimateHumanEquity(s, 'human')).toBeNull()
  })

  it('rolled-up aces vs random opponent is heavily favoured', () => {
    const s = studState({
      humanCards: [['AS', 'private'], ['AD', 'private'], ['AH', 'public']],
      opponents: [{ cards: [['2C', 'public']] }],
    })
    const r = estimateHumanEquity(s, 'human', { trials: 150 })
    expect(r).not.toBeNull()
    expect(r.equity).toBeGreaterThan(0.7)
  })

  it('returns a result with opponents count reflecting only live seats', () => {
    const s = studState({
      humanCards: [['7C', 'private'], ['2H', 'private'], ['9D', 'public']],
      opponents: [
        { cards: [['KS', 'public']] },
        { folded: true, cards: [['JH', 'public']] }, // folded — excluded
        { cards: [['QC', 'public']] },
      ],
    })
    const r = estimateHumanEquity(s, 'human', { trials: 100 })
    expect(r).not.toBeNull()
    expect(r.opponents).toBe(2)
  })
})
