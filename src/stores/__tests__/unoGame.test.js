import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUnoGameStore } from '../unoGame.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0 }))
}

// Synchronous "AI driver" that picks the first legal play (or draws). Returns a factory.
function fastDriverFactory() {
  return (/* seatId */) => async (view) => {
    const la = view.legalActions
    if (la.mustChooseStartingColor) return { action: 'chooseStartingColor', color: 'red' }
    if (la.canAccept) return { action: 'accept' }
    if (la.plays.length > 0) {
      const p = la.plays[0]
      const out = { action: 'play', cardIndex: p.cardIndex }
      if (p.requiresWildColor) out.wildColor = 'blue'
      if (view.self.handSize - 1 === 1) out.callUno = true
      return out
    }
    if (la.canDraw) return { action: 'draw' }
    return { action: 'pass' }
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('useUnoGameStore', () => {
  it('startMatch populates state and deals 7 cards each', async () => {
    const store = useUnoGameStore()
    store.aiThinkPauseMs = 0
    store.aiDecisionRevealMs = 0
    store.aiDecisionRevealWithSayMs = 0
    store.startMatch({
      seats: seats(4),
      totalRounds: 3,
      rngSeed: 1,
      driverFactory: fastDriverFactory(),
    })
    expect(store.matchState).toBeTruthy()
    for (const h of store.matchState.hands) expect(h).toHaveLength(7)
    expect(store.matchState.totalRounds).toBe(3)
  })

  it('drives AI seats until it lands on the human or finishes the round', async () => {
    const store = useUnoGameStore()
    store.aiThinkPauseMs = 0
    store.aiDecisionRevealMs = 0
    store.aiDecisionRevealWithSayMs = 0
    store.startMatch({
      seats: seats(4),
      totalRounds: 3,
      rngSeed: 1,
      driverFactory: fastDriverFactory(),
    })
    // Yield a few microtasks so the loop runs.
    await new Promise((r) => setTimeout(r, 50))
    // Either we landed on the human's turn, the scorecard is pending, or the match is complete.
    const humanIdx = store.humanSeatIndex
    const onHuman = store.matchState.currentSeatIndex === humanIdx
    expect(onHuman || store.scorecardPending || store.matchComplete).toBe(true)
  })
})
