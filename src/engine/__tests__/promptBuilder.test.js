import { describe, it, expect } from 'vitest'
import { parseActionJson, buildPrompt } from '../../ai/promptBuilder.js'

describe('parseActionJson', () => {
  it('parses a clean object', () => {
    const got = parseActionJson('{"action":"raise","amount":300,"say":"bring it"}')
    expect(got).toEqual({ action: 'raise', amount: 300, say: 'bring it' })
  })

  it('strips markdown fences', () => {
    const got = parseActionJson('```json\n{"action":"check","amount":0,"say":null}\n```')
    expect(got).toEqual({ action: 'check', amount: 0, say: null })
  })

  it('tolerates surrounding whitespace and chatter', () => {
    const got = parseActionJson('Final answer:\n{"action":"fold","amount":0,"say":null}\n')
    expect(got.action).toBe('fold')
  })

  it('coerces missing amount to 0', () => {
    const got = parseActionJson('{"action":"all-in","say":null}')
    expect(got.amount).toBe(0)
  })

  it('coerces non-string say to null', () => {
    const got = parseActionJson('{"action":"check","amount":0,"say":42}')
    expect(got.say).toBe(null)
  })

  it('rejects unknown action', () => {
    expect(() => parseActionJson('{"action":"surrender","amount":0,"say":null}')).toThrow()
  })

  it('rejects malformed JSON', () => {
    expect(() => parseActionJson('not json at all')).toThrow()
  })
})

function makeHoldemView(holeStrings = ['AH', 'AD']) {
  return {
    gameType: 'holdem',
    limitStructure: 'no-limit',
    handNumber: 1, street: 'flop',
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
    limits: null,
    bigBetUnlocked: false,
    dealerId: 'p0', toAct: 'p1',
    communityCards: ['AS', 'KH', '7D'],
    pots: [{ amount: 600, eligible: ['p0', 'p1', 'p2'] }],
    potTotal: 600, currentBet: 0, minRaiseIncrement: 100,
    actionHistory: [],
    self: {
      id: 'p1', name: 'Me', seatIndex: 1, characterId: 'the-cowboy', isHuman: false,
      stack: 1000, currentBet: 0, totalContributed: 200, folded: false, allIn: false, eliminated: false,
      cards: holeStrings.map((c) => ({ card: c, visibility: 'private' })),
    },
    opponents: [
      {
        id: 'p0', name: 'Op0', seatIndex: 0, characterId: 'the-old-pro', isHuman: false,
        stack: 1000, currentBet: 0, totalContributed: 200, folded: false, allIn: false, eliminated: false,
        upCards: [],
      },
    ],
    legalActions: { canFold: true, canCheck: true, canCall: false, callAmount: 0, canRaise: true, minRaise: 100, maxRaise: 1000, canAllIn: true, allInAmount: 1000 },
  }
}

function setSelfHole(view, holeStrings) {
  view.self.cards = holeStrings.map((c) => ({ card: c, visibility: 'private' }))
}

