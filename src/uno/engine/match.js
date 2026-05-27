import { scoreRound } from './scoring.js'
import { startRound } from './state.js'
import { UNO_EVENTS } from './events.js'

// Apply the just-completed round's score to cumulative `state.scores`, then either:
//   - mark the match complete (if every scheduled round has been played and there is no tie),
//   - schedule a sudden-death round between the tied seats (if the final round leaves a tie),
//   - or leave the match in-progress for the next call to `startNextRound(state)`.
//
// Returns the event array `[{ type: UNO_EVENTS.MATCH_WON, ... }]` when the match ends,
// otherwise `[]`.
export function advanceMatch(state) {
  if (!state.roundComplete) throw new Error('advanceMatch called before the round was complete')

  const result = scoreRound(state)
  state.scores[result.winnerSeatIndex] += result.points
  state.lastRoundResult = {
    winnerSeatIndex: result.winnerSeatIndex,
    points: result.points,
    perSeatRemainingValues: result.perSeatRemainingValues,
    roundNumber: state.roundNumber,
    suddenDeath: !!state.tieBreakSeatIndices,
  }
  // Sudden-death rounds don't count toward totalRounds; the rest do.
  if (!state.tieBreakSeatIndices) {
    // roundNumber was incremented inside startRound; just check if we've finished the schedule.
  }

  // The "schedule" runs out when roundNumber === totalRounds AND no sudden death is in progress.
  // After a sudden-death round, the seat with the higher cumulative score wins outright (since
  // sudden death only includes the tied seats — the winner is whoever empties their hand among
  // the tied subset).
  if (state.tieBreakSeatIndices) {
    // Sudden death: the winner of this round is the match winner.
    state.matchComplete = true
    state.matchWinnerSeatIndex = result.winnerSeatIndex
    state.tieBreakSeatIndices = null
    return [{ type: UNO_EVENTS.MATCH_WON, seatIndex: result.winnerSeatIndex, totalScores: [...state.scores] }]
  }

  const allRoundsPlayed = state.roundNumber >= state.totalRounds
  if (allRoundsPlayed) {
    const topScore = Math.max(...state.scores)
    const leaders = state.scores
      .map((s, i) => ({ s, i }))
      .filter((e) => e.s === topScore)
      .map((e) => e.i)
    if (leaders.length === 1) {
      state.matchComplete = true
      state.matchWinnerSeatIndex = leaders[0]
      return [{ type: UNO_EVENTS.MATCH_WON, seatIndex: leaders[0], totalScores: [...state.scores] }]
    }
    // Tie at the top → sudden death.
    state.tieBreakSeatIndices = leaders
    return []
  }
  return []
}

// After the human dismisses the scorecard. Starts the next round (or the sudden-death round
// if the match is in a tie-break state).
export function startNextRound(state) {
  if (state.matchComplete) throw new Error('Match already complete')
  if (state.tieBreakSeatIndices) {
    startRound(state, { seatSubset: state.tieBreakSeatIndices })
  } else {
    startRound(state)
  }
}
