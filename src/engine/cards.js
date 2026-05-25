// Card encoding: a card is a 2- or 3-character string "<rank><suit>"
//   rank: 2..9, T, J, Q, K, A
//   suit: S (spades), H (hearts), D (diamonds), C (clubs)
// e.g. "AS", "TH", "7D"

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
export const SUITS = ['S', 'H', 'D', 'C']

export function buildFullDeck() {
  const cards = []
  for (const r of RANKS) {
    for (const s of SUITS) {
      cards.push(r + s)
    }
  }
  return cards
}

export function parseCard(card) {
  if (typeof card !== 'string' || card.length < 2) {
    throw new Error(`Invalid card: ${card}`)
  }
  const rank = card.slice(0, -1).toUpperCase()
  const suit = card.slice(-1).toUpperCase()
  if (!RANKS.includes(rank)) throw new Error(`Invalid rank: ${rank}`)
  if (!SUITS.includes(suit)) throw new Error(`Invalid suit: ${suit}`)
  return { rank, suit }
}

// Convert our card format to pokersolver's expected format (e.g. "AS" -> "As").
export function toSolverCard(card) {
  const { rank, suit } = parseCard(card)
  return rank + suit.toLowerCase()
}
