import { describe, it, expect } from 'vitest'
import { createInitialState } from '../state.js'
import { scoreRound } from '../scoring.js'
import { advanceMatch, startNextRound } from '../match.js'
import { makeCard } from '../cards.js'

function seats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Seat ${i}`, isHuman: i === 0 }))
}

// Manually set up a "round just ended" state — winner seat + losers' remaining hands.
function endedRoundState({ winnerSeatIndex, hands, totalRounds = 3, roundNumber = 1, scores }) {
  const seatCount = hands.length
  const s = createInitialState({ seats: seats(seatCount), totalRounds, rngSeed: 1 })
  s.hands = hands
  s.roundComplete = true
  s.roundWinnerSeatIndex = winnerSeatIndex
  s.roundNumber = roundNumber
  if (scores) s.scores = scores
  return s
}

describe('scoreRound', () => {
  it('sums numerics, action cards (20), and Wilds (50) from opponents', () => {
    const s = endedRoundState({
      winnerSeatIndex: 0,
      hands: [
        [],
        [makeCard('red', 5, 'a'), makeCard('blue', 9, 'a')],
        [makeCard('green', 'skip', 'a'), makeCard('yellow', 'draw2', 'a')],
        [makeCard('wild', 'wild_draw4', '1')],
      ],
    })
    const r = scoreRound(s)
    expect(r.winnerSeatIndex).toBe(0)
    // 5 + 9 + 20 + 20 + 50 = 104
    expect(r.points).toBe(104)
    expect(r.perSeatRemainingValues).toEqual([0, 14, 40, 50])
  })

  it('throws if called before roundComplete', () => {
    const s = createInitialState({ seats: seats(2), totalRounds: 3, rngSeed: 1 })
    expect(() => scoreRound(s)).toThrow()
  })
})

describe('advanceMatch — schedule', () => {
  it('accumulates scores across rounds and does not end the match early', () => {
    const s = endedRoundState({
      winnerSeatIndex: 2,
      hands: [
        [makeCard('red', 5, 'a')],
        [makeCard('blue', 9, 'a')],
        [],
        [makeCard('green', 7, 'a')],
      ],
      totalRounds: 3,
      roundNumber: 1,
    })
    const events = advanceMatch(s)
    expect(events).toEqual([])
    expect(s.scores[2]).toBe(5 + 9 + 7)
    expect(s.matchComplete).toBe(false)
  })

  it('marks match complete after the final round (no tie)', () => {
    const s = endedRoundState({
      winnerSeatIndex: 0,
      hands: [[], [makeCard('red', 5, 'a')], [makeCard('blue', 9, 'a')], [makeCard('green', 7, 'a')]],
      totalRounds: 3,
      roundNumber: 3,
      scores: [100, 50, 30, 10],
    })
    const events = advanceMatch(s)
    expect(s.matchComplete).toBe(true)
    expect(s.matchWinnerSeatIndex).toBe(0) // 100 + 21 = 121, highest
    expect(events[0].type).toBe('uno:match_won')
  })

  it('tied final → schedules sudden death between tied seats', () => {
    // Round 3 of 3: winner is seat 0 with 30 points, but their cumulative score now ties seat 2.
    const s = endedRoundState({
      winnerSeatIndex: 0,
      hands: [
        [],
        [makeCard('red', 5, 'a'), makeCard('blue', 9, 'a'), makeCard('green', 'skip', 'a')], // 5+9+20 = 34 - hmm doesn't matter; need exact tie
        [],
        [],
      ],
      totalRounds: 3,
      roundNumber: 3,
      scores: [66, 0, 100, 0], // after this round, seat 0 += 34 = 100 ties with seat 2 at 100
    })
    const events = advanceMatch(s)
    expect(s.matchComplete).toBe(false)
    expect(s.tieBreakSeatIndices).toEqual([0, 2])
    expect(events).toEqual([])
  })

  it('sudden-death round resolves the match', () => {
    // Set up a sudden-death state: tied seats [0, 2]; seat 0 empties hand.
    const s = endedRoundState({
      winnerSeatIndex: 0,
      hands: [[], [], [makeCard('red', 5, 'a')], []],
      totalRounds: 3,
      roundNumber: 3,
      scores: [100, 0, 100, 0],
    })
    s.tieBreakSeatIndices = [0, 2]
    const events = advanceMatch(s)
    expect(s.matchComplete).toBe(true)
    expect(s.matchWinnerSeatIndex).toBe(0)
    expect(events[0].type).toBe('uno:match_won')
  })
})

describe('startNextRound', () => {
  it('deals a fresh round and rotates first-to-act', () => {
    const s = endedRoundState({
      winnerSeatIndex: 0,
      hands: [[], [makeCard('red', 5, 'a')], [], []],
      totalRounds: 3,
      roundNumber: 1,
    })
    s.firstToActForRound = 2
    advanceMatch(s)
    // roundNumber stayed at 1 (startRound increments before dealing)
    startNextRound(s)
    expect(s.roundNumber).toBe(2)
    expect(s.firstToActForRound).toBe(3) // rotated clockwise from 2
    for (let i = 0; i < 4; i++) expect(s.hands[i]).toHaveLength(7)
  })

  it('subset-deal for sudden-death only deals to tied seats', () => {
    const s = endedRoundState({
      winnerSeatIndex: 0,
      hands: [[], [makeCard('red', 5, 'a')], [], []],
      totalRounds: 3,
      roundNumber: 3,
    })
    s.tieBreakSeatIndices = [0, 2]
    startNextRound(s)
    expect(s.hands[0]).toHaveLength(7)
    expect(s.hands[1]).toHaveLength(0)
    expect(s.hands[2]).toHaveLength(7)
    expect(s.hands[3]).toHaveLength(0)
  })
})
