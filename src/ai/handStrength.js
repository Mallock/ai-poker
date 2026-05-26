// Compute a compact, pre-evaluated hand-strength summary for the AI prompt.
//
// Background: LLMs are unreliable at reading "I have Kh3h, the board is Ks Kc 6s 4c" as
// "three of a kind, kings." They will happily call that "top pair, weak kicker" and play it
// for one street of value. The fix is to do the evaluation ourselves with pokersolver and
// put the answer in the prompt verbatim.
//
// This module reports:
//   - Your current best 5-card made hand (pokersolver's name + descr), or null preflop.
//   - 4-card flush draw involving at least one hole card.
//   - Open-ended straight draw (8 outs) and gutshot (4 outs) involving at least one hole card.
// Combo draws (flush draw + straight draw, etc.) are emitted as separate tags so the model
// can stack their meaning.

import { Hand } from 'pokersolver'
import { toSolverCard, parseCard, RANKS } from '../engine/cards.js'

const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])) // 2..14

const RANK_FULL = { '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace' }

// One-line preflop description of two hole cards so the LLM stops misreading suited as
// offsuit (and vice versa). Returns something like "Q-T offsuit (broadway, two-gapper)"
// or "8-8 (pocket pair)" or "7h 6h — 7-6 suited (suited connector)".
export function describePreflopHand(holeCards) {
  if (!Array.isArray(holeCards) || holeCards.length < 2) return null
  let a, b
  try {
    a = parseCard(holeCards[0])
    b = parseCard(holeCards[1])
  } catch {
    return null
  }
  const high = RANK_VALUE[a.rank] >= RANK_VALUE[b.rank] ? a : b
  const low = high === a ? b : a
  const suited = a.suit === b.suit
  const pair = a.rank === b.rank
  const tags = []

  if (pair) {
    const v = RANK_VALUE[a.rank]
    if (v >= 12) tags.push('premium pair')
    else if (v >= 9) tags.push('big pair')
    else if (v >= 6) tags.push('medium pair')
    else tags.push('small pair (set-mining candidate)')
    return `${a.rank}-${a.rank} (pocket ${RANK_FULL[a.rank]}s — ${tags.join(', ')})`
  }

  const gap = RANK_VALUE[high.rank] - RANK_VALUE[low.rank]
  if (gap === 1) tags.push('connectors')
  else if (gap === 2) tags.push('one-gapper')
  else if (gap === 3) tags.push('two-gapper')

  const hv = RANK_VALUE[high.rank]
  if (high.rank === 'A') {
    if (RANK_VALUE[low.rank] <= 9) tags.push('weak Ax — dominated by better aces')
    else tags.push('strong Ax / broadway ace')
  } else if (hv >= 11 && RANK_VALUE[low.rank] >= 10) {
    tags.push('broadway')
  } else if (hv <= 9 && gap <= 1) {
    tags.push('low connectors')
  } else if (hv >= 10 && RANK_VALUE[low.rank] >= 7 && gap === 1) {
    tags.push('mid-high connectors')
  }

  // Premium label only if it's literally one of the top hands.
  const code = high.rank + low.rank + (suited ? 's' : 'o')
  if (['AKs', 'AKo', 'AQs'].includes(code)) tags.push('premium')

  const suitedLabel = suited ? 'suited' : 'offsuit'
  const cardLabel = `${high.rank}-${low.rank} ${suitedLabel}`
  const tagText = tags.length ? ` — ${tags.join(', ')}` : ''
  return `${cardLabel}${tagText}`
}

export function describeHandStrength(holeCards, communityCards) {
  if (!Array.isArray(holeCards) || !Array.isArray(communityCards)) return null
  if (holeCards.length < 2) return null
  if (communityCards.length < 3) return null // preflop / dealing: nothing to compute

  let made = null
  try {
    const all = [...holeCards, ...communityCards].map(toSolverCard)
    const hand = Hand.solve(all)
    made = { name: hand.name, descr: hand.descr, cards: extractSolverCards(hand) }
  } catch {
    made = null
  }

  const draws = detectDraws(holeCards, communityCards)
  return { made, draws }
}

