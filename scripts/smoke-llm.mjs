// Live smoke test: drives one AI decision against the running LM Studio server.
// Run with:  node scripts/smoke-llm.mjs
import { createLlmDriver } from '../src/ai/llmDriver.js'
import { probeLmStudio, EXPECTED_MODEL } from '../src/ai/lmStudio.js'
import { getCharacter } from '../src/ai/characters.js'

async function main() {
  console.log('Probing LM Studio…')
  const probe = await probeLmStudio()
  console.log('  reachable:', probe.reachable, '| models:', probe.models)
  if (!probe.reachable) { console.error('LM Studio unreachable'); process.exit(1) }
  if (!probe.models.includes(EXPECTED_MODEL)) {
    console.error(`Expected model not loaded: ${EXPECTED_MODEL}`)
    process.exit(1)
  }

  const character = getCharacter('the-cowboy')
  console.log(`\nDriving one decision as ${character.name} (${character.id})…\n`)

  // Synthetic player view (mirrors engine getPlayerView shape)
  const view = {
    handNumber: 1,
    street: 'turn',
    blinds: { smallBlind: 25, smallBlind_: undefined, bigBlind: 50, ante: 0 },
    dealerId: 'ai2',
    communityCards: ['5C', 'KC', 'KD'],
    potTotal: 1800,
    currentBet: 600,
    self: {
      id: 'ai1',
      name: character.name,
      seatIndex: 1,
      stack: 9300,
      currentBet: 0,
      totalContributed: 200,
      holeCards: ['AS', 'AH'],
      folded: false,
      allIn: false,
      eliminated: false,
    },
    opponents: [
      { id: 'human', isHuman: true, name: 'You', seatIndex: 0, stack: 9900, currentBet: 0, totalContributed: 200, folded: true, allIn: false, eliminated: false },
      { id: 'ai2', isHuman: false, name: 'Delia', seatIndex: 2, stack: 8700, currentBet: 600, totalContributed: 1300, folded: false, allIn: false, eliminated: false },
    ],
    actionHistory: [
      { handNumber: 1, street: 'preflop', playerId: 'ai2', action: 'raise', amount: 200 },
      { handNumber: 1, street: 'preflop', playerId: 'ai1', action: 'call', amount: 200 },
      { handNumber: 1, street: 'preflop', playerId: 'human', action: 'call', amount: 200 },
      { handNumber: 1, street: 'flop', playerId: 'ai2', action: 'check' },
      { handNumber: 1, street: 'flop', playerId: 'ai1', action: 'check' },
      { handNumber: 1, street: 'flop', playerId: 'human', action: 'check' },
      { handNumber: 1, street: 'turn', playerId: 'ai2', action: 'raise', amount: 600 },
      { handNumber: 1, street: 'turn', playerId: 'human', action: 'fold' },
    ],
    legalActions: {
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 600,
      canRaise: true,
      minRaise: 1200,
      maxRaise: 9300,
      canAllIn: true,
      allInAmount: 9300,
    },
  }

  const events = []
  const eventBus = { emit(e) { events.push(e); process.stdout.write(eventTag(e)) } }

  const t0 = Date.now()
  const driver = createLlmDriver('the-cowboy', { eventBus })
  const decision = await driver.decide(view)
  const dur = Date.now() - t0

  const think = events.filter((e) => e.type === 'think-chunk').map((e) => e.text).join('')
  const content = events.filter((e) => e.type === 'content-chunk').map((e) => e.text).join('')

  console.log('\n\n--- THINK STREAM ---')
  console.log(think || '(empty)')
  console.log('\n--- CONTENT STREAM ---')
  console.log(content || '(empty)')
  console.log('\n--- DECISION ---')
  console.log(JSON.stringify(decision, null, 2))
  console.log(`\nDuration: ${dur}ms`)
}

function eventTag(e) {
  if (e.type === 'think-chunk') return '\x1b[35m·\x1b[0m'
  if (e.type === 'content-chunk') return '\x1b[36m·\x1b[0m'
  if (e.type === 'think-start') return '\n[think-start] '
  if (e.type === 'decision') return '\n[decision]\n'
  if (e.type === 'error') return `\n[error: ${e.error}]\n`
  return ''
}

main().catch((err) => { console.error(err); process.exit(1) })
