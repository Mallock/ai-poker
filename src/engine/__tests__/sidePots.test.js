import { describe, it, expect } from 'vitest'
import { computePots } from '../sidePots.js'

function st(players) {
  return { players: players.map((p, i) => ({ id: `p${i}`, totalContributed: 0, folded: false, ...p })) }
}

describe('computePots', () => {
  it('returns a single pot with all chips when nobody all-in', () => {
    const s = st([
      { totalContributed: 200 },
      { totalContributed: 200 },
      { totalContributed: 200 },
    ])
    const pots = computePots(s)
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(600)
    expect(pots[0].eligible).toEqual(['p0', 'p1', 'p2'])
  })

  it('two distinct all-in amounts produce one main + one side pot', () => {
    // p0 all-in 500, p1 all-in 1500, p2 calls 1500.
    const s = st([
      { totalContributed: 500 },
      { totalContributed: 1500 },
      { totalContributed: 1500 },
    ])
    const pots = computePots(s)
    expect(pots).toHaveLength(2)
    // Main pot: 500 × 3 = 1500, eligible to all three
    expect(pots[0].amount).toBe(1500)
    expect(pots[0].eligible.sort()).toEqual(['p0', 'p1', 'p2'])
    // Side pot: 1000 × 2 = 2000, eligible to p1 and p2
    expect(pots[1].amount).toBe(2000)
    expect(pots[1].eligible.sort()).toEqual(['p1', 'p2'])
  })

  it('folded players contribute to pots but are not eligible', () => {
    // p0 folded 100, p1 contributed 500, p2 contributed 500.
    const s = st([
      { totalContributed: 100, folded: true },
      { totalContributed: 500 },
      { totalContributed: 500 },
    ])
    const pots = computePots(s)
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(1100)
    expect(pots[0].eligible.sort()).toEqual(['p1', 'p2'])
  })

  it('three-way all-in at different amounts produces three pots', () => {
    const s = st([
      { totalContributed: 100 },  // p0 all-in for 100
      { totalContributed: 300 },  // p1 all-in for 300
      { totalContributed: 700 },  // p2 all-in for 700
      { totalContributed: 700 },  // p3 calls 700
    ])
    const pots = computePots(s)
    expect(pots).toHaveLength(3)
    // Main pot at level 100: 100×4 = 400, all eligible
    expect(pots[0]).toEqual({ amount: 400, eligible: ['p0', 'p1', 'p2', 'p3'] })
    // Side pot at level 300: 200×3 = 600, p1/p2/p3 eligible
    expect(pots[1]).toEqual({ amount: 600, eligible: ['p1', 'p2', 'p3'] })
    // Side pot at level 700: 400×2 = 800, p2/p3 eligible
    expect(pots[2]).toEqual({ amount: 800, eligible: ['p2', 'p3'] })
  })

  it('handles overflow from a folded player above the max non-folded amount', () => {
    // p0 folded after putting in 1000 (e.g. raised then folded to a re-raise).
    // p1 all-in for 500. p2 calls 500.
    // Main = 500*3 = 1500 eligible p1/p2; remaining 500 from p0 goes... well, it's odd.
    // Real poker: the extra 500 from p0 is returned to the next live aggressor (no one). Here we
    // simplify by adding it to the top pot.
    const s = st([
      { totalContributed: 1000, folded: true },
      { totalContributed: 500 },
      { totalContributed: 500 },
    ])
    const pots = computePots(s)
    expect(pots).toHaveLength(1)
    expect(pots[0].amount).toBe(2000)
  })
})