function extractSolverCards(hand) {
  // Pokersolver returns the ten as "10h" but our codebase uses "Th". Normalize so the
  // "using ..." line in the prompt matches the rest of the card format. Other ranks pass
  // through unchanged.
  return (hand?.cards ?? []).map((c) => {
    const s = c.toString()
    if (typeof s !== 'string' || s.length < 2) return s
    let rank = s.slice(0, -1).toUpperCase()
    const suit = s.slice(-1).toLowerCase()
    if (rank === '10') rank = 'T'
    return rank + suit
  })
}

// Returns an array of short draw labels. Only counts draws that USE at least one hole card
// (otherwise the "draw" is shared with the board and doesn't favor you).
function detectDraws(holeCards, communityCards) {
  const hole = holeCards.map(parseCard)
  const board = communityCards.map(parseCard)
  const all = [...hole, ...board]
  const draws = []

  // --- Flush draw -----------------------------------------------------------
  // 4-card flush counts as a draw. 5+ is already a made flush (pokersolver handles that).
  const suitCounts = {}
  for (const c of all) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1
  for (const suit of Object.keys(suitCounts)) {
    if (suitCounts[suit] === 4 && hole.some((c) => c.suit === suit)) {
      draws.push('4-card flush draw (~9 outs to a flush)')
    }
  }

  // --- Straight draws -------------------------------------------------------
  // OESD = 4 consecutive ranks open on both ends (8 outs).
  // Gutshot = 4-out belly-buster (one inside card needed).
  // We require the draw to USE a hole card and we want the strongest tag only, so OESD
  // suppresses gutshot reporting.
  //
  // Build a "rank-set with A as both 14 and 1" so wheel draws (A-2-3-4 → 5) work.
  const allValues = new Set()
  for (const c of all) {
    allValues.add(RANK_VALUE[c.rank])
    if (c.rank === 'A') allValues.add(1)
  }
  const holeValues = new Set()
  for (const c of hole) {
    holeValues.add(RANK_VALUE[c.rank])
    if (c.rank === 'A') holeValues.add(1)
  }

  // Already a made straight? Then there's no "draw" to report.
  const hasStraightAlready = findStraight(allValues) !== null

  if (!hasStraightAlready) {
    let openEnded = false
    let gutshot = false

    // Walk every 4-card window of ranks 1..14 (A-2-3-4-5 through T-J-Q-K-A).
    // A 4-card subset of the all-values whose ranks form a 4-in-a-row window with at
    // least one hole-card rank is a straight draw. Whether it's OESD or gutshot depends
    // on which 4-window we found.
    for (let lo = 1; lo <= 11; lo++) {
      const window = [lo, lo + 1, lo + 2, lo + 3]
      const matched = window.filter((v) => allValues.has(v))
      if (matched.length < 4) continue
      // Require at least one hole-card rank in the window.
      if (!matched.some((v) => holeValues.has(v))) continue
      // OESD: the 4-in-a-row is "open on both sides" — needs lo-1 to be a valid rank
      // (>=2) AND hi+1 to be a valid rank (<=14). lo=2..10 gives 4-window 2-3-4-5 .. 10-J-Q-K
      // — both ends can extend (1+ on one side and 6+ on the other, capped at rank 14).
      // Strictly: lo >= 2 and lo + 3 <= 13 ⇒ lo in [2..10].
      // Wheel windows (lo=1: A-2-3-4) and high windows (lo=11: J-Q-K-A) are one-ended.
      if (lo >= 2 && lo + 3 <= 13) {
        openEnded = true
        break // OESD trumps gutshot — stop looking.
      } else {
        gutshot = true
      }
    }

    // Gutshot via "almost OESD but one inside missing": e.g. 5-6-_-8-9 needing a 7.
    // We catch these by scanning every 5-window and checking for exactly one inside hole.
    if (!openEnded) {
      for (let lo = 1; lo <= 10; lo++) {
        const window = [lo, lo + 1, lo + 2, lo + 3, lo + 4]
        const present = window.filter((v) => allValues.has(v))
        if (present.length !== 4) continue
        const missing = window.find((v) => !allValues.has(v))
        // Must be an interior miss (not the lowest or highest).
        if (missing === window[0] || missing === window[4]) continue
        // Must involve at least one hole-card rank.
        if (!present.some((v) => holeValues.has(v))) continue
        gutshot = true
        break
      }
    }

    if (openEnded) draws.push('open-ended straight draw (8 outs)')
    else if (gutshot) draws.push('gutshot straight draw (4 outs)')
  }

  return draws
}

