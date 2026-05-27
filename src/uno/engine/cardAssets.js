// Maps an Uno card `{ color, value }` to a static asset path under `/uno/`.
//
// Assets live in `public/uno/` (copied + kebab-cased from the original `Uno Game Assets/`
// folder). Public paths bypass Vite's asset graph the same way `/portraits/*.png` does.
//
// Colors: 'red' | 'yellow' | 'green' | 'blue' for numerics and action cards.
//         The Wild and Wild Draw 4 cards have `color: 'wild'` (the *displayed* card is
//         color-neutral; the chosen color lives on the discard-pile entry, not the card).
//
// Values: 0..9 (numbers), 'skip', 'reverse', 'draw2', 'wild', 'wild_draw4'.

const BACK = '/uno/back.png'
const WILD = '/uno/wild.png'
const WILD_DRAW4 = '/uno/wild-draw4.png'

export function assetFor(card) {
  if (!card) return BACK
  const { color, value } = card
  if (value === 'wild') return WILD
  if (value === 'wild_draw4') return WILD_DRAW4
  if (color === 'wild') {
    // Wild cards without a value field — treat as a generic Wild.
    return WILD
  }
  if (typeof value === 'number') {
    return `/uno/${color}-${value}.png`
  }
  // skip / reverse / draw2
  return `/uno/${color}-${value}.png`
}

export function backAsset() {
  return BACK
}

// Table background assets (table-bg-0.png … table-bg-4.png). The engine doesn't use these;
// `UnoTable.vue` picks one for visual variety.
export function tableBackgroundAsset(variant = 0) {
  const n = Math.max(0, Math.min(4, variant | 0))
  return `/uno/table-bg-${n}.png`
}
