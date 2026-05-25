// Postflop smoke test: run several realistic flop/turn/river spots across multiple
// AI characters and print the decision each one made. Use this to baseline whether
// the prompts produce real-poker-player postflop behavior or wet-noodle conservatism.
//
//   node scripts/smoke-postflop.mjs
//   node scripts/smoke-postflop.mjs --chars the-cowboy,the-high-roller
//   node scripts/smoke-postflop.mjs --spots cbet-flop,turn-barrel
//   node scripts/smoke-postflop.mjs --think       # print the full <think> stream too
import { createLlmDriver } from '../src/ai/llmDriver.js'
import { probeLmStudio, EXPECTED_MODEL } from '../src/ai/lmStudio.js'
import characters from '../src/ai/characters.js'

const args = parseArgs(process.argv.slice(2))

// ---- spots ---------------------------------------------------------------

// Each spot is a fully-formed view (matches engine getPlayerView shape). We always cast
// the AI character as `self`. Human is folded out so the spot is heads-up vs one villain
// represented by the dealer button player.
function makeView(spot) {
  return {
    handNumber: 1,
    street: spot.street,
    blinds: { smallBlind: 25, bigBlind: 50, ante: 0 },
    dealerId: 'villain',
    communityCards: spot.board,
    potTotal: spot.pot,
    currentBet: spot.currentBet,
    self: {
      id: 'hero',
      name: 'Hero',
      seatIndex: 1,
      stack: spot.heroStack,
      currentBet: spot.heroCurrentBet ?? 0,
      totalContributed: spot.heroTotal,
      holeCards: spot.holeCards,
      folded: false,
      allIn: false,
      eliminated: false,
    },
    opponents: [
      {
        id: 'human',
        isHuman: true,
        name: 'You',
        seatIndex: 0,
        stack: 10000 - spot.humanTotal,
        currentBet: 0,
        totalContributed: spot.humanTotal,
        folded: true,
        allIn: false,
        eliminated: false,
      },
      {
        id: 'villain',
        isHuman: false,
        name: 'Villain',
        seatIndex: 2,
        stack: spot.villainStack,
        currentBet: spot.villainCurrentBet ?? 0,
        totalContributed: spot.villainTotal,
        folded: false,
        allIn: false,
        eliminated: false,
      },
    ],
    actionHistory: spot.history,
    legalActions: spot.legal,
  }
}

