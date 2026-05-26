import { describe, it, expect } from 'vitest'
import { createInitialState, startHand } from '../state.js'
import { applyAction, legalActions } from '../betting.js'
import { advanceStreetIfReady } from '../streets.js'

function makeSeats(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0 }))
}

function pasMyTurn(state) {
  // Bring-in player checks (accepting the forced post); everyone else calls.
  while (state.street === 'third' && state.toAct) {
    const la = legalActions(state, state.toAct)
    if (la.canCall) applyAction(state, state.toAct, { action: 'call' })
    else if (la.canCheck) applyAction(state, state.toAct, { action: 'check' })
    else break
  }
}

describe('stud street machine', () => {
  it('advances third → fourth, dealing one public card per live player', () => {
    const s = createInitialState({ seats: makeSeats(4), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    expect(s.street).toBe('third')
    const beforeDeckCount = s.deck.length
    pasMyTurn(s)
    expect(s.street).toBe('fourth')
    // Every live player has 4 cards now: 2 private + 2 public.
    for (const p of s.players.filter((p) => !p.folded && !p.eliminated)) {
      expect(p.cards).toHaveLength(4)
      expect(p.cards[3].visibility).toBe('public')
    }
    // 4 cards dealt → deck shrinks by 4.
    expect(s.deck.length).toBe(beforeDeckCount - 4)
  })

  it('cascades to seventh and showdown when fewer than 2 can bet', () => {
    const s = createInitialState({ seats: makeSeats(2), gameType: 'stud', startingStack: 1000, rngSeed: 4 })
    startHand(s)
    // Heads-up: make both players all-in on 3rd by setting tiny stacks.
    s.players[0].stack = 30
    s.players[1].stack = 30
    // Now keep playing: whichever player is to act calls or all-ins.
    while (s.street !== 'handComplete' && s.street !== 'tournamentComplete' && s.toAct) {
      const la = legalActions(s, s.toAct)
      if (la.canAllIn && la.canCall && la.callAmount > s.players.find((p) => p.id === s.toAct).stack) {
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
  })

  it('unlocks big bet on 4th when a player shows a pair on first two upcards', () => {
    const s = createInitialState({ seats: makeSeats(3), gameType: 'stud', startingStack: 1000, rngSeed: 1 })
    startHand(s)
    // Force a paired upcard pair on player 0 by hand-shaping the cards array post-deal,
    // then drive the street machine.
    // Set p0 upcard to match a card we'll inject on 4th street.
    s.players[0].cards[2] = { card: '7H', visibility: 'public' }
    // Pre-seed the deck so the next 3 cards dealt are (one to each player) — make p0 receive 7C.
    // Order: deal goes by liveIdxs in seat order — seat 0 first.
    s.deck.unshift('AS')  // placeholder; will be popped first
    // Actually draw pops from the FRONT. Let's just put the cards we want at the front.
    s.deck = ['7C', '5D', '8H', ...s.deck.slice(3)]
    // Have every live player check around 3rd street.
    while (s.street === 'third' && s.toAct) {
      const la = legalActions(s, s.toAct)
      if (la.canCall) applyAction(s, s.toAct, { action: 'call' })
      else if (la.canCheck) applyAction(s, s.toAct, { action: 'check' })
      else break
    }
    expect(s.street).toBe('fourth')
    // p0 should now have 7H + 7C upcards → big bet unlocked.
    expect(s.bigBetUnlocked).toBe(true)
  })

  it('unconditionally unlocks big bet on 5th street if not already', () => {
    const s = createInitialState({ seats: makeSeats(3), gameType: 'stud', startingStack: 1000, rngSeed: 2 })
    startHand(s)
    // Drive through 3rd and 4th street.
    while (s.street === 'third' && s.toAct) {
      const la = legalActions(s, s.toAct)
      if (la.canCall) applyAction(s, s.toAct, { action: 'call' })
      else if (la.canCheck) applyAction(s, s.toAct, { action: 'check' })
      else break
    }
    expect(s.street).toBe('fourth')
    // Even if big bet didn't unlock on 4th, by 5th it should.
    while (s.street === 'fourth' && s.toAct) {
      const la = legalActions(s, s.toAct)
      if (la.canCheck) applyAction(s, s.toAct, { action: 'check' })
      else if (la.canCall) applyAction(s, s.toAct, { action: 'call' })
      else break
    }
    expect(s.street).toBe('fifth')
    expect(s.bigBetUnlocked).toBe(true)
  })

  it('deals a community card on 7th when the deck runs short', () => {
    const s = createInitialState({ seats: makeSeats(8), gameType: 'stud', startingStack: 1000, rngSeed: 7 })
    startHand(s)
    // Hand-shape state: simulate having reached 6th street with 8 live players, deck nearly empty.
    s.street = 'sixth'
    s.bigBetUnlocked = true
    s.currentBet = 0
    s.lastRaiseSize = 0
    s.raisesThisStreet = 0
    s.toAct = null
    for (const p of s.players) {
      p.folded = false
      p.allIn = false
      p.eliminated = false
      p.currentBet = 0
      p.hasActedThisStreet = true
      p.cards = [
        { card: '2C', visibility: 'private' },
        { card: '3D', visibility: 'private' },
        { card: '4H', visibility: 'public' },
        { card: '5S', visibility: 'public' },
        { card: '6C', visibility: 'public' },
        { card: '7D', visibility: 'public' },
      ]
    }
    // Leave only 3 cards in the deck — fewer than 8 live players.
    s.deck = ['8H', '9S', 'TC']
    advanceStreetIfReady(s)
    expect(s.street).toBe('seventh')
    expect(s.communityCards).toHaveLength(1)
    // No individual cards array grew.
    for (const p of s.players) {
      expect(p.cards).toHaveLength(6)
    }
  })
})
