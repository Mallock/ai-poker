import { describe, it, expect } from 'vitest'
import { createInitialState, startRound } from '../state.js'
import { applyAction, legalActions } from '../rules.js'
import { getPlayerView } from '../view.js'
import { advanceMatch, startNextRound } from '../match.js'
import { pickDegradedAction } from '../../ai/unoDriver.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0 }))
}

// Step the engine with the degraded driver until one of: round ends, match ends, or we
// exceed the safety cap. Returns the number of steps taken.
function autoplayRound(state, maxSteps = 800) {
  let steps = 0
  while (!state.roundComplete && !state.matchComplete && steps < maxSteps) {
    const idx = state.currentSeatIndex
    const view = getPlayerView(state, idx)
    const action = pickDegradedAction(view)
    applyAction(state, idx, action)
    steps++
  }
  return steps
}

describe('full Uno round flow', () => {
  it('plays a 4-player round to completion with the degraded driver', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 3, rngSeed: 1 })
    startRound(s)
    autoplayRound(s)
    expect(s.roundComplete).toBe(true)
    expect(s.roundWinnerSeatIndex).not.toBeNull()
    // The winning seat has 0 cards.
    expect(s.hands[s.roundWinnerSeatIndex]).toHaveLength(0)
    // Round scores roll into cumulative scores via advanceMatch.
    advanceMatch(s)
    const total = s.scores.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('plays a 4-player round across many seeds without crashing', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = createInitialState({ seats: seats(4), totalRounds: 3, rngSeed: seed })
      startRound(s)
      const steps = autoplayRound(s)
      expect(s.roundComplete).toBe(true)
      expect(steps).toBeLessThan(800)
    }
  })
})

describe('full match flow', () => {
  it('best-of-3 match accumulates scores and ends with a winner', () => {
    const s = createInitialState({ seats: seats(3), totalRounds: 3, rngSeed: 1 })
    startRound(s)
    let safety = 0
    while (!s.matchComplete && safety < 20) {
      autoplayRound(s)
      advanceMatch(s)
      if (!s.matchComplete) startNextRound(s)
      safety++
    }
    expect(s.matchComplete).toBe(true)
    expect(s.matchWinnerSeatIndex).not.toBeNull()
    // Winner has the highest cumulative score.
    const max = Math.max(...s.scores)
    expect(s.scores[s.matchWinnerSeatIndex]).toBe(max)
  })

  it('best-of-3 round count stops at totalRounds', () => {
    const s = createInitialState({ seats: seats(3), totalRounds: 3, rngSeed: 2 })
    startRound(s)
    let safety = 0
    while (!s.matchComplete && safety < 20) {
      autoplayRound(s)
      advanceMatch(s)
      if (!s.matchComplete) startNextRound(s)
      safety++
    }
    // Either we played exactly 3 rounds (no ties) or a 4th sudden-death round happened
    // because of a tie.
    expect([3, 4]).toContain(s.roundNumber)
  })
})

describe('tied-match sudden death', () => {
  // Force a tie by hand-constructing the state, then run sudden death.
  it('resolves a tie via a sudden-death round', () => {
    const s = createInitialState({ seats: seats(3), totalRounds: 3, rngSeed: 99 })
    s.roundNumber = 3
    s.scores = [120, 120, 50]
    // Pretend round 3 just ended in a way that ties seats 0 and 1.
    s.roundComplete = true
    s.roundWinnerSeatIndex = 0
    s.hands = [[], [], []]
    // No remaining values for opponents → no point shift, scores stay tied.
    const events = advanceMatch(s)
    // Match shouldn't be complete; sudden-death scheduling should be in place.
    expect(s.matchComplete).toBe(false)
    expect(s.tieBreakSeatIndices).toEqual([0, 1])
    expect(events).toEqual([])
    // Start sudden death and play it out.
    startNextRound(s)
    autoplayRound(s)
    advanceMatch(s)
    expect(s.matchComplete).toBe(true)
    expect([0, 1]).toContain(s.matchWinnerSeatIndex)
  })
})
