import { describe, it, expect } from 'vitest'
import { describeHandStrength, describePreflopHand, describeVisibleUpcards } from '../handStrength.js'

describe('describeHandStrength', () => {
  it('returns null preflop (fewer than 3 community cards)', () => {
    expect(describeHandStrength(['AH', 'KH'], [])).toBe(null)
    expect(describeHandStrength(['AH', 'KH'], ['2C'])).toBe(null)
    expect(describeHandStrength(['AH', 'KH'], ['2C', '5D'])).toBe(null)
  })

  it('catches trips when the board pairs a hole card (the Kenji bug)', () => {
    const s = describeHandStrength(['KH', '3H'], ['6S', 'KC', '4C', 'KS'])
    expect(s.made.name).toBe('Three of a Kind')
    expect(s.made.descr).toMatch(/K/)
  })

  it('catches a flush', () => {
    const s = describeHandStrength(['AH', '5H'], ['2H', '7H', 'TH'])
    expect(s.made.name).toBe('Flush')
  })

  it('catches a straight', () => {
    const s = describeHandStrength(['9C', '8D'], ['7S', '6H', '5C'])
    expect(s.made.name).toBe('Straight')
  })

  it('reports a 4-card flush draw when one hole card contributes', () => {
    const s = describeHandStrength(['AH', '5C'], ['2H', '7H', 'TH'])
    expect(s.draws).toContain('4-card flush draw (~9 outs to a flush)')
  })

  it('does NOT report a flush draw when 4 same-suit are all on the board (no hole-card contribution)', () => {
    const s = describeHandStrength(['AS', 'KD'], ['2H', '7H', 'TH', 'JH'])
    expect(s.draws).not.toContain('4-card flush draw (~9 outs to a flush)')
  })

  it('reports an open-ended straight draw', () => {
    // Hole: 8c 7d. Board: 6s 5h 2c. Draws to 9 (high end) or 4 (low end) = OESD.
    const s = describeHandStrength(['8C', '7D'], ['6S', '5H', '2C'])
    expect(s.draws).toContain('open-ended straight draw (8 outs)')
  })

  it('reports a gutshot when only an inside card completes the straight', () => {
    // Hole: 9c 7d. Board: 6s 5h 2c. Needs an 8 (interior). Gutshot.
    const s = describeHandStrength(['9C', '7D'], ['6S', '5H', '2C'])
    expect(s.draws).toContain('gutshot straight draw (4 outs)')
    expect(s.draws).not.toContain('open-ended straight draw (8 outs)')
  })

  it('does NOT report a straight draw when the straight is already made', () => {
    const s = describeHandStrength(['9C', '8D'], ['7S', '6H', '5C'])
    expect(s.draws.find((d) => d.includes('straight draw'))).toBeUndefined()
  })

  it('reports wheel-end gutshot (A-2-3-_-5 needing a 4) — one-ended, not OESD', () => {
    // Hole: 2c 3d. Board: As 5h Kc. Needs a 4. Wheel gutshot.
    const s = describeHandStrength(['2C', '3D'], ['AS', '5H', 'KC'])
    expect(s.draws).toContain('gutshot straight draw (4 outs)')
    expect(s.draws).not.toContain('open-ended straight draw (8 outs)')
  })

  it('stacks flush draw + straight draw tags when both are present', () => {
    // Hole: 9h 8h. Board: 7h 6c 2h. OESD (5 or T) + flush draw.
    const s = describeHandStrength(['9H', '8H'], ['7H', '6C', '2H'])
    expect(s.draws).toContain('open-ended straight draw (8 outs)')
    expect(s.draws).toContain('4-card flush draw (~9 outs to a flush)')
  })
})

describe('describeHandStrength card-format normalization', () => {
  it('renders ten cards as "T" not "10" in the made-hand cards list', () => {
    // Hole: Th 9h. Board: 7h 6c Ts. Top pair tens.
    const s = describeHandStrength(['TH', '9H'], ['7H', '6C', 'TS'])
    expect(s.made.name).toBe('Pair')
    expect(s.made.cards).toBeDefined()
    // None of the rendered card strings should look like "10x" — they should use the "T" notation.
    for (const c of s.made.cards) {
      expect(c).not.toMatch(/^10/)
    }
    // And the tens are present using "T".
    expect(s.made.cards.some((c) => /^T[hscd]$/.test(c))).toBe(true)
  })
})

describe('describeVisibleUpcards', () => {
  it('returns null for fewer than 2 upcards', () => {
    expect(describeVisibleUpcards([])).toBe(null)
    expect(describeVisibleUpcards(['7C'])).toBe(null)
  })

  it('detects an exposed pair', () => {
    expect(describeVisibleUpcards(['8D', '8C', '7C', 'QS'])).toMatch(/pair of eights exposed/)
  })

  it('detects exposed trips', () => {
    expect(describeVisibleUpcards(['5D', '5C', '5H', 'QS'])).toMatch(/trip fives exposed/)
  })

  it('reports four-to-a-flush on visible upcards', () => {
    expect(describeVisibleUpcards(['5H', '8H', 'KH', 'TH'])).toMatch(/four to a flush/)
  })

  it('reports four-to-a-straight on visible upcards (open-ended)', () => {
    expect(describeVisibleUpcards(['7C', '8D', '9H', 'TS'])).toMatch(/four to a straight/)
  })

  it('falls back to high-card label when no made hand or draw', () => {
    expect(describeVisibleUpcards(['5C', 'QH'])).toMatch(/Q-high/)
  })
})

describe('describePreflopHand', () => {
  it('marks QS TH as offsuit (the Vera misread)', () => {
    const d = describePreflopHand(['QS', 'TH'])
    expect(d).toMatch(/Q-T offsuit/)
    expect(d).not.toMatch(/suited/)
  })

  it('marks suited cards as suited', () => {
    const d = describePreflopHand(['QS', 'TS'])
    expect(d).toMatch(/Q-T suited/)
  })

  it('marks pocket pairs explicitly', () => {
    expect(describePreflopHand(['5H', '5D'])).toMatch(/5-5.*pocket fives.*small pair/i)
    expect(describePreflopHand(['QH', 'QC'])).toMatch(/Q-Q.*pocket queens.*premium pair/i)
  })

  it('tags AKs/AKo as premium', () => {
    expect(describePreflopHand(['AH', 'KH'])).toMatch(/A-K suited.*premium/)
    expect(describePreflopHand(['AS', 'KD'])).toMatch(/A-K offsuit.*premium/)
  })

  it('tags weak Ax as dominated', () => {
    expect(describePreflopHand(['AS', '2H'])).toMatch(/A-2 offsuit.*weak Ax.*dominated/)
  })

  it('tags suited connectors', () => {
    expect(describePreflopHand(['7H', '6H'])).toMatch(/7-6 suited.*connectors/)
  })

  it('returns null on missing/invalid input', () => {
    expect(describePreflopHand(null)).toBe(null)
    expect(describePreflopHand([])).toBe(null)
    expect(describePreflopHand(['AS'])).toBe(null)
  })
})
