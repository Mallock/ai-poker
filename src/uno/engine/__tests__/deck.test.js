import { describe, it, expect } from 'vitest'
import { buildDeck, freshShuffledDeck, deal, shuffle } from '../deck.js'
import { cardValue, COLORS } from '../cards.js'
import { createRng } from '../rng.js'

describe('uno deck', () => {
  it('builds a 108-card deck', () => {
    expect(buildDeck()).toHaveLength(108)
  })

  it('has one 0, two of each 1–9, two each of skip/reverse/draw2 per color', () => {
    const d = buildDeck()
    for (const color of COLORS) {
      const sub = d.filter((c) => c.color === color)
      expect(sub).toHaveLength(25) // 1 + 18 + 2*3 = 25
      expect(sub.filter((c) => c.value === 0)).toHaveLength(1)
      for (let n = 1; n <= 9; n++) {
        expect(sub.filter((c) => c.value === n)).toHaveLength(2)
      }
      expect(sub.filter((c) => c.value === 'skip')).toHaveLength(2)
      expect(sub.filter((c) => c.value === 'reverse')).toHaveLength(2)
      expect(sub.filter((c) => c.value === 'draw2')).toHaveLength(2)
    }
  })

  it('has 4 Wild and 4 Wild Draw 4', () => {
    const d = buildDeck()
    expect(d.filter((c) => c.value === 'wild')).toHaveLength(4)
    expect(d.filter((c) => c.value === 'wild_draw4')).toHaveLength(4)
  })

  it('gives every card a unique stable id', () => {
    const d = buildDeck()
    const ids = d.map((c) => c.id)
    expect(new Set(ids).size).toBe(d.length)
  })

  it('shuffle is deterministic for a fixed seed', () => {
    const a = freshShuffledDeck(createRng(42))
    const b = freshShuffledDeck(createRng(42))
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
  })

  it('shuffle differs across seeds', () => {
    const a = freshShuffledDeck(createRng(1)).map((c) => c.id).join(',')
    const b = freshShuffledDeck(createRng(2)).map((c) => c.id).join(',')
    expect(a).not.toEqual(b)
  })

  it('deals 7 cards to each seat', () => {
    const deck = freshShuffledDeck(createRng(7))
    const { hands, remainingDeck } = deal(deck, 4, 7)
    expect(hands).toHaveLength(4)
    for (const h of hands) expect(h).toHaveLength(7)
    expect(remainingDeck).toHaveLength(108 - 4 * 7)
  })

  it('cardValue scores numerics by face, action cards 20, wilds 50', () => {
    expect(cardValue({ color: 'red', value: 5 })).toBe(5)
    expect(cardValue({ color: 'red', value: 0 })).toBe(0)
    expect(cardValue({ color: 'red', value: 'skip' })).toBe(20)
    expect(cardValue({ color: 'red', value: 'reverse' })).toBe(20)
    expect(cardValue({ color: 'red', value: 'draw2' })).toBe(20)
    expect(cardValue({ color: 'wild', value: 'wild' })).toBe(50)
    expect(cardValue({ color: 'wild', value: 'wild_draw4' })).toBe(50)
  })

  it('shuffle is in-place', () => {
    const d = buildDeck()
    const ref = d
    shuffle(d, createRng(3))
    expect(d).toBe(ref)
    expect(d).toHaveLength(108)
  })
})
