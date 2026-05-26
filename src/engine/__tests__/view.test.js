import { describe, it, expect } from 'vitest'
import { createInitialState, startHand, getHoleCards, getUpCards } from '../state.js'
import { getPlayerView } from '../view.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

describe('getPlayerView (Hold\'em)', () => {
  it("self.cards contains the viewing player's own cards", () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p2')
    expect(view.self.cards).toHaveLength(2)
    expect(view.self.cards.every((c) => c.visibility === 'private')).toBe(true)
    expect(view.self.cards.map((c) => c.card)).toEqual(getHoleCards(s.players[2]))
  })

  it("opponents do NOT have a holeCards key, and upCards is empty for Hold'em", () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p2')
    for (const opp of view.opponents) {
      expect(Object.prototype.hasOwnProperty.call(opp, 'holeCards')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(opp, 'cards')).toBe(false)
      expect(opp.upCards).toEqual([])
    }
  })

  it('folded opponents still have no private cards exposed', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    s.players[1].folded = true
    const view = getPlayerView(s, 'p2')
    const folded = view.opponents.find((o) => o.id === 'p1')
    expect(folded.folded).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(folded, 'holeCards')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(folded, 'cards')).toBe(false)
  })

  it('exposes tableChat to every player (public information)', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    s.tableChat.push({ handNumber: 1, street: 'preflop', playerId: 'p1', name: 'P1', characterId: null, text: 'Boring.' })
    const view = getPlayerView(s, 'p2')
    expect(view.tableChat).toHaveLength(1)
    expect(view.tableChat[0].text).toBe('Boring.')
  })

  it('returns an empty array when no chat has happened', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p2')
    expect(view.tableChat).toEqual([])
  })

  it('mutating the view does not affect engine state', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p2')
    const originalCards = getHoleCards(s.players[2])
    const originalCommunity = [...s.communityCards]
    const originalHistory = [...s.actionHistory]

    view.self.cards[0].card = 'XX'
    view.communityCards.push('XX')
    view.actionHistory.push({ tampered: true })
    view.opponents[0].stack = 999999

    expect(getHoleCards(s.players[2])).toEqual(originalCards)
    expect(s.communityCards).toEqual(originalCommunity)
    expect(s.actionHistory).toEqual(originalHistory)
    expect(s.players[0].stack).not.toBe(999999)
  })

  it('serialized view contains no other-player hole cards (full JSON scan)', () => {
    const s = createInitialState({ seats: makeSeats(6), rngSeed: 1 })
    startHand(s)
    // Pick the view of p3, then check that none of the other players' actual cards appear in it.
    const view = getPlayerView(s, 'p3')
    const json = JSON.stringify(view)
    const selfStrings = view.self.cards.map((c) => c.card)
    for (const p of s.players) {
      if (p.id === 'p3') continue
      for (const card of getHoleCards(p)) {
        if (selfStrings.includes(card)) continue
        expect(json.includes(`"${card}"`)).toBe(false)
      }
    }
  })
})

describe('getPlayerView (stud)', () => {
  it("opponents expose only their upCards, no private cards under any key", () => {
    const s = createInitialState({
      seats: makeSeats(4),
      gameType: 'stud',
      rngSeed: 1,
    })
    startHand(s)
    // Simulate progressing to 5th street so opponents have 2 private + 3 public.
    // Just hand-shape it for the test.
    s.players[1].cards = [
      { card: '2H', visibility: 'private' },
      { card: '7D', visibility: 'private' },
      { card: 'KC', visibility: 'public' },
      { card: 'AS', visibility: 'public' },
      { card: '9H', visibility: 'public' },
    ]
    const view = getPlayerView(s, 'p2')
    const opp = view.opponents.find((o) => o.id === 'p1')
    expect(opp.upCards).toEqual(['KC', 'AS', '9H'])
    expect(Object.prototype.hasOwnProperty.call(opp, 'cards')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(opp, 'holeCards')).toBe(false)
    // No '2H' or '7D' (private) appears anywhere in serialized view for p1.
    const oppJson = JSON.stringify(opp)
    expect(oppJson).not.toContain('2H')
    expect(oppJson).not.toContain('7D')
  })

  it("self.cards exposes both private and public cards for the viewer", () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p2')
    const self = s.players.find((p) => p.id === 'p2')
    expect(view.self.cards.map((c) => c.card)).toEqual(self.cards.map((c) => c.card))
    expect(view.self.cards.filter((c) => c.visibility === 'private')).toHaveLength(2)
    expect(view.self.cards.filter((c) => c.visibility === 'public')).toHaveLength(1)
  })

  it('gameType, limitStructure, and limits are surfaced on the view', () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p0')
    expect(view.gameType).toBe('stud')
    expect(view.limitStructure).toBe('fixed-limit')
    expect(view.limits).toMatchObject({ ante: 10, bringIn: 25, smallBet: 50, bigBet: 100 })
  })
})
