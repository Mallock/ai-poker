import { describe, it, expect } from 'vitest'
import { createInitialState, startRound, recordChat } from '../state.js'
import { getPlayerView } from '../view.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0 }))
}

describe('getPlayerView', () => {
  it('exposes the viewer\'s own hand and only opponent hand sizes', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: 1 })
    startRound(s)
    const view = getPlayerView(s, 0)
    expect(view.self.hand).toHaveLength(7)
    expect(view.self.hand[0]).toHaveProperty('id')
    expect(view.self.hand[0]).toHaveProperty('color')
    expect(view.self.hand[0]).toHaveProperty('value')
    expect(view.opponents).toHaveLength(3)
    for (const o of view.opponents) {
      expect(o).not.toHaveProperty('hand')
      expect(o.handSize).toBe(7)
    }
  })

  it('reports activeColor and discardTop', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: 1 })
    startRound(s)
    const view = getPlayerView(s, 0)
    expect(view.discardTop).toBeTruthy()
    // For non-Wild starting cards, activeColor === discardTop.color.
    if (view.discardTop.color !== 'wild') {
      expect(view.activeColor).toBe(view.discardTop.color)
    }
  })

  it('includes legalActions in the view', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: 1 })
    startRound(s)
    const view = getPlayerView(s, s.currentSeatIndex)
    expect(view.legalActions).toBeTruthy()
    expect(Array.isArray(view.legalActions.plays)).toBe(true)
  })

  it('exposes recent table chat (human + AI) in order, attributed by seat', () => {
    const customSeats = [
      { id: 's0', name: 'Mika', isHuman: true, characterId: null },
      { id: 's1', name: 'Wade', isHuman: false, characterId: 'the-cowboy' },
      { id: 's2', name: 'Vera', isHuman: false, characterId: 'the-shark' },
    ]
    const s = createInitialState({ seats: customSeats, totalRounds: 3, rngSeed: 1 })
    startRound(s)
    recordChat(s, 0, 'gg everyone')   // human
    recordChat(s, 1, 'we will see')   // AI
    recordChat(s, 0, '   ')           // blank → ignored
    const view = getPlayerView(s, 2)
    expect(view.tableChat.map((c) => c.text)).toEqual(['gg everyone', 'we will see'])
    expect(view.tableChat[0]).toMatchObject({ seatIndex: 0, name: 'Mika', characterId: null })
    expect(view.tableChat[1]).toMatchObject({ seatIndex: 1, name: 'Wade', characterId: 'the-cowboy' })
  })

  it('survives a fresh match with no chat (empty tableChat)', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: 1 })
    startRound(s)
    const view = getPlayerView(s, 0)
    expect(view.tableChat).toEqual([])
  })
})
