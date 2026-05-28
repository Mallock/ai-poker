import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUnoGameStore } from '../unoGame.js'
import { useUiStore } from '../ui.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0 }))
}

// Spin the loop until it pauses on the human's turn (or the round resolves). Returns true if
// we landed on a human turn.
async function waitForHumanTurn(store) {
  for (let i = 0; i < 30 && !store.pendingHumanTurn && !store.scorecardPending && !store.matchComplete; i++) {
    await new Promise((r) => setTimeout(r, 5))
  }
  return store.pendingHumanTurn
}

// Build a legal human action from the current legal-actions, optionally carrying a say.
function humanAction(store, say) {
  const la = store.humanLegalActions
  let action
  if (la.mustChooseStartingColor) action = { action: 'chooseStartingColor', color: 'red' }
  else if (la.canAccept) action = { action: 'accept' }
  else if (la.plays.length > 0) {
    const p = la.plays[0]
    action = { action: 'play', cardIndex: p.cardIndex }
    if (p.requiresWildColor) action.wildColor = 'blue'
    if (store.humanView.self.handSize - 1 === 1) action.callUno = true
  } else if (la.canDraw) action = { action: 'draw' }
  else action = { action: 'pass' }
  if (say !== undefined) action.say = say
  return action
}

function freshHumanStore() {
  const store = useUnoGameStore()
  store.aiThinkPauseMs = 0
  store.aiDecisionRevealMs = 0
  store.aiDecisionRevealWithSayMs = 0
  store.startMatch({ seats: seats(2), totalRounds: 3, rngSeed: 1, driverFactory: fastDriverFactory() })
  return store
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

  it('records a human submission\'s say into chatLog and shows a bubble over the human seat', async () => {
    const store = freshHumanStore()
    if (!(await waitForHumanTurn(store))) return // round resolved without a human turn
    const humanIdx = store.humanSeatIndex
    const humanSeatId = store.matchState.seats[humanIdx].id

    store.submitHumanAction(humanAction(store, 'reading you all'))

    const entry = store.matchState.chatLog.find((c) => c.text === 'reading you all')
    expect(entry).toBeTruthy()
    expect(entry.seatIndex).toBe(humanIdx)
    expect(entry.characterId).toBe(null)
    // Bubble keyed by the human seat id (no characterId).
    expect(useUiStore().activeBubbles[humanSeatId]?.text).toBe('reading you all')
  })

  it('shows no bubble and records no chat when the human submits an empty message', async () => {
    const store = freshHumanStore()
    if (!(await waitForHumanTurn(store))) return
    const humanIdx = store.humanSeatIndex
    const humanSeatId = store.matchState.seats[humanIdx].id
    const chatBefore = store.matchState.chatLog.length

    store.submitHumanAction(humanAction(store, '   '))

    expect(store.matchState.chatLog.length).toBe(chatBefore)
    expect(useUiStore().activeBubbles[humanSeatId]).toBeUndefined()
  })
})
