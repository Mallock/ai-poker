import { cardValue } from './cards.js'

// Sum of card values still held by every non-winner seat. Called once a round has been
// marked complete by the rules layer.
//
// Returns:
//   {
//     winnerSeatIndex: number,
//     points: number,                         // sum across all non-winner hands
//     perSeatRemainingValues: number[],       // one entry per seat (winner is 0)
//   }
export function scoreRound(state) {
  if (!state.roundComplete || state.roundWinnerSeatIndex === null) {
    throw new Error('scoreRound called before the round was complete')
  }
  const winner = state.roundWinnerSeatIndex
  const perSeatRemainingValues = state.hands.map((hand, i) => {
    if (i === winner) return 0
    return hand.reduce((sum, c) => sum + cardValue(c), 0)
  })
  const points = perSeatRemainingValues.reduce((a, b) => a + b, 0)
  return { winnerSeatIndex: winner, points, perSeatRemainingValues }
}
