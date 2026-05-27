// Uno card model.
//
// A card is `{ id, color, value }`:
//   id    — stable per-card string. Used as a Vue `:key` and as an unambiguous reference
//           from tests and AI driver corrections.
//   color — 'red' | 'yellow' | 'green' | 'blue' for numerics and action cards.
//           'wild' for Wild and Wild Draw 4 cards (their chosen color lives on the
//           discard-pile entry, not the card itself).
//   value — 0..9 (numbers) | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild_draw4'.

export const COLORS = ['red', 'yellow', 'green', 'blue']
export const PLAYABLE_COLORS = COLORS // alias used by the Wild color picker
export const ACTION_VALUES = ['skip', 'reverse', 'draw2']
export const WILD_VALUES = ['wild', 'wild_draw4']

export function makeCard(color, value, suffix) {
  const id = `${color}-${value}${suffix ? '-' + suffix : ''}`
  return { id, color, value }
}

export function isWild(card) {
  return card && (card.value === 'wild' || card.value === 'wild_draw4')
}

export function isActionCard(card) {
  return card && ACTION_VALUES.includes(card.value)
}

export function isNumericCard(card) {
  return card && typeof card.value === 'number'
}

// Round-end scoring weight for a single card.
//   - Numerics: face value (0–9)
//   - Skip / Reverse / Draw 2: 20
//   - Wild / Wild Draw 4: 50
export function cardValue(card) {
  if (!card) return 0
  if (typeof card.value === 'number') return card.value
  if (ACTION_VALUES.includes(card.value)) return 20
  if (WILD_VALUES.includes(card.value)) return 50
  return 0
}

// Human-readable label, e.g. "Red 5", "Blue Skip", "Wild Draw 4".
export function cardLabel(card) {
  if (!card) return '(none)'
  if (card.value === 'wild') return 'Wild'
  if (card.value === 'wild_draw4') return 'Wild Draw 4'
  const colorLabel = card.color.charAt(0).toUpperCase() + card.color.slice(1)
  if (typeof card.value === 'number') return `${colorLabel} ${card.value}`
  const valueLabel = card.value === 'draw2'
    ? 'Draw 2'
    : card.value.charAt(0).toUpperCase() + card.value.slice(1)
  return `${colorLabel} ${valueLabel}`
}
