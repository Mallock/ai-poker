// Default tournament blind schedule: starts at 50/100, doubles every 10 hands.
// Each entry: { level, smallBlind, bigBlind, ante, handsAtLevel }

export function defaultBlindSchedule(levels = 12, handsPerLevel = 10) {
  const out = []
  let sb = 50
  let bb = 100
  for (let level = 1; level <= levels; level++) {
    out.push({ level, smallBlind: sb, bigBlind: bb, ante: 0, handsAtLevel: handsPerLevel })
    sb *= 2
    bb *= 2
  }
  return out
}

export function currentBlinds(state) {
  const idx = Math.min(state.blindLevel, state.blindSchedule.length - 1)
  return state.blindSchedule[idx]
}

// Advances the blind level if the configured number of hands has elapsed at this level.
// Must only be called between hands (never mid-hand). Mutates state.
export function advanceLevelIfNeeded(state) {
  const current = currentBlinds(state)
  if (state.handsAtCurrentLevel >= current.handsAtLevel) {
    if (state.blindLevel < state.blindSchedule.length - 1) {
      state.blindLevel += 1
      state.handsAtCurrentLevel = 0
    }
  }
  return state
}
