import { describe, it, expect } from 'vitest'
import { createInitialState, startRound, activeColor, topCard, nextSeat } from '../state.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0 }))
}

// Build state, then force the next non-Wild-Draw-4 card on top by manipulating the rng draw
// by seed sweep. Easier: just sweep seeds until the first discard has the value we want.
function buildWithFirstDiscard(predicate, n = 4) {
  for (let seed = 1; seed < 5000; seed++) {
    const s = createInitialState({ seats: seats(n), totalRounds: 7, rngSeed: seed })
    startRound(s)
    if (predicate(topCard(s).value, topCard(s))) return s
  }
  throw new Error('No seed satisfied the predicate within 5000 tries')
}

describe('uno state', () => {
  it('createInitialState contains all required fields', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: 1 })
    expect(s.seats).toHaveLength(4)
    expect(s.hands).toHaveLength(4)
    for (const h of s.hands) expect(h).toEqual([])
    expect(s.drawPile).toEqual([])
    expect(s.discardPile).toEqual([])
    expect(s.direction).toBe(1)
    expect(s.pendingDraw).toBe(0)
    expect(s.pendingSkip).toBe(false)
    expect(s.pendingWildColor).toBeNull()
    expect(s.roundComplete).toBe(false)
    expect(s.roundWinnerSeatIndex).toBeNull()
    expect(s.scores).toEqual([0, 0, 0, 0])
    expect(s.roundNumber).toBe(0)
    expect(s.totalRounds).toBe(7)
    expect(s.matchComplete).toBe(false)
  })

  it('startRound deals 7 cards to each seat and turns up a starting discard', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: 1 })
    startRound(s)
    for (const h of s.hands) expect(h).toHaveLength(7)
    expect(s.discardPile).toHaveLength(1)
    expect(s.drawPile.length).toBe(108 - 4 * 7 - 1)
    expect(s.roundNumber).toBe(1)
  })

  it('first discard is never a Wild Draw 4', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: seed })
      startRound(s)
      expect(topCard(s).value).not.toBe('wild_draw4')
    }
  })

  it('round 2 first-to-act rotates clockwise by one seat', () => {
    const s = createInitialState({ seats: seats(4), totalRounds: 7, rngSeed: 1 })
    startRound(s)
    const r1FirstToAct = s.firstToActForRound
    // simulate "round 1 ended": reset roundComplete + start the next round
    s.roundComplete = false
    startRound(s)
    expect(s.firstToActForRound).toBe((r1FirstToAct + 1) % 4)
  })

  it('starting card Skip skips the first-to-act seat', () => {
    const s = buildWithFirstDiscard((v) => v === 'skip', 4)
    // The first-to-act was advanced by one in the starting direction (clockwise = +1).
    expect(s.currentSeatIndex).toBe(nextSeat(s.firstToActForRound, 1, 4))
  })

  it('starting card Reverse in 2-player makes the other seat (dealer) play first', () => {
    const s = buildWithFirstDiscard((v) => v === 'reverse', 2)
    // 2-player Reverse acts as a Skip — the first-to-act is the OTHER seat.
    expect(s.currentSeatIndex).toBe(nextSeat(s.firstToActForRound, 1, 2))
    // Direction is unchanged.
    expect(s.direction).toBe(1)
  })

  it('starting card Reverse in 4-player flips direction', () => {
    const s = buildWithFirstDiscard((v) => v === 'reverse', 4)
    expect(s.direction).toBe(-1)
  })

  it('starting card Draw 2 makes the first player draw 2 and be skipped', () => {
    const s = buildWithFirstDiscard((v) => v === 'draw2', 4)
    expect(s.hands[s.firstToActForRound]).toHaveLength(9) // dealt 7 + drew 2
    expect(s.currentSeatIndex).toBe(nextSeat(s.firstToActForRound, 1, 4))
  })

  it('starting card Wild leaves chosenColor null until the first player chooses', () => {
    const s = buildWithFirstDiscard((v) => v === 'wild', 4)
    expect(activeColor(s)).toBeNull()
    // currentSeatIndex stays at first-to-act — they must choose before acting.
    expect(s.currentSeatIndex).toBe(s.firstToActForRound)
  })
})
