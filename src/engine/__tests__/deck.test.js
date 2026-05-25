import { describe, it, expect } from 'vitest'
import { buildFullDeck } from '../cards.js'
import { freshShuffledDeck, draw } from '../deck.js'
import { createRng } from '../rng.js'

describe('deck', () => {
  it('builds a 52-card deck with no duplicates', () => {
    const d = buildFullDeck()
    expect(d).toHaveLength(52)
    expect(new Set(d).size).toBe(52)
  })

  it('shuffles deterministically from a fixed seed', () => {
    const a = freshShuffledDeck(createRng(42))
    const b = freshShuffledDeck(createRng(42))
    expect(a).toEqual(b)
  })

  it('produces different orders for different seeds', () => {
    const a = freshShuffledDeck(createRng(1))
    const b = freshShuffledDeck(createRng(2))
    expect(a).not.toEqual(b)
  })

  it('draws cards from the top and shrinks the deck', () => {
    const deck = freshShuffledDeck(createRng(7))
    const top = draw(deck, 3)
    expect(top).toHaveLength(3)
    expect(deck).toHaveLength(49)
  })
})