// Pre-evaluated stud hand description for the prompt's YOUR HAND block.
//   selfCards:    array of { card, visibility }
//   communityCards: array of strings (empty unless deck-shortage 7th-street)
//   opponentUpCards: array of arrays of strings — every opponent's visible upcards (folded or live)
//                    so the live-cards calculation can count what's been seen.
// Returns { made, structure, liveNote }.
export function describeStudHand({ selfCards, communityCards = [], opponentUpCards = [] }) {
  if (!Array.isArray(selfCards) || selfCards.length === 0) return null
  const all = selfCards.map((c) => c.card).concat(communityCards)
  const privateCards = selfCards.filter((c) => c.visibility === 'private').map((c) => c.card)
  const publicCards = selfCards.filter((c) => c.visibility === 'public').map((c) => c.card)

  let made = null
  if (all.length >= 5) {
    try {
      const hand = Hand.solve(all.map(toSolverCard))
      made = { name: hand.name, descr: hand.descr, cards: extractSolverCards(hand) }
    } catch {
      made = null
    }
  }

  // 3rd-street structural classification (private cards = first two, public = third).
  let structure = null
  if (selfCards.length === 3 && privateCards.length === 2 && publicCards.length === 1) {
    structure = classifyThirdStreet(privateCards, publicCards[0])
  }

  const liveNote = computeLiveNote(selfCards, opponentUpCards)

  return { made, structure, liveNote }
}

function classifyThirdStreet(downs, upStr) {
  const d1 = parseCard(downs[0])
  const d2 = parseCard(downs[1])
  const u = parseCard(upStr)
  const ranks = [d1.rank, d2.rank, u.rank]
  const suits = [d1.suit, d2.suit, u.suit]
  const values = ranks.map((r) => RANK_VALUE[r])

  // Rolled-up trips (all three same rank).
  if (d1.rank === d2.rank && d2.rank === u.rank) {
    return `rolled-up ${RANK_FULL[d1.rank]}s (three of a kind on 3rd — the strongest possible start)`
  }
  // Pair: split (one in hole + one up) or buried (pair in the hole).
  if (d1.rank === d2.rank) {
    return `buried pair of ${RANK_FULL[d1.rank]}s with ${u.rank}${u.suit.toLowerCase()} doorcard — disguised pair, opponents see your high card`
  }
  if (d1.rank === u.rank) {
    return `split pair of ${RANK_FULL[d1.rank]}s (one up, one down) with ${d2.rank} kicker — pair is exposed`
  }
  if (d2.rank === u.rank) {
    return `split pair of ${RANK_FULL[d2.rank]}s (one up, one down) with ${d1.rank} kicker — pair is exposed`
  }

  // Three-flush.
  if (suits[0] === suits[1] && suits[1] === suits[2]) {
    const sortedRanks = [...values].sort((a, b) => b - a).map((v) => Object.keys(RANK_VALUE).find((k) => RANK_VALUE[k] === v))
    return `three to a flush (${sortedRanks.join('-')}, three of one suit) — needs four more cards of the suit`
  }

  // Three-straight (consecutive or one-gap detection).
  const sortedV = [...values].sort((a, b) => a - b)
  const span = sortedV[2] - sortedV[0]
  if (sortedV[0] !== sortedV[1] && sortedV[1] !== sortedV[2]) {
    if (span === 2) return `three to a straight (connected ${sortedV[0]}-${sortedV[2]}) — open at both ends`
    if (span === 3) return `three to a straight with one gap (${sortedV[0]}-${sortedV[2]}) — needs the inside card`
    if (span === 4) return `three to a straight with two gaps (${sortedV[0]}-${sortedV[2]}) — long shot`
  }

  const sortedRanks = [...values].sort((a, b) => b - a).map((v) => Object.keys(RANK_VALUE).find((k) => RANK_VALUE[k] === v))
  return `unconnected high cards: ${sortedRanks.join('-')} — marginal start, fold to a raise without live overcards`
}

