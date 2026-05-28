import { activeColor, discardTop, topCard } from './state.js'
import { legalActions } from './rules.js'

// Build the per-player view used by the AI driver and the UI. Opponents' hand contents are
// redacted to hand size only.
//
// Shape:
//   {
//     viewerSeatIndex,
//     self: { seatIndex, id, name, hand: Card[], handSize },
//     opponents: [{ seatIndex, id, name, isHuman, characterId?, handSize }],
//     discardTop: Card | null,
//     activeColor: 'red' | 'yellow' | 'green' | 'blue' | null,
//     drawPileSize, direction, currentSeatIndex,
//     pendingDraw, pendingSkip, pendingWildColor,
//     pendingWildDraw4Challenge: { ... } | null,   // present when this viewer is the victim
//     pendingUnoCatch: { seatIndex } | null,
//     midTurnDraw: { seatIndex, cardIndex } | null,
//     recentActions: ActionLogEntry[],
//     tableChat: [{ roundNumber, seatIndex, name, characterId, text }],  // recent table-talk
//     roundNumber, totalRounds, scores: number[],
//     roundComplete, roundWinnerSeatIndex, matchComplete, matchWinnerSeatIndex,
//     legalActions,
//   }
export function getPlayerView(state, viewerSeatIndex) {
  const self = state.seats[viewerSeatIndex]
  const top = topCard(state)
  return {
    viewerSeatIndex,
    self: {
      seatIndex: viewerSeatIndex,
      id: self.id,
      name: self.name,
      isHuman: !!self.isHuman,
      characterId: self.characterId ?? null,
      hand: state.hands[viewerSeatIndex].map((c) => ({ id: c.id, color: c.color, value: c.value })),
      handSize: state.hands[viewerSeatIndex].length,
    },
    opponents: state.seats
      .map((s, i) => ({
        seatIndex: i,
        id: s.id,
        name: s.name,
        isHuman: !!s.isHuman,
        characterId: s.characterId ?? null,
        handSize: state.hands[i].length,
      }))
      .filter((s) => s.seatIndex !== viewerSeatIndex),
    discardTop: top ? { id: top.id, color: top.color, value: top.value } : null,
    discardChosenColor: discardTop(state)?.chosenColor ?? null,
    activeColor: activeColor(state),
    drawPileSize: state.drawPile.length,
    direction: state.direction,
    currentSeatIndex: state.currentSeatIndex,
    pendingDraw: state.pendingDraw,
    pendingSkip: state.pendingSkip,
    pendingWildColor: state.pendingWildColor,
    pendingWildDraw4Challenge: state.pendingWildDraw4Challenge
      ? {
          playerSeatIndex: state.pendingWildDraw4Challenge.playerSeatIndex,
          victimSeatIndex: state.pendingWildDraw4Challenge.victimSeatIndex,
          previousColor: state.pendingWildDraw4Challenge.previousColor,
        }
      : null,
    pendingUnoCatch: state.pendingUnoCatch ? { seatIndex: state.pendingUnoCatch.seatIndex } : null,
    midTurnDraw: state.midTurnDraw ? { ...state.midTurnDraw } : null,
    recentActions: state.recentActions.slice(-16),
    tableChat: (state.chatLog ?? []).slice(-12).map((c) => ({ ...c })),
    roundNumber: state.roundNumber,
    totalRounds: state.totalRounds,
    scores: [...state.scores],
    roundComplete: state.roundComplete,
    roundWinnerSeatIndex: state.roundWinnerSeatIndex,
    matchComplete: state.matchComplete,
    matchWinnerSeatIndex: state.matchWinnerSeatIndex,
    legalActions: legalActions(state, viewerSeatIndex),
  }
}