const spots = {
  // Hero raised preflop, villain (BB) called. Flop is dry, villain checks to hero.
  // A real poker player ranges-bets this almost always.
  'cbet-flop-dry': {
    label: 'C-bet flop, dry board, IP as preflop raiser',
    street: 'flop',
    board: ['KH', '7C', '2D'],
    pot: 300,
    currentBet: 0,
    holeCards: ['AH', 'JS'],
    heroStack: 9850, heroCurrentBet: 0, heroTotal: 150,
    villainStack: 9850, villainCurrentBet: 0, villainTotal: 150,
    humanTotal: 0,
    history: [
      { handNumber: 1, street: 'preflop', playerId: 'hero', action: 'raise', amount: 150 },
      { handNumber: 1, street: 'preflop', playerId: 'human', action: 'fold' },
      { handNumber: 1, street: 'preflop', playerId: 'villain', action: 'call', amount: 100 },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'check' },
    ],
    legal: {
      canFold: false, canCheck: true,
      canCall: false, callAmount: 0,
      canRaise: true, minRaise: 50, maxRaise: 9850,
      canAllIn: true, allInAmount: 9850,
    },
  },

  // Hero raised preflop, villain called. Flop hits hero's range hard, villain donk-leads small.
  // Real player raises this for value/protection or with bluffs, doesn't just call.
  'flop-donk-bet': {
    label: 'Villain donk-leads small into preflop raiser on Axx',
    street: 'flop',
    board: ['AC', '8H', '4D'],
    pot: 300,
    currentBet: 100,
    holeCards: ['AS', 'KS'],
    heroStack: 9850, heroCurrentBet: 0, heroTotal: 150,
    villainStack: 9750, villainCurrentBet: 100, villainTotal: 250,
    humanTotal: 0,
    history: [
      { handNumber: 1, street: 'preflop', playerId: 'hero', action: 'raise', amount: 150 },
      { handNumber: 1, street: 'preflop', playerId: 'human', action: 'fold' },
      { handNumber: 1, street: 'preflop', playerId: 'villain', action: 'call', amount: 100 },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'raise', amount: 100 },
    ],
    legal: {
      canFold: true, canCheck: false,
      canCall: true, callAmount: 100,
      canRaise: true, minRaise: 200, maxRaise: 9850,
      canAllIn: true, allInAmount: 9850,
    },
  },

  // Hero c-bet flop, villain called. Turn brings a brick. Villain checks again.
  // Strong overpair should fire a second barrel for value. Conservative play = check back.
  'turn-barrel-overpair': {
    label: 'Turn double-barrel with overpair after flop c-bet got called',
    street: 'turn',
    board: ['9H', '6C', '2D', '3S'],
    pot: 700,
    currentBet: 0,
    holeCards: ['QH', 'QD'],
    heroStack: 9500, heroCurrentBet: 0, heroTotal: 500,
    villainStack: 9500, villainCurrentBet: 0, villainTotal: 500,
    humanTotal: 0,
    history: [
      { handNumber: 1, street: 'preflop', playerId: 'hero', action: 'raise', amount: 150 },
      { handNumber: 1, street: 'preflop', playerId: 'human', action: 'fold' },
      { handNumber: 1, street: 'preflop', playerId: 'villain', action: 'call', amount: 100 },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'check' },
      { handNumber: 1, street: 'flop', playerId: 'hero', action: 'raise', amount: 200 },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'call', amount: 200 },
      { handNumber: 1, street: 'turn', playerId: 'villain', action: 'check' },
    ],
    legal: {
      canFold: false, canCheck: true,
      canCall: false, callAmount: 0,
      canRaise: true, minRaise: 50, maxRaise: 9500,
      canAllIn: true, allInAmount: 9500,
    },
  },

  // Hero in BB facing a c-bet on a board that misses hero hard. Hero has a flush draw.
  // Real player check-raises or floats — conservative play just folds or calls passively.
  'flop-floating-fd': {
    label: 'OOP with flush draw, villain c-bets — float or raise vs fold',
    street: 'flop',
    board: ['JD', '7D', '2C'],
    pot: 300,
    currentBet: 200,
    holeCards: ['AD', '5D'],
    heroStack: 9850, heroCurrentBet: 0, heroTotal: 150,
    villainStack: 9650, villainCurrentBet: 200, villainTotal: 350,
    humanTotal: 0,
    history: [
      { handNumber: 1, street: 'preflop', playerId: 'villain', action: 'raise', amount: 150 },
      { handNumber: 1, street: 'preflop', playerId: 'human', action: 'fold' },
      { handNumber: 1, street: 'preflop', playerId: 'hero', action: 'call', amount: 100 },
      { handNumber: 1, street: 'flop', playerId: 'hero', action: 'check' },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'raise', amount: 200 },
    ],
    legal: {
      canFold: true, canCheck: false,
      canCall: true, callAmount: 200,
      canRaise: true, minRaise: 400, maxRaise: 9850,
      canAllIn: true, allInAmount: 9850,
    },
  },

  // River, pure air (5-high), villain has shown weakness throughout (check-call flop,
  // check turn, check river). Only way for hero to win is bluff. Real player snap-bets.
  // Conservative play gives up.
  'river-busted-bluff': {
    label: 'River pure air vs capped villain (check-call flop, check turn, check river)',
    street: 'river',
    board: ['JD', 'TD', '2C', '5S', '8H'],
    pot: 700,
    currentBet: 0,
    holeCards: ['4S', '3S'],
    heroStack: 9500, heroCurrentBet: 0, heroTotal: 500,
    villainStack: 9500, villainCurrentBet: 0, villainTotal: 500,
    humanTotal: 0,
    history: [
      { handNumber: 1, street: 'preflop', playerId: 'hero', action: 'raise', amount: 150 },
      { handNumber: 1, street: 'preflop', playerId: 'human', action: 'fold' },
      { handNumber: 1, street: 'preflop', playerId: 'villain', action: 'call', amount: 100 },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'check' },
      { handNumber: 1, street: 'flop', playerId: 'hero', action: 'raise', amount: 200 },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'call', amount: 200 },
      { handNumber: 1, street: 'turn', playerId: 'villain', action: 'check' },
      { handNumber: 1, street: 'turn', playerId: 'hero', action: 'check' },
      { handNumber: 1, street: 'river', playerId: 'villain', action: 'check' },
    ],
    legal: {
      canFold: false, canCheck: true,
      canCall: false, callAmount: 0,
      canRaise: true, minRaise: 50, maxRaise: 9500,
      canAllIn: true, allInAmount: 9500,
    },
  },

  // River, top set on a board that ran out scary. Villain leads big. Real player
  // doesn't fold the second nuts to a single river bet without good reason.
  'river-set-vs-overbet': {
    label: 'River top set facing overbet — must not over-fold strong made hands',
    street: 'river',
    board: ['KH', '9D', '4S', '6S', '8S'],
    pot: 1200,
    currentBet: 1500,
    holeCards: ['KS', 'KC'],
    heroStack: 8500, heroCurrentBet: 0, heroTotal: 600,
    villainStack: 7000, villainCurrentBet: 1500, villainTotal: 2100,
    humanTotal: 0,
    history: [
      { handNumber: 1, street: 'preflop', playerId: 'hero', action: 'raise', amount: 150 },
      { handNumber: 1, street: 'preflop', playerId: 'human', action: 'fold' },
      { handNumber: 1, street: 'preflop', playerId: 'villain', action: 'call', amount: 100 },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'check' },
      { handNumber: 1, street: 'flop', playerId: 'hero', action: 'raise', amount: 200 },
      { handNumber: 1, street: 'flop', playerId: 'villain', action: 'call', amount: 200 },
      { handNumber: 1, street: 'turn', playerId: 'villain', action: 'check' },
      { handNumber: 1, street: 'turn', playerId: 'hero', action: 'raise', amount: 250 },
      { handNumber: 1, street: 'turn', playerId: 'villain', action: 'call', amount: 250 },
      { handNumber: 1, street: 'river', playerId: 'villain', action: 'raise', amount: 1500 },
    ],
    legal: {
      canFold: true, canCheck: false,
      canCall: true, callAmount: 1500,
      canRaise: true, minRaise: 3000, maxRaise: 8500,
      canAllIn: true, allInAmount: 8500,
    },
  },
}

