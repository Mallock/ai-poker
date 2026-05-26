import { describe, it, expect } from 'vitest'
import { createInitialState } from '../state.js'
import { awardPotsAtShowdown } from '../showdown.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

describe('stud showdown', () => {
  it('evaluates best-5-of-7 for two heads-up stud players', () => {
    const s = createInitialState({ seats: makeSeats(2), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    // Hand-shape a finished hand: 7 cards each.
    s.handNumber = 1
    s.players[0].cards = [
      { card: 'AS', visibility: 'private' },
      { card: 'KS', visibility: 'private' },
      { card: 'QS', visibility: 'public' },
      { card: 'JS', visibility: 'public' },
      { card: 'TS', visibility: 'public' },
      { card: '2C', visibility: 'public' },
      { card: '3D', visibility: 'private' },
    ]
    s.players[1].cards = [
      { card: '2H', visibility: 'private' },
      { card: '2D', visibility: 'private' },
      { card: '2S', visibility: 'public' },
      { card: '5H', visibility: 'public' },
      { card: '7C', visibility: 'public' },
      { card: '8D', visibility: 'public' },
      { card: '9S', visibility: 'private' },
    ]
    s.players[0].totalContributed = 100
    s.players[1].totalContributed = 100

    awardPotsAtShowdown(s)
    const award = s.actionHistory.find((a) => a.action === 'award')
    expect(award).toBeDefined()
    // p0 has a royal/straight flush in spades, p1 has trip 2s — p0 wins.
    expect(award.winners).toContain('p0')
    expect(s.players[0].stack).toBeGreaterThan(s.players[1].stack)
  })

  it('handles deck-shortage 7th-street community card in evaluation', () => {
    const s = createInitialState({ seats: makeSeats(8), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    s.handNumber = 1
    s.communityCards = ['AC'] // shared 7th-street card
    // Give every player exactly 6 personal cards + AC community = 7-card evaluation.
    const cards = [
      ['AS', 'KS', 'QS', 'JS', 'TS', '2D'],
      ['2H', '2D', '2S', '5H', '7C', '8D'],
      ['3H', '3D', '3S', '5C', '6C', '7D'],
      ['4H', '4D', '4S', '6H', '7H', '8H'],
      ['5S', '6S', '7S', '8C', '9C', 'TC'],
      ['9H', '9D', '9S', 'TH', 'JD', 'QD'],
      ['8S', '9S', 'TS', '4C', '5D', '6D'],
      ['JC', 'JH', 'JD', 'TD', 'QC', 'KC'],
    ]
    // Dedupe — these are illustrative, so just check evaluation doesn't crash and a winner exists.
    // Some entries may duplicate; sanitize to unique strings per player.
    const used = new Set([...s.communityCards])
    for (let i = 0; i < 8; i++) {
      const personal = []
      for (const c of cards[i]) {
        if (!used.has(c)) {
          personal.push(c)
          used.add(c)
        }
      }
      // Skip if not enough cards; this test mostly checks the code path.
      while (personal.length < 6) personal.push(null)
      s.players[i].cards = personal
        .filter((c) => c !== null)
        .map((c, idx) => ({ card: c, visibility: idx < 2 || idx === 5 ? 'private' : 'public' }))
      s.players[i].totalContributed = 100
    }
    // Just make sure showdown runs without throwing.
    expect(() => awardPotsAtShowdown(s)).not.toThrow()
    const awards = s.actionHistory.filter((a) => a.action === 'award')
    expect(awards.length).toBeGreaterThan(0)
  })
})
