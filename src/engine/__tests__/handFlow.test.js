import { describe, it, expect } from 'vitest'
import { createInitialState, startHand } from '../state.js'
import { applyAction } from '../betting.js'
import { computePots } from '../sidePots.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

// Chip conservation: at any moment, the chips in play equal sum of (stacks not yet bet) +
// (chips currently in the pot). The pot equals sum of totalContributed BEFORE payout, and 0
// AFTER payout (because awarded chips moved back to winner's stack). To compute total in a way
// that works both mid-hand and post-hand, treat `totalContributed` only while the hand is live.
function chipsTotal(state) {
  if (state.street === 'handComplete' || state.street === 'tournamentComplete' || state.street === 'idle') {
    return state.players.reduce((s, p) => s + p.stack, 0)
  }
  return state.players.reduce((s, p) => s + p.stack + p.totalContributed, 0)
}

describe('full hand integration', () => {
  it('2-handed: heads-up, everyone limps, plays to showdown — chips conserved', () => {
    const s = createInitialState({ seats: makeSeats(2), startingStack: 1000, rngSeed: 1 })
    startHand(s)
    const totalBefore = chipsTotal(s)

    // Preflop heads-up: button/SB (p0) acts first.
    applyAction(s, 'p0', { action: 'call' })   // p0 calls 50 to match 100 BB
    applyAction(s, 'p1', { action: 'check' })  // p1 (BB) checks option
    expect(s.street).toBe('flop')

    // Flop: BB acts first heads-up (player left of button).
    // dealerIndex=0 → first to act on postflop = p1
    expect(s.toAct).toBe('p1')
    applyAction(s, 'p1', { action: 'check' })
    applyAction(s, 'p0', { action: 'check' })
    expect(s.street).toBe('turn')

    applyAction(s, 'p1', { action: 'check' })
    applyAction(s, 'p0', { action: 'check' })
    expect(s.street).toBe('river')

    applyAction(s, 'p1', { action: 'check' })
    applyAction(s, 'p0', { action: 'check' })

    expect(s.street).toBe('handComplete')
    expect(chipsTotal(s)).toBe(totalBefore)
  })

  it('6-handed: action folds around to BB pre-flop', () => {
    const s = createInitialState({ seats: makeSeats(6), startingStack: 1000, rngSeed: 1 })
    startHand(s)
    // UTG (seat after BB) = p3. Action order: p3, p4, p5, p0 (button), p1 (SB).
    applyAction(s, 'p3', { action: 'fold' })
    applyAction(s, 'p4', { action: 'fold' })
    applyAction(s, 'p5', { action: 'fold' })
    applyAction(s, 'p0', { action: 'fold' })
    applyAction(s, 'p1', { action: 'fold' })
    // BB (p2) wins uncontested.
    expect(s.street).toBe('handComplete')
    expect(s.players[2].stack).toBe(1050) // start 1000 - 100 BB + 150 pot
  })

  it('3-way all-in produces correct side pots', () => {
    // Set up: 3 players with different stacks.
    const seats = [
      { id: 'p0', name: 'P0', isHuman: true },
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
    ]
    const s = createInitialState({ seats, startingStack: 1000, rngSeed: 1 })
    // Force different stacks: p0=300, p1=600, p2=1000
    s.players[0].stack = 300
    s.players[1].stack = 600
    s.players[2].stack = 1000
    startHand(s)
    // After blinds posted: p1 SB 50 (stack 550), p2 BB 100 (stack 900), p0 button (stack 300)
    // toAct = p0 (button = UTG in 3-handed, first to act preflop is left of BB → wraps to button)
    expect(s.toAct).toBe('p0')

    // p0 goes all-in for 300 (raise to 300)
    applyAction(s, 'p0', { action: 'all-in' })
    expect(s.players[0].stack).toBe(0)
    expect(s.players[0].allIn).toBe(true)

    // p1 calls all-in (SB already in 50, needs 550 more = call 300 total then re-raise? — actually
    // facing 300 currentBet, p1 has 550 left, calls 250 more to match)
    // Wait, p1 needs to match currentBet 300, currentBet for p1 is 50, so needs 250 more.
    // p1 has 550 stack, can call 250, leaving 300.
    // But we want a 3-way all-in for the test — have p1 also go all-in.
    applyAction(s, 'p1', { action: 'all-in' })
    expect(s.players[1].stack).toBe(0)
    // p1 went all-in for 50+550=600 total.
    expect(s.players[1].totalContributed).toBe(600)

    // p2 calls all-in (needs to put in more to match 600; has 900 left, needs 500 more)
    applyAction(s, 'p2', { action: 'all-in' })
    expect(s.players[2].totalContributed).toBe(1000) // BB 100 + 900 stack all-in

    // Hand should cascade to showdown since at least 2 contenders.
    expect(s.street).toBe('handComplete')

    // Verify side pots computed at showdown:
    // (Pots were computed during showdown; we can recompute for assertion.)
    const pots = computePots(s)
    // Level 300 (p0 all-in): 300×3 = 900, eligible all three
    // Level 600 (p1 all-in): 300×2 = 600, eligible p1+p2
    // Level 1000 (p2 all-in alone): 400×1 = 400, eligible p2
    expect(pots).toHaveLength(3)
    expect(pots[0]).toMatchObject({ amount: 900 })
    expect(pots[0].eligible.sort()).toEqual(['p0', 'p1', 'p2'])
    expect(pots[1]).toMatchObject({ amount: 600 })
    expect(pots[1].eligible.sort()).toEqual(['p1', 'p2'])
    expect(pots[2]).toMatchObject({ amount: 400 })
    expect(pots[2].eligible).toEqual(['p2'])

    // Chips conserved across the hand.
    const chipsAfter = s.players.reduce((sum, p) => sum + p.stack, 0)
    expect(chipsAfter).toBe(300 + 600 + 1000)
  })

  it('elimination: player with 0 stack at hand start is marked eliminated and skipped', () => {
    const s = createInitialState({ seats: makeSeats(3), startingStack: 1000, rngSeed: 1 })
    // Simulate a prior hand that left p1 broke.
    s.players[1].stack = 0
    startHand(s)
    expect(s.players[1].eliminated).toBe(true)
    // Only p0 and p2 are active — should be heads-up.
    expect(s.players[0].cards).toHaveLength(2)
    expect(s.players[2].cards).toHaveLength(2)
    expect(s.players[1].cards).toHaveLength(0)
  })

  it('tournamentComplete when only one non-eliminated player remains', () => {
    const s = createInitialState({ seats: makeSeats(3), startingStack: 1000, rngSeed: 1 })
    s.players[0].stack = 0
    s.players[2].stack = 0
    startHand(s)
    expect(s.street).toBe('tournamentComplete')
  })
})