// ---- runner -------------------------------------------------------------

async function main() {
  const probe = await probeLmStudio()
  if (!probe.reachable) { console.error('LM Studio unreachable'); process.exit(1) }
  if (!probe.models.includes(EXPECTED_MODEL)) {
    console.error(`Expected model not loaded: ${EXPECTED_MODEL}`)
    process.exit(1)
  }
  console.log(`Model: ${EXPECTED_MODEL}\n`)

  const charIds = args.chars ? args.chars.split(',') : characters.map((c) => c.id)
  const spotIds = args.spots ? args.spots.split(',') : Object.keys(spots)

  for (const spotId of spotIds) {
    const spot = spots[spotId]
    if (!spot) { console.warn(`Unknown spot: ${spotId}`); continue }
    console.log('='.repeat(80))
    console.log(`SPOT: ${spotId} — ${spot.label}`)
    console.log(`  board=${spot.board.join(' ')}  hole=${spot.holeCards.join(' ')}  pot=${spot.pot}  toCall=${spot.currentBet - (spot.heroCurrentBet ?? 0)}`)
    console.log('='.repeat(80))

    for (const charId of charIds) {
      const result = await runOne(charId, spot)
      printResult(charId, result)
    }
    console.log()
  }
}

async function runOne(charId, spot) {
  const view = makeView(spot)
  const events = []
  const eventBus = { emit(e) { events.push(e) } }
  const t0 = Date.now()
  const driver = createLlmDriver(charId, { eventBus })
  let decision
  try {
    decision = await driver.decide(view)
  } catch (err) {
    return { error: err.message }
  }
  const dur = Date.now() - t0
  const think = events.filter((e) => e.type === 'think-chunk').map((e) => e.text).join('')
  return { decision, dur, think }
}

function printResult(charId, result) {
  if (result.error) {
    console.log(`  ${charId.padEnd(28)} ERROR: ${result.error}`)
    return
  }
  const d = result.decision
  const action = d.action === 'raise' ? `raise to ${d.amount}` : d.action
  const say = d.say ? `  "${d.say}"` : ''
  console.log(`  ${charId.padEnd(28)} ${action.padEnd(22)} (${result.dur}ms)${say}`)
  if (args.think && result.think) {
    const indented = result.think.split('\n').map((l) => '      ' + l).join('\n')
    console.log(indented)
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--think') out.think = true
    else if (a === '--chars') out.chars = argv[++i]
    else if (a === '--spots') out.spots = argv[++i]
  }
  return out
}

main().catch((err) => { console.error(err); process.exit(1) })
