import { computePots, potTotal } from './sidePots.js'
import { currentBlinds } from './blindSchedule.js'
import { currentLimits } from './limitSchedule.js'
import { legalActions } from './betting.js'
import { getUpCards } from './state.js'

function cloneCards(cards) {
  if (!Array.isArray(cards)) return []
  return cards.map((c) => ({ card: c.card, visibility: c.visibility }))
}

function selfBlock(self) {
  return {
    id: self.id,
    seatIndex: self.seatIndex,
    name: self.name,
    characterId: self.characterId,
    isHuman: self.isHuman,
    stack: self.stack,
    currentBet: self.currentBet,
    totalContributed: self.totalContributed,
    folded: self.folded,
    allIn: self.allIn,
    eliminated: self.eliminated,
    cards: cloneCards(self.cards),
  }
}

// Build the player-private view. The returned object MUST NOT contain other players' private
// cards anywhere — not as null, not as undefined, just absent from the object. Opponents' public
// upcards appear as a flat string array under `upCards`. This is what enforces no-cheating for
// AI players.
//
// The view is always a fresh, deep-cloned object — mutating it cannot affect engine state.
export function getPlayerView(state, playerId) {
  const self = state.players.find((p) => p.id === playerId)
  if (!self) throw new Error(`Unknown player: ${playerId}`)

  const blinds = currentBlinds(state)
  const limits = currentLimits(state)
  const pots = computePots(state).map((pot) => ({
    amount: pot.amount,
    eligible: [...pot.eligible],
  }))

  // Other players — strictly redacted. Only their public upcards leak through, never private.
  const opponents = state.players
    .filter((p) => p.id !== playerId)
    .map((p) => ({
      id: p.id,
      seatIndex: p.seatIndex,
      name: p.name,
      characterId: p.characterId,
      isHuman: p.isHuman,
      stack: p.stack,
      currentBet: p.currentBet,
      totalContributed: p.totalContributed,
      folded: p.folded,
      allIn: p.allIn,
      eliminated: p.eliminated,
      isBringIn: p.isBringIn ?? false,
      upCards: getUpCards(p),
    }))

  const view = {
    gameType: state.gameType ?? 'holdem',
    limitStructure: state.limitStructure ?? 'no-limit',
    handNumber: state.handNumber,
    street: state.street,
    blinds: { smallBlind: blinds.smallBlind, bigBlind: blinds.bigBlind, ante: blinds.ante ?? 0 },
    limits: limits
      ? { ante: limits.ante, bringIn: limits.bringIn, smallBet: limits.smallBet, bigBet: limits.bigBet }
      : null,
    bigBetUnlocked: !!state.bigBetUnlocked,
    raisesThisStreet: state.raisesThisStreet ?? 0,
    dealerId: state.gameType === 'stud'
      ? null
      : (state.players[state.dealerIndex]?.id ?? null),
    toAct: state.toAct,
    communityCards: [...state.communityCards],
    pots,
    potTotal: potTotal(state),
    currentBet: state.currentBet,
    minRaiseIncrement: Math.max(state.lastRaiseSize, blinds.bigBlind),
    actionHistory: state.actionHistory.map((a) => ({ ...a })),
    self: selfBlock(self),
    opponents,
    // Public table chat. All players hear everything anyone says aloud, so this is shared
    // verbatim (no redaction). Deep-cloned to keep the view immutable.
    tableChat: Array.isArray(state.tableChat)
      ? state.tableChat.map((c) => ({ ...c }))
      : [],
    legalActions: legalActions(state, playerId),
  }
  return view
}

// Build a post-hand summary view for one player. Like getPlayerView, the returned object MUST NOT
// contain private cards a player could not legally see — folded opponents stay hidden; opponents
// who reached showdown have their full cards revealed.
//
// Intended to be called after the hand has settled (street === 'handComplete'). The shape is
// deliberately separate from getPlayerView: this view is for the per-character hand summarizer,
// not for in-turn decision-making.
export function getHandSummaryView(state, playerId) {
  const self = state.players.find((p) => p.id === playerId)
  if (!self) throw new Error(`Unknown player: ${playerId}`)

  const blinds = currentBlinds(state)

  // The hand reached showdown iff at least one award entry had winningHand set (i.e. not
  // an uncontested fold-around). Uncontested wins do not reveal anyone's cards.
  const handAwards = state.actionHistory.filter(
    (a) => a.action === 'award' && a.handNumber === state.handNumber,
  )
  const wentToShowdown = handAwards.some((a) => !a.uncontested && a.winningHand)

  const handActions = state.actionHistory
    .filter((a) => a.handNumber === state.handNumber)
    .map((a) => ({ ...a }))

  const potOutcomes = handAwards.map((a) => ({
    potAmount: a.potAmount,
    winners: [...a.winners],
    winningHand: a.winningHand
      ? { name: a.winningHand.name, descr: a.winningHand.descr, cards: [...a.winningHand.cards] }
      : null,
    uncontested: !!a.uncontested,
  }))

  const opponents = state.players
    .filter((p) => p.id !== playerId)
    .map((p) => {
      const opp = {
        id: p.id,
        seatIndex: p.seatIndex,
        name: p.name,
        characterId: p.characterId,
        isHuman: p.isHuman,
        folded: p.folded,
        allIn: p.allIn,
        eliminated: p.eliminated,
        upCards: getUpCards(p),
      }
      // Reveal full cards only for opponents who reached showdown (saw the river without folding).
      if (wentToShowdown && !p.folded && !p.eliminated && p.cards.length > 0) {
        opp.cards = cloneCards(p.cards)
      }
      return opp
    })

  return {
    gameType: state.gameType ?? 'holdem',
    handNumber: state.handNumber,
    blinds: { smallBlind: blinds.smallBlind, bigBlind: blinds.bigBlind, ante: blinds.ante ?? 0 },
    dealerId: state.gameType === 'stud'
      ? null
      : (state.players[state.dealerIndex]?.id ?? null),
    communityCards: [...state.communityCards],
    wentToShowdown,
    self: {
      id: self.id,
      seatIndex: self.seatIndex,
      name: self.name,
      characterId: self.characterId,
      isHuman: self.isHuman,
      folded: self.folded,
      allIn: self.allIn,
      eliminated: self.eliminated,
      cards: cloneCards(self.cards),
    },
    opponents,
    actionHistory: handActions,
    potOutcomes,
  }
}
