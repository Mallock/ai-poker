// Live smoke test for LLM-backed victory quips.
// Run with: node scripts/smoke-quip.mjs
import { requestWinningQuip } from '../src/ai/winningQuip.js'
import { probeLmStudio, EXPECTED_MODEL } from '../src/ai/lmStudio.js'

async function main() {
  console.log('Probing LM Studio…')
  const probe = await probeLmStudio()
  if (!probe.reachable || !probe.models.includes(EXPECTED_MODEL)) {
    console.error('LM Studio unreachable or expected model not loaded.')
    process.exit(1)
  }
  console.log(`Model: ${EXPECTED_MODEL}\n`)

  const cases = [
    {
      label: 'Wade (Cowboy) — showdown win',
      characterId: 'the-cowboy',
      context: {
        uncontested: false,
        amount: 2400,
        handDescr: "Two Pair, A's & K's",
        holeCards: ['AS', 'KH'],
        communityCards: ['AD', 'KC', '5C', '8H', '2D'],
        opponents: ['Vera', 'Walter'],
      },
    },
    {
      label: 'Vera (Femme Fatale) — fold-around win',
      characterId: 'the-femme-fatale',
      context: {
        uncontested: true,
        amount: 750,
        handDescr: null,
        opponents: ['Tyler', 'Dmitri'],
      },
    },
    {
      label: 'Kenji (Stoic) — quiet showdown win',
      characterId: 'the-stoic-asian-pro',
      context: {
        uncontested: false,
        amount: 1800,
        handDescr: 'Flush, Ace High',
        holeCards: ['AH', '9H'],
        communityCards: ['2H', '5H', 'JH', '3C', 'KD'],
        opponents: ['Maxim'],
      },
    },
    {
      label: 'Reggie (Wild Card) — chaotic fold-around',
      characterId: 'the-wild-card',
      context: {
        uncontested: true,
        amount: 4200,
        handDescr: null,
        opponents: ['Walter', 'Delia'],
      },
    },
  ]

  for (const c of cases) {
    const t0 = Date.now()
    const quip = await requestWinningQuip(c.characterId, c.context)
    const dur = Date.now() - t0
    console.log(`${c.label}  [${dur}ms]`)
    console.log(`  → ${quip ?? '(null — fallback would trigger)'}\n`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
