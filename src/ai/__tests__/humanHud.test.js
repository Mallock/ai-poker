import { describe, it, expect } from 'vitest'
import { describeHumanHud } from '../humanHud.js'

function privateCards(cards) {
  return cards.map((c) => ({ card: c, visibility: 'private' }))
}
function withVisibility(pairs) {
  return pairs.map(([card, visibility]) => ({ card, visibility }))
}

describe('describeHumanHud — Hold\'em', () => {
  it('returns null when human is folded', () => {
    const state = {
      gameType: 'holdem',
      communityCards: [],
      players: [{ id: 'human', folded: true, eliminated: false, cards: privateCards(['AS', 'AD']) }],
    }
    expect(describeHumanHud(state, 'human')).toBeNull()
  })

  it('returns preflop label with empty best-cards set before the flop', () => {
    const state = {
      gameType: 'holdem',
      communityCards: [],
      players: [{ id: 'human', folded: false, eliminated: false, cards: privateCards(['AS', 'AD']) }],
    }
    const r = describeHumanHud(state, 'human')
    expect(r).not.toBeNull()
    expect(r.isPreflop).toBe(true)
    expect(r.label).toMatch(/A-A/)
    expect(r.bestCards.size).toBe(0)
  })

  it('returns made-hand label + best-5 cards once the flop arrives', () => {
    const state = {
      gameType: 'holdem',
      communityCards: ['AH', 'KH', '7D'],
      players: [{ id: 'human', folded: false, eliminated: false, cards: privateCards(['AS', 'AD']) }],
    }
    const r = describeHumanHud(state, 'human')
    expect(r).not.toBeNull()
    expect(r.isPreflop).toBe(false)
    expect(r.label.toLowerCase()).toMatch(/three of a kind, a/i) // trip aces
    // Best-5 includes the trip aces.
    expect(r.bestCards.has('AS')).toBe(true)
    expect(r.bestCards.has('AH')).toBe(true)
    expect(r.bestCards.has('AD')).toBe(true)
  })

  it('appends draw notes when a flush draw is live', () => {
    const state = {
      gameType: 'holdem',
      communityCards: ['AH', 'KH', '7D'],
      players: [{ id: 'human', folded: false, eliminated: false, cards: privateCards(['QH', 'JH']) }],
    }
    const r = describeHumanHud(state, 'human')
    expect(r).not.toBeNull()
    expect(r.label.toLowerCase()).toContain('flush')
  })
})

describe('describeHumanHud — Stud', () => {
  it('returns the structural label on 3rd street with no made-5 yet', () => {
    const state = {
      gameType: 'stud',
      communityCards: [],
      players: [
        {
          id: 'human',
          folded: false,
          eliminated: false,
          cards: withVisibility([['AS', 'private'], ['AD', 'private'], ['AH', 'public']]),
        },
        { id: 'opp', folded: false, eliminated: false, cards: withVisibility([['KS', 'public']]) },
      ],
    }
    const r = describeHumanHud(state, 'human')
    expect(r).not.toBeNull()
    expect(r.isPreflop).toBe(true)
    expect(r.label.toLowerCase()).toContain('rolled-up')
  })

  it('returns made-hand label once we have at least 5 cards', () => {
    const state = {
      gameType: 'stud',
      communityCards: [],
      players: [
        {
          id: 'human',
          folded: false,
          eliminated: false,
          cards: withVisibility([
            ['AS', 'private'], ['AD', 'private'], ['AH', 'public'],
            ['AC', 'public'], ['7D', 'public'],
          ]),
        },
        { id: 'opp', folded: false, eliminated: false, cards: withVisibility([['KS', 'public']]) },
      ],
    }
    const r = describeHumanHud(state, 'human')
    expect(r).not.toBeNull()
    expect(r.isPreflop).toBe(false)
    expect(r.label.toLowerCase()).toMatch(/four|quad/)
    expect(r.bestCards.has('AS')).toBe(true)
    expect(r.bestCards.has('AC')).toBe(true)
  })
})
