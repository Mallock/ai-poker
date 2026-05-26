// Fixture state for visual development of the table before the engine is wired.
// Shape matches what the engine will produce (see src/engine/state.js).

function privateCards(cards) {
  return cards.map((c) => ({ card: c, visibility: 'private' }))
}

export function buildFixtureState() {
  return {
    gameType: 'holdem',
    limitStructure: 'no-limit',
    handNumber: 3,
    street: 'flop',
    blinds: { smallBlind: 50, bigBlind: 100 },
    dealerId: 'p3',
    toAct: 'human',
    communityCards: ['AS', 'KH', '7D'],
    pots: [{ amount: 1850, label: 'Main' }],
    players: [
      { id: 'human', name: 'You', characterId: 'human', stack: 9450, currentBet: 0, cards: privateCards(['AH', 'AD']), folded: false, allIn: false, eliminated: false },
      { id: 'p1', name: 'Wade', characterId: 'the-cowboy', stack: 12100, currentBet: 0, cards: privateCards(['??', '??']), folded: false, allIn: false, eliminated: false },
      { id: 'p2', name: 'Vera', characterId: 'the-femme-fatale', stack: 7800, currentBet: 0, cards: privateCards(['??', '??']), folded: true, allIn: false, eliminated: false },
      { id: 'p3', name: 'Maxim', characterId: 'the-high-roller', stack: 22000, currentBet: 200, cards: privateCards(['??', '??']), folded: false, allIn: false, eliminated: false },
      { id: 'p4', name: 'Walter', characterId: 'the-old-pro', stack: 5400, currentBet: 200, cards: privateCards(['??', '??']), folded: false, allIn: false, eliminated: false },
      { id: 'p5', name: 'Reggie', characterId: 'the-wild-card', stack: 0, currentBet: 0, cards: privateCards(['??', '??']), folded: false, allIn: false, eliminated: true },
    ],
  }
}

export function buildFixtureLegalActions() {
  return {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 200,
    canRaise: true,
    minRaise: 400,
    maxRaise: 9450,
    canAllIn: true,
    allInAmount: 9450,
  }
}
