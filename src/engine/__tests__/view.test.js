import { describe, it, expect } from 'vitest'
import { createInitialState, startHand } from '../state.js'
import { getPlayerView } from '../view.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

describe('getPlayerView', () => {
  it('returns own hole cards', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p2')
    expect(view.self.holeCards).toHaveLength(2)
    expect(view.self.holeCards).toEqual(s.players[2].holeCards)
  })

  it("opponents do NOT have a holeCards key at all", () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p2')
    for (const opp of view.opponents) {
      expect(Object.prototype.hasOwnProperty.call(opp, 'holeCards')).toBe(false)
    }
  })

  it('folded opponents still have no holeCards exposed', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    s.players[1].folded = true
    const view = getPlayerView(s, 'p2')
    const folded = view.opponents.find((o) => o.id === 'p1')
    expect(folded.folded).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(folded, 'holeCards')).toBe(false)
  })

  it('mutating the view does not affect engine state', () => {
    const s = createInitialState({ seats: makeSeats(4), rngSeed: 1 })
    startHand(s)
    const view = getPlayerView(s, 'p2')
    const originalCards = [...s.players[2].holeCards]
    const originalCommunity = [...s.communityCards]
    const originalHistory = [...s.actionHistory]

    view.self.holeCards[0] = 'XX'
    view.communityCards.push('XX')
    view.actionHistory.push({ tampered: true })
    view.opponents[0].stack = 999999

    expect(s.players[2].holeCards).toEqual(originalCards)
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
    for (const p of s.players) {
      if (p.id === 'p3') continue
      for (const card of p.holeCards) {
        // p3's own cards could legitimately match an opponent's card by random chance... but they can't
        // because all 12 dealt cards are unique. So any opponent card appearing in p3's view is a leak.
        if (view.self.holeCards.includes(card)) continue
        expect(json.includes(`"${card}"`)).toBe(false)
      }
    }
  })
})
