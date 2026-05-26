import { Hand } from 'pokersolver'
import { draw } from './deck.js'
import { toSolverCard, parseCard, RANKS } from './cards.js'
import { goToShowdown } from './streets.js'

const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])) // 2..14

const STUD_NEXT_STREET = {
  third: 'fourth',
  fourth: 'fifth',
  fifth: 'sixth',
  sixth: 'seventh',
}

// Stud-side street machine. Called after the engine has reset per-street bet state.
// Returns true once it's transitioned the state (handed off to next betting round or showdown).
export function advanceStreetIfReadyStud(state) {
  if (state.street === 'seventh') {
    goToShowdown(state)
    return true
  }
  const nextStreet = STUD_NEXT_STREET[state.street]
  if (!nextStreet) return false

  // Deal one new card per live player. 4th/5th/6th = public, 7th = private (or community-card
  // fallback when the deck is short).
  const liveIdxs = state.players
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => !p.folded && !p.eliminated)
    .map(({ idx }) => idx)

  const visibility = nextStreet === 'seventh' ? 'private' : 'public'
  if (nextStreet === 'seventh' && liveIdxs.length > state.deck.length) {
    // Deck shortage: deal a single community card face-up that every live player uses.
    const [drawn] = draw(state.deck, 1)
    state.communityCards.push(drawn)
  } else {
    for (const idx of liveIdxs) {
      const p = state.players[idx]
      const [drawn] = draw(state.deck, 1)
      p.cards.push({ card: drawn, visibility })
    }
  }

  state.street = nextStreet

  // Big-bet unlock: on 4th street if any LIVE player shows a pair on their first two upcards.
  // On 5th+ unconditional. Once unlocked it stays unlocked for the hand.
  if (!state.bigBetUnlocked) {
    if (nextStreet === 'fourth') {
      for (const idx of liveIdxs) {
        const p = state.players[idx]
        const ups = p.cards.filter((c) => c.visibility === 'public').map((c) => c.card)
        // Indices 2 and 3 of cards array are the first two upcards (3rd + 4th street).
        if (ups.length >= 2 && parseCard(ups[0]).rank === parseCard(ups[1]).rank) {
          state.bigBetUnlocked = true
          break
        }
      }
    } else if (nextStreet === 'fifth' || nextStreet === 'sixth' || nextStreet === 'seventh') {
      state.bigBetUnlocked = true
    }
  }

  // If fewer than 2 can still bet, cascade through remaining streets to showdown.
  const canBet = state.players.filter((p) => !p.folded && !p.eliminated && !p.allIn)
  if (canBet.length < 2) {
    while (state.street !== 'handComplete') {
      const after = STUD_NEXT_STREET[state.street]
      if (state.street === 'seventh') {
        goToShowdown(state)
        return true
      }
      if (!after) return true
      const liveAgain = state.players
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => !p.folded && !p.eliminated)
        .map(({ idx }) => idx)
      const nextVis = after === 'seventh' ? 'private' : 'public'
      if (after === 'seventh' && liveAgain.length > state.deck.length) {
        const [drawn] = draw(state.deck, 1)
        state.communityCards.push(drawn)
      } else {
        for (const idx of liveAgain) {
          const [drawn] = draw(state.deck, 1)
          state.players[idx].cards.push({ card: drawn, visibility: nextVis })
        }
      }
      state.street = after
      if (!state.bigBetUnlocked && (after === 'fifth' || after === 'sixth' || after === 'seventh')) {
        state.bigBetUnlocked = true
      }
    }
    return true
  }

  // Set first-to-act for the new street: highest visible poker hand on upcards. Tiebreak by
  // clockwise seat order from seat 0.
  state.toAct = firstToActStud(state) ?? null
  return true
}

// Pick the live player with the highest-ranking visible poker hand built from upcards alone.
// Ties broken by clockwise seat order starting from seat 0.
export function firstToActStud(state) {
  const candidates = state.players
    .filter((p) => !p.folded && !p.allIn && !p.eliminated)
    .map((p) => {
      const ups = p.cards.filter((c) => c.visibility === 'public').map((c) => c.card)
      const ranking = rankUpcards(ups)
      return { p, ranking }
    })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    // Higher ranking wins; if equal, lower seat index wins.
    if (b.ranking.score !== a.ranking.score) return b.ranking.score - a.ranking.score
    for (let i = 0; i < a.ranking.tiebreak.length && i < b.ranking.tiebreak.length; i++) {
      if (b.ranking.tiebreak[i] !== a.ranking.tiebreak[i]) {
        return b.ranking.tiebreak[i] - a.ranking.tiebreak[i]
      }
    }
    return a.p.seatIndex - b.p.seatIndex
  })
  return candidates[0].p.id
}

// Rank a player's upcards alone — used to pick first-to-act on 4th+ streets.
//   score: 0=high card, 1=pair, 2=two pair, 3=trips, 4=straight, 5=flush, 6=full house, 7=quads,
//          8=straight flush
//   tiebreak: sorted-descending ranks for kicker comparison
function rankUpcards(cards) {
  if (!cards || cards.length === 0) return { score: -1, tiebreak: [] }
  if (cards.length === 1) {
    const v = RANK_VALUE[parseCard(cards[0]).rank]
    return { score: 0, tiebreak: [v] }
  }
  // For 2..6 visible cards, use pokersolver where applicable (5+ cards). For 2-4 cards,
  // approximate using pair/trips/quads detection.
  if (cards.length >= 5) {
    try {
      const hand = Hand.solve(cards.map(toSolverCard))
      // Map pokersolver's rank (0..8 roughly) to our score; fall back to 0.
      // pokersolver names: 'Straight Flush', 'Four of a Kind', 'Full House', 'Flush', 'Straight',
      // 'Three of a Kind', 'Two Pair', 'Pair', 'High Card'.
      const nameMap = {
        'Straight Flush': 8,
        'Four of a Kind': 7,
        'Full House': 6,
        'Flush': 5,
        'Straight': 4,
        'Three of a Kind': 3,
        'Two Pair': 2,
        'Pair': 1,
        'High Card': 0,
      }
      const score = nameMap[hand.name] ?? 0
      const tiebreak = (hand.cards ?? []).map((c) => {
        const r = c.toString().toUpperCase().slice(0, -1)
        return RANK_VALUE[r] ?? 0
      })
      return { score, tiebreak }
    } catch {
      // fall through to manual count
    }
  }
  const counts = {}
  for (const c of cards) {
    const r = parseCard(c).rank
    counts[r] = (counts[r] || 0) + 1
  }
  const entries = Object.entries(counts)
    .map(([r, n]) => ({ rank: r, value: RANK_VALUE[r], count: n }))
    .sort((a, b) => (b.count - a.count) || (b.value - a.value))
  const top = entries[0]
  let score = 0
  if (top.count === 4) score = 7
  else if (top.count === 3 && entries[1]?.count === 2) score = 6
  else if (top.count === 3) score = 3
  else if (top.count === 2 && entries[1]?.count === 2) score = 2
  else if (top.count === 2) score = 1
  const tiebreak = entries.flatMap((e) => Array(e.count).fill(e.value))
  return { score, tiebreak }
}
