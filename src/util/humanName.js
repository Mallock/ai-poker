// Names used for the human seat when the player leaves the name field blank, so the human
// reads as just another character at the table rather than "You".
const NAME_POOL = [
  'Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Dana',
  'Jamie', 'Reese', 'Taylor', 'Drew', 'Hayden', 'Avery', 'Logan', 'Parker',
  'Skyler', 'Rowan', 'Emerson', 'Charlie',
]

// Pick a plausible first name not already in use at the table (case-insensitive). Falls back
// to "Player" only in the degenerate case where every pooled name is excluded.
export function randomHumanName(excludeNames = []) {
  const taken = new Set(excludeNames.map((n) => String(n).trim().toLowerCase()))
  const free = NAME_POOL.filter((n) => !taken.has(n.toLowerCase()))
  if (free.length === 0) return 'Player'
  return free[Math.floor(Math.random() * free.length)]
}

// Resolve the human seat's display name: the trimmed typed value when non-empty, otherwise a
// random pooled name distinct from the supplied names.
export function resolveHumanName(typed, excludeNames = []) {
  const trimmed = typeof typed === 'string' ? typed.trim() : ''
  if (trimmed) return trimmed
  return randomHumanName(excludeNames)
}