describe('buildPrompt (Hold\'em)', () => {
  const character = { id: 'the-cowboy', name: 'The Cowboy', personality: 'p', playStyle: { holdem: 's', stud: 's2' } }

  it('does not include any other-player hole cards in serialized messages', () => {
    const messages = buildPrompt({ view: makeHoldemView(), character })
    const json = JSON.stringify(messages)
    expect(json).toMatch(/A[hd]/i)
    expect(json).toContain('Ah')
    expect(json).toContain('Ad')
    expect(json).not.toMatch(/"holeCards"\s*:/)
  })

  it('omits the TABLE MEMORY section entirely when memory is empty', () => {
    const messages = buildPrompt({ view: makeHoldemView(), character, memory: '' })
    const system = messages[0].content
    expect(system).not.toContain('=== TABLE MEMORY ===')
  })

  it('inserts TABLE MEMORY between YOUR CHARACTER and OUTPUT FORMAT when present', () => {
    const memory = '=== TABLE MEMORY ===\nLasting impressions: Reggie tilts loud.'
    const messages = buildPrompt({ view: makeHoldemView(), character, memory })
    const system = messages[0].content
    const charIdx = system.indexOf('=== YOUR CHARACTER ===')
    const memIdx = system.indexOf('=== TABLE MEMORY ===')
    const outIdx = system.indexOf('=== OUTPUT FORMAT ===')
    expect(charIdx).toBeGreaterThanOrEqual(0)
    expect(memIdx).toBeGreaterThan(charIdx)
    expect(outIdx).toBeGreaterThan(memIdx)
    expect(system).toContain('Reggie tilts loud.')
  })

  it('omits chat blocks entirely when log is empty', () => {
    const messages = buildPrompt({ view: makeHoldemView(), character })
    const user = messages[1].content
    expect(user).not.toContain('LINES YOU HAVE ALREADY SAID')
    expect(user).not.toContain('RECENT TABLE CHAT')
  })

  it('separates own lines (prominent DO NOT REPEAT block) from others lines', () => {
    const view = makeHoldemView()
    view.tableChat = [
      { handNumber: 1, street: 'preflop', playerId: 'p0', name: 'Op0', characterId: 'the-old-pro', text: 'Your bet.' },
      { handNumber: 1, street: 'flop', playerId: 'p1', name: 'Me', characterId: 'the-cowboy', text: 'Hungry, partner?' },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content

    const ownIdx = user.indexOf('LINES YOU HAVE ALREADY SAID')
    const othersIdx = user.indexOf('RECENT TABLE CHAT')
    expect(ownIdx).toBeGreaterThanOrEqual(0)
    expect(othersIdx).toBeGreaterThan(ownIdx)

    const ownBlock = user.slice(ownIdx, othersIdx)
    expect(ownBlock).toContain('Hungry, partner?')
    expect(ownBlock).not.toContain('Your bet.')

    const othersBlock = user.slice(othersIdx)
    expect(othersBlock).toContain('Op0: Your bet.')
    expect(othersBlock).not.toContain('Hungry, partner?')
  })

  it('surfaces computed made hand + draws in YOUR HAND when postflop', () => {
    const view = makeHoldemView()
    setSelfHole(view, ['KH', '3H'])
    view.communityCards = ['KS', 'KC', '6S', '4C']
    view.street = 'turn'
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Your current made hand.*Three of a Kind/i)
    expect(user).toMatch(/using .*K[hscd] K[hscd] K[hscd]/)
  })

  it('relabels first hold\'em postflop raise as "bet N" but keeps preflop raises as "raise to N"', () => {
    const view = makeHoldemView()
    view.actionHistory = [
      { handNumber: 1, street: 'preflop', playerId: 'p0', action: 'raise', amount: 300 },
      { handNumber: 1, street: 'preflop', playerId: 'p1', action: 'call', amount: 200 },
      { handNumber: 1, street: 'flop', playerId: 'p1', action: 'raise', amount: 400 },
      { handNumber: 1, street: 'flop', playerId: 'p0', action: 'raise', amount: 1200 },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/\[preflop\] Op0: raise to 300/)
    expect(user).toMatch(/\[flop\] You: bet 400/)
    expect(user).toMatch(/\[flop\] Op0: raise to 1200/)
  })

  it('marks the first hold\'em ACTION ORDER entry as (acting now), even after re-opened action', () => {
    const view = makeHoldemView()
    view.toAct = 'p1'
    view.actionHistory = [
      { handNumber: 1, street: 'flop', playerId: 'p1', action: 'check', amount: 0 },
      { handNumber: 1, street: 'flop', playerId: 'p0', action: 'raise', amount: 300 },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/You \(Me\).* \(acting now — action reopened by a raise\)/)
  })

  it('omits made hand line preflop but surfaces preflop hand type', () => {
    const view = makeHoldemView()
    view.communityCards = []
    view.street = 'preflop'
    setSelfHole(view, ['QS', 'TH'])
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toContain('Your current made hand')
    expect(user).toMatch(/Hand type.*Q-T offsuit/)
  })

  it('labels QS QH as a pocket pair preflop', () => {
    const view = makeHoldemView()
    view.communityCards = []
    view.street = 'preflop'
    setSelfHole(view, ['QS', 'QH'])
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Hand type.*Q-Q.*pocket queens/i)
  })

  it('labels 7h 6h as suited connectors preflop', () => {
    const view = makeHoldemView()
    view.communityCards = []
    view.street = 'preflop'
    setSelfHole(view, ['7H', '6H'])
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Hand type.*7-6 suited.*connectors/i)
  })

  it('labels UTG/MP/HJ/CO at a 9-handed table', () => {
    const self = {
      id: 'p5', name: 'Me', seatIndex: 5, characterId: 'the-cowboy', isHuman: false,
      stack: 10000, currentBet: 0, totalContributed: 0, folded: false, allIn: false, eliminated: false,
      cards: [{ card: 'AS', visibility: 'private' }, { card: '2H', visibility: 'private' }],
    }
    const opponents = [0, 1, 2, 3, 4, 6, 7, 8].map((i) => ({
      id: `p${i}`, name: `Op${i}`, seatIndex: i, characterId: null, isHuman: false,
      stack: 10000, currentBet: 0, totalContributed: 0,
      folded: false, allIn: false, eliminated: false,
      upCards: [],
    }))
    const view = {
      gameType: 'holdem', limitStructure: 'no-limit',
      handNumber: 1, street: 'preflop',
      blinds: { smallBlind: 50, bigBlind: 100, ante: 0 }, limits: null, bigBetUnlocked: false,
      dealerId: 'p0', toAct: 'p5',
      communityCards: [], pots: [], potTotal: 150, currentBet: 100, minRaiseIncrement: 100,
      actionHistory: [], self, opponents,
      legalActions: { canFold: true, canCheck: false, canCall: true, callAmount: 100, canRaise: true, minRaise: 200, maxRaise: 10000, canAllIn: true, allInAmount: 10000 },
    }
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toContain('Op0 (seat 0) [BTN]')
    expect(user).toContain('Op1 (seat 1) [SB]')
    expect(user).toContain('Op2 (seat 2) [BB]')
    expect(user).toContain('Op3 (seat 3) [UTG]')
    expect(user).toContain('Op4 (seat 4) [UTG+1]')
    expect(user).toContain('Op6 (seat 6) [MP+1]')
    expect(user).toContain('Op7 (seat 7) [HJ]')
    expect(user).toContain('Op8 (seat 8) [CO]')
    expect(user).toContain('position MP')
  })

  it('reports effective stack in big blinds in the YOUR HAND section', () => {
    const view = makeHoldemView()
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Effective stack vs the smallest live opponent: ~10bb/)
  })

  it('caps OTHERS chat at the most recent 12 entries', () => {
    const view = makeHoldemView()
    view.tableChat = Array.from({ length: 20 }, (_, i) => ({
      handNumber: 1, street: 'preflop', playerId: 'p0', name: 'Op0', characterId: 'the-old-pro',
      text: `line ${i}`,
    }))
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toContain('line 7')
    expect(user).toContain('line 8')
    expect(user).toContain('line 19')
  })

  it('renders cards with lowercase suits in community and hole-card lines (Jh, not JH)', () => {
    const view = makeHoldemView()
    view.communityCards = ['AS', 'KH', '7D']
    setSelfHole(view, ['JH', 'TC'])
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Community cards: As Kh 7d/)
    expect(user).toMatch(/Hole cards: Jh Tc/)
    expect(user).not.toMatch(/Community cards: AS KH 7D/)
  })

  it('emits LIVE PLAYERS list (folded seats excluded)', () => {
    const view = makeHoldemView()
    view.opponents = [
      { id: 'p0', name: 'Op0', seatIndex: 0, characterId: 'the-old-pro', isHuman: false, stack: 1000, currentBet: 0, totalContributed: 200, folded: true, allIn: false, eliminated: false, upCards: [] },
      { id: 'p2', name: 'Op2', seatIndex: 2, characterId: 'the-stoic-asian-pro', isHuman: false, stack: 1000, currentBet: 0, totalContributed: 0, folded: false, allIn: false, eliminated: false, upCards: [] },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    const liveIdx = user.indexOf('=== LIVE PLAYERS')
    const orderIdx = user.indexOf('=== ACTION ORDER')
    expect(liveIdx).toBeGreaterThanOrEqual(0)
    const liveBlock = user.slice(liveIdx, orderIdx)
    expect(liveBlock).toContain('You (Me)')
    expect(liveBlock).toContain('Op2')
    expect(liveBlock).not.toContain('Op0')
  })

  it('renders pot odds when there is a bet to call', () => {
    const view = makeHoldemView()
    view.potTotal = 600
    view.currentBet = 200
    view.legalActions = { ...view.legalActions, canCheck: false, canCall: true, callAmount: 200 }
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Pot odds to call 200.*3:1.*~25%/)
  })

  it('omits pot odds line when checking is free', () => {
    const view = makeHoldemView()
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toContain('Pot odds to call')
  })

  it('caps OWN-lines block at the most recent 6 entries', () => {
    const view = makeHoldemView()
    view.tableChat = Array.from({ length: 10 }, (_, i) => ({
      handNumber: 1, street: 'preflop', playerId: 'p1', name: 'Me', characterId: 'the-cowboy',
      text: `mine ${i}`,
    }))
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toContain('mine 3')
    expect(user).toContain('mine 4')
    expect(user).toContain('mine 9')
  })
})

