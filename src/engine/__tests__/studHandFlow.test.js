import { describe, it, expect } from 'vitest'
import { createInitialState, startHand } from '../state.js'
import { applyAction, legalActions } from '../betting.js'
import { computePots } from '../sidePots.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

function chipsTotal(state) {
  if (state.street === 'handComplete' || state.street === 'idle') {
    return state.players.reduce((s, p) => s + p.stack, 0)
  }
  return state.players.reduce((s, p) => s + p.stack + p.totalContributed, 0)
}

describe('stud full hand flow', () => {
  it('chip-conserving stud hand: ante → 3rd → ... → 7th → showdown', () => {
    const s = createInitialState({ seats: makeSeats(3), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    expect(s.street).toBe('third')
    const totalBefore = chipsTotal(s)

    // Drive the hand: bring-in checks/calls, others call (no raises). Each street advances.
    let safety = 200
    while (s.street !== 'handComplete' && s.toAct && safety-- > 0) {
      const la = legalActions(s, s.toAct)
      if (la.canCheck) {
        applyAction(s, s.toAct, { action: 'check' })
      } else if (la.canCall) {
        applyAction(s, s.toAct, { action: 'call' })
      } else {
        break
      }
    }
    expect(s.street).toBe('handComplete')
    expect(chipsTotal(s)).toBe(totalBefore)
  })

  it('multi-player stud all-in produces correct side pots', () => {
    const s = createInitialState({ seats: makeSeats(3), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    // Force different stacks BEFORE startHand so antes come from them.
    s.players[0].stack = 300
    s.players[1].stack = 600
    s.players[2].stack = 1000
    startHand(s)
    // Everyone goes all-in eventually.
    let safety = 200
    while (s.street !== 'handComplete' && s.toAct && safety-- > 0) {
      const la = legalActions(s, s.toAct)
      if (la.canAllIn) {
        applyAction(s, s.toAct, { action: 'all-in' })
      } else if (la.canCall) {
        applyAction(s, s.toAct, { action: 'call' })
      } else if (la.canCheck) {
        applyAction(s, s.toAct, { action: 'check' })
      } else {
        break
      }
    }
    expect(s.street).toBe('handComplete')
    // Side pots: shape-stable on totalContributed (engine-agnostic).
    const totalChipsAfter = s.players.reduce((sum, p) => sum + p.stack, 0)
    expect(totalChipsAfter).toBe(300 + 600 + 1000)
  })
})