// Describe what an opponent's visible upcards alone show as a minimum hand strength,
// plus any obvious draws (4-flush, 4-straight) the model should not miss. Returns a short
// string for inclusion next to their upcards in the prompt, or null if there's nothing
// useful to say (e.g., only one upcard).
//
// Example outputs:
//   "pair of 8's exposed"
//   "trip 5's exposed"
//   "K-high — three to a flush (♠)"
//   "T-high — four to a straight (open-ended)"
//   "Q-high"
export function describeVisibleUpcards(upCards) {
  if (!Array.isArray(upCards) || upCards.length < 2) return null
  let parsed
  try {
    parsed = upCards.map(parseCard)
  } catch {
    return null
  }

  const counts = {}
  for (const c of parsed) counts[c.rank] = (counts[c.rank] || 0) + 1
  const groups = Object.entries(counts)
    .map(([r, n]) => ({ rank: r, count: n, value: RANK_VALUE[r] }))
    .sort((a, b) => (b.count - a.count) || (b.value - a.value))
  const top = groups[0]

  let madeLabel = null
  if (top.count >= 4) madeLabel = `quad ${RANK_FULL[top.rank]}s exposed`
  else if (top.count === 3) madeLabel = `trip ${RANK_FULL[top.rank]}s exposed`
  else if (top.count === 2 && groups[1]?.count === 2) {
    madeLabel = `two pair exposed (${RANK_FULL[top.rank]}s + ${RANK_FULL[groups[1].rank]}s)`
  } else if (top.count === 2) madeLabel = `pair of ${RANK_FULL[top.rank]}s exposed`

  const suitCounts = {}
  for (const c of parsed) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1
  const maxSuit = Math.max(...Object.values(suitCounts))
  const flushNote = maxSuit >= 4
    ? `four to a flush exposed`
    : maxSuit === 3 && parsed.length >= 3
      ? `three to a flush exposed`
      : null

  // Straight detection on the rank set (treating A as both 14 and 1).
  const values = new Set()
  for (const c of parsed) {
    values.add(RANK_VALUE[c.rank])
    if (c.rank === 'A') values.add(1)
  }
  let straightNote = null
  if (parsed.length >= 4) {
    for (let lo = 1; lo <= 11 && !straightNote; lo++) {
      const window = [lo, lo + 1, lo + 2, lo + 3]
      const matched = window.filter((v) => values.has(v))
      if (matched.length >= 4) {
        const openEnded = lo >= 2 && lo + 3 <= 13
        straightNote = openEnded
          ? 'four to a straight exposed (open-ended)'
          : 'four to a straight exposed (one-ended)'
      }
    }
  }
  if (!straightNote && parsed.length >= 3) {
    for (let lo = 1; lo <= 12; lo++) {
      const window = [lo, lo + 1, lo + 2]
      const matched = window.filter((v) => values.has(v))
      if (matched.length === 3) {
        straightNote = 'three to a straight exposed'
        break
      }
    }
  }

  const highValue = Math.max(...parsed.map((c) => RANK_VALUE[c.rank]))
  const highRank = Object.keys(RANK_VALUE).find((k) => RANK_VALUE[k] === highValue)
  const highLabel = `${highRank}-high`

  const parts = []
  if (madeLabel) parts.push(madeLabel)
  else parts.push(highLabel)
  if (flushNote) parts.push(flushNote)
  if (straightNote) parts.push(straightNote)
  return parts.join(' — ')
}

function computeLiveNote(selfCards, opponentUpCards) {
  // For each rank present in the player's hand, count how many of the remaining copies are
  // visible on opponents' upcards (which means they cannot help). Surface notable ones.
  const myRanks = new Set(selfCards.map((c) => parseCard(c.card).rank))
  const seenByRank = {}
  for (const ups of opponentUpCards) {
    for (const u of ups || []) {
      const r = parseCard(u).rank
      seenByRank[r] = (seenByRank[r] ?? 0) + 1
    }
  }
  const notes = []
  for (const r of myRanks) {
    const seen = seenByRank[r] ?? 0
    if (seen > 0) notes.push(`${seen} of your ${RANK_FULL[r]}s exposed on opponents' boards`)
    else notes.push(`all four ${RANK_FULL[r]}s live (none folded or shown)`)
  }
  return notes.join('; ')
}

// Returns the high card of the made straight, or null if no straight exists in the rank set.
function findStraight(rankSet) {
  for (let hi = 14; hi >= 5; hi--) {
    if (rankSet.has(hi) && rankSet.has(hi - 1) && rankSet.has(hi - 2) &&
        rankSet.has(hi - 3) && rankSet.has(hi - 4)) {
      return hi
    }
  }
  return null
}