function makeStudView() {
  return {
    gameType: 'stud',
    limitStructure: 'fixed-limit',
    handNumber: 1, street: 'fourth',
    blinds: { smallBlind: 0, bigBlind: 0, ante: 10 },
    limits: { ante: 10, bringIn: 25, smallBet: 50, bigBet: 100 },
    bigBetUnlocked: false,
    raisesThisStreet: 0,
    dealerId: null, toAct: 'p1',
    communityCards: [],
    pots: [{ amount: 200, eligible: ['p0', 'p1', 'p2'] }],
    potTotal: 200, currentBet: 50, minRaiseIncrement: 50,
    actionHistory: [],
    self: {
      id: 'p1', name: 'Me', seatIndex: 1, characterId: 'the-cowboy', isHuman: false,
      stack: 1000, currentBet: 0, totalContributed: 60, folded: false, allIn: false, eliminated: false,
      cards: [
        { card: 'AH', visibility: 'private' },
        { card: 'KH', visibility: 'private' },
        { card: 'QH', visibility: 'public' },
        { card: '2H', visibility: 'public' },
      ],
    },
    opponents: [
      {
        id: 'p0', name: 'Op0', seatIndex: 0, characterId: 'the-old-pro', isHuman: false,
        stack: 1000, currentBet: 50, totalContributed: 110, folded: false, allIn: false, eliminated: false,
        upCards: ['5C', '7D'],
        isBringIn: true,
      },
    ],
    legalActions: { canFold: true, canCheck: false, canCall: true, callAmount: 50, canRaise: true, minRaise: 100, maxRaise: 100, canAllIn: true, allInAmount: 1000 },
  }
}

