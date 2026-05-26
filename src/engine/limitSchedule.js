// Default 7 Card Stud limit schedule: starts at ante 10 / bring-in 25 / small bet 50 / big bet 100,
// doubles every 10 hands.

export function defaultStudLimitSchedule(levels = 12, handsPerLevel = 10) {
  const out = []
  let ante = 10
  let bringIn = 25
  let smallBet = 50
  let bigBet = 100
  for (let level = 1; level <= levels; level++) {
    out.push({ level, ante, bringIn, smallBet, bigBet, handsAtLevel: handsPerLevel })
    ante *= 2
    bringIn *= 2
    smallBet *= 2
    bigBet *= 2
  }
  return out
}

// Look up the current limit row by reading blindLevel (re-using the same level rotation across
// game types so tournament-structure logic doesn't fork).
export function currentLimits(state) {
  if (!state.limitSchedule || state.limitSchedule.length === 0) return null
  const idx = Math.min(state.blindLevel, state.limitSchedule.length - 1)
  return state.limitSchedule[idx]
}
