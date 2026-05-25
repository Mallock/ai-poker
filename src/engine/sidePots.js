// Build the side-pot structure from per-player totalContributed.
// Returns an array of { amount, eligible: [playerId, ...] } ordered main → outermost side.
//
// Algorithm: sort unique contribution levels among non-folded players ascending; each level
// creates a pot of (level - previousLevel) × (number of players who contributed at least `level`),
// eligible to those players.
//
// Folded players still contribute their chips to the appropriate pots but are not eligible.

export function computePots(state) {
  const all = state.players.filter((p) => p.totalContributed > 0)
  if (all.length === 0) return [{ amount: 0, eligible: [] }]

  // Contribution levels considered for pot boundaries = unique amounts among non-folded players.
  const nonFolded = all.filter((p) => !p.folded)
  const levels = [...new Set(nonFolded.map((p) => p.totalContributed))].sort((a, b) => a - b)

  const pots = []
  let prev = 0
  for (const level of levels) {
    let amount = 0
    const eligible = []
    for (const p of all) {
      const contrib = Math.min(p.totalContributed, level) - Math.min(p.totalContributed, prev)
      if (contrib > 0) amount += contrib
      if (!p.folded && p.totalContributed >= level) eligible.push(p.id)
    }
    if (amount > 0) pots.push({ amount, eligible })
    prev = level
  }

  // If all non-folded players are tied AND there are folded contributors above all non-folded amounts,
  // those extra chips also need to go somewhere — they belong in the last (largest) pot, eligible to
  // whoever can win that level. But by construction `levels` already covers all non-folded contributions.
  // Folded contributions above the max non-folded level get added to the top pot.
  if (nonFolded.length > 0) {
    const maxNonFoldedLevel = levels[levels.length - 1]
    const overflow = all
      .filter((p) => p.folded && p.totalContributed > maxNonFoldedLevel)
      .reduce((sum, p) => sum + (p.totalContributed - maxNonFoldedLevel), 0)
    if (overflow > 0 && pots.length > 0) {
      pots[pots.length - 1].amount += overflow
    }
  }

  return pots
}

export function potTotal(state) {
  return state.players.reduce((s, p) => s + p.totalContributed, 0)
}
