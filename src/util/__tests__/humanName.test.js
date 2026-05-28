import { describe, it, expect } from 'vitest'
import { resolveHumanName, randomHumanName } from '../humanName.js'

describe('resolveHumanName', () => {
  it('uses the typed name verbatim (trimmed) when provided', () => {
    expect(resolveHumanName('Mika', ['Wade', 'Vera'])).toBe('Mika')
    expect(resolveHumanName('  Mika  ', [])).toBe('Mika')
  })

  it('falls back to a non-empty random name when blank', () => {
    const aiNames = ['Wade', 'Vera', 'Walter']
    for (let i = 0; i < 50; i++) {
      const name = resolveHumanName('   ', aiNames)
      expect(name).toBeTruthy()
      expect(aiNames).not.toContain(name)
    }
  })

  it('treats whitespace-only input as blank', () => {
    expect(resolveHumanName('\t\n ', [])).not.toBe('')
  })
})

describe('randomHumanName', () => {
  it('never returns an excluded name (case-insensitive)', () => {
    const exclude = ['alex', 'SAM', 'Jordan']
    for (let i = 0; i < 50; i++) {
      const name = randomHumanName(exclude)
      expect(name.toLowerCase()).not.toBe('alex')
      expect(name.toLowerCase()).not.toBe('sam')
      expect(name.toLowerCase()).not.toBe('jordan')
    }
  })
})