describe('buildPrompt (stud)', () => {
  const character = { id: 'the-cowboy', name: 'The Cowboy', personality: 'p', playStyle: { holdem: 'h', stud: 'stud style' } }

  it('emits the stud strategy section (3rd street, live cards, fixed limit)', () => {
    const view = makeStudView()
    const messages = buildPrompt({ view, character })
    const system = messages[0].content
    expect(system).toMatch(/3rd[- ]street/i)
    expect(system).toMatch(/[lL]ive [cC]ards/)
    expect(system).toMatch(/[Ff]ixed[- ]limit|[bB]ring[- ]in/)
  })

  it('does NOT emit Hold\'em-only concepts (c-bet, BTN/CO/HJ, preflop ranges by position)', () => {
    const view = makeStudView()
    const messages = buildPrompt({ view, character })
    const system = messages[0].content
    expect(system).not.toMatch(/c-bet/i)
    expect(system).not.toMatch(/preflop ranges by position/i)
    expect(system).not.toMatch(/BTN\/CO\/HJ/)
  })

  it('renders opponents\' upcards in the user message so the model can read boards', () => {
    const view = makeStudView()
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toContain('their upcards 5c 7d')
  })

  it('renders an inferred [visible: ...] tag from opponent upcards (exposed pair)', () => {
    const view = makeStudView()
    view.opponents[0].upCards = ['8D', '8C', '7C', 'QS']
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/\[visible: pair of eights exposed\]/)
  })

  it('renders ten cards as "T" (not "10") in the made-hand "using" line', () => {
    const view = makeStudView()
    view.street = 'fifth'
    view.self.cards = [
      { card: 'TH', visibility: 'private' },
      { card: '9H', visibility: 'private' },
      { card: '7H', visibility: 'public' },
      { card: '6C', visibility: 'public' },
      { card: 'TS', visibility: 'public' },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    // The "using ..." block must not leak pokersolver's "10h" notation.
    expect(user).not.toMatch(/using[^.\n]*\b10[hscd]\b/)
    // It should however include the ten in "Th" or "Ts" form.
    expect(user).toMatch(/using[^.\n]*\bT[hscd]\b/)
  })

  it('flags the bring-in role on the self block during 3rd street', () => {
    const view = makeStudView()
    view.street = 'third'
    view.self.isBringIn = true
    view.self.cards = [
      { card: 'AH', visibility: 'private' },
      { card: 'KH', visibility: 'private' },
      { card: '2H', visibility: 'public' },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/You are the BRING-IN on 3rd street/)
  })

  it('does not show the bring-in line on 4th+ streets', () => {
    const view = makeStudView()
    view.self.isBringIn = true
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).not.toMatch(/You are the BRING-IN/)
  })

  it('marks the first player in ACTION ORDER as (acting now), not with ✓ acted', () => {
    const view = makeStudView()
    view.toAct = 'p1'
    view.actionHistory = [
      { handNumber: 1, street: 'fourth', playerId: 'p0', action: 'raise', amount: 50 },
      { handNumber: 1, street: 'fourth', playerId: 'p1', action: 'call', amount: 50 },
      { handNumber: 1, street: 'fourth', playerId: 'p0', action: 'raise', amount: 100 },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/You \(Me\) \(acting now — action reopened by a raise\)/)
    expect(user).toMatch(/Op0 ✓ acted earlier/)
  })

  it('relabels raise as "bet N" when it opens a 4th+ street, else "raise to N"', () => {
    const view = makeStudView()
    view.actionHistory = [
      { handNumber: 1, street: 'third', playerId: 'p0', action: 'raise', amount: 50 },
      { handNumber: 1, street: 'third', playerId: 'p1', action: 'call', amount: 50 },
      { handNumber: 1, street: 'fourth', playerId: 'p1', action: 'raise', amount: 100 },
      { handNumber: 1, street: 'fourth', playerId: 'p0', action: 'raise', amount: 200 },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/\[third\] Op0: raise to 50/)
    expect(user).toMatch(/\[fourth\] You: bet 100/)
    expect(user).toMatch(/\[fourth\] Op0: raise to 200/)
  })

  it('includes the 5 cards making the made hand in the YOUR HAND block', () => {
    const view = makeStudView()
    view.street = 'fifth'
    view.self.cards = [
      { card: 'AH', visibility: 'private' },
      { card: 'AS', visibility: 'private' },
      { card: 'KH', visibility: 'public' },
      { card: 'KS', visibility: 'public' },
      { card: '4C', visibility: 'public' },
    ]
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Made hand .*Two Pair.*using/)
  })

  it('renders own private (down) and public (up) cards separately', () => {
    const view = makeStudView()
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/Your down cards \(private.*\): Ah Kh/)
    expect(user).toMatch(/Your upcards \(face-up.*\): Qh 2h/)
  })

  it('selects the stud playStyle string for the character', () => {
    const view = makeStudView()
    const messages = buildPrompt({ view, character })
    const system = messages[0].content
    expect(system).toContain('stud style')
    expect(system).not.toContain('Play style (your default frequency dial — read the section above on how this maps to action): h\n')
  })

  it('renders the fixed-limit raise hint instead of a slider range', () => {
    const view = makeStudView()
    const messages = buildPrompt({ view, character })
    const user = messages[1].content
    expect(user).toMatch(/raise to 100 \(fixed limit/)
  })
})
