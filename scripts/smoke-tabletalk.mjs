// Live smoke + variety harness for the dedicated table-talk pass.
// Run with: node scripts/smoke-tabletalk.mjs
//
// Drives requestTableTalk over a fixed battery of scripted situations across several
// characters, samples each N times, and reports per-character latency and a variety score
// (unique normalized lines / total samples) plus the most-repeated line — so prompt changes
// can be evaluated for monotony without playing hands.
import { requestTableTalk } from '../src/ai/tableTalk.js'
import { normalizeLine } from '../src/ai/lineClean.js'
import { probeLmStudio, EXPECTED_MODEL } from '../src/ai/lmStudio.js'

const SAMPLES = Number(process.env.SAMPLES ?? 6)

// Battery of situations. Each is run for every character below. Mix of streets, actions,
// addressed/needling chat, and a strong-hand spot to eyeball for hand-strength leaks.
const SITUATIONS = [
  {
    label: 'open-raise, quiet table',
    ctx: { action: 'raise', amount: 250, street: 'preflop', board: '', potTotal: 150,
           recentChat: [], ownRecentLines: [] },
  },
  {
    label: 'needled by name (addressed)',
    ctx: { action: 'call', amount: 250, street: 'flop', board: 'King of Hearts, Seven of Diamonds, Two of Clubs',
           potTotal: 650, addressedBy: 'Reggie',
           recentChat: [{ name: 'Reggie', text: 'You always fold here, what changed?' }] },
  },
  {
    label: 'big river shove with the NUTS (leak check)',
    ctx: { action: 'all-in', amount: 4200, street: 'river',
           board: 'Ace of Spades, King of Spades, Queen of Spades, Two of Hearts, Jack of Spades',
           potTotal: 5000, recentChat: [{ name: 'Vera', text: 'Mm. That is a scary board.' }],
           ownRecentLines: [] },
  },
  {
    label: 'fold to pressure, anti-repeat',
    ctx: { action: 'fold', amount: 0, street: 'turn', board: 'Nine of Clubs, Nine of Diamonds, Four of Hearts, Ten of Spades',
           potTotal: 1200, recentChat: [{ name: 'Dmitri', text: 'Too rich for the cowboy?' }],
           ownRecentLines: ['Reckon I gotta see it.', 'Your bet, friend.'] },
  },
]

const CHARACTERS = ['the-cowboy', 'the-femme-fatale', 'the-stoic-asian-pro', 'the-wild-card']

function variety(lines) {
  const real = lines.filter(Boolean)
  if (real.length === 0) return { score: 0, total: lines.length, unique: 0, topRepeat: null, topCount: 0 }
  const counts = new Map()
  for (const l of real) {
    const k = normalizeLine(l)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let topRepeat = null
  let topCount = 0
  for (const [k, n] of counts) {
    if (n > topCount) { topCount = n; topRepeat = k }
  }
  return { score: counts.size / lines.length, total: lines.length, unique: counts.size, topRepeat, topCount }
}

async function main() {
  console.log('Probing LM Studio…')
  const probe = await probeLmStudio()
  if (!probe.reachable || !probe.models.includes(EXPECTED_MODEL)) {
    console.error('LM Studio unreachable or expected model not loaded.')
    process.exit(1)
  }
  console.log(`Model: ${EXPECTED_MODEL}  |  samples per situation: ${SAMPLES}\n`)

  for (const characterId of CHARACTERS) {
    console.log(`════════ ${characterId} ════════`)
    const allLines = []
    let totalMs = 0
    let calls = 0
    for (const sit of SITUATIONS) {
      console.log(`  • ${sit.label}`)
      const lines = []
      for (let i = 0; i < SAMPLES; i++) {
        const t0 = Date.now()
        const line = await requestTableTalk(characterId, sit.ctx)
        totalMs += Date.now() - t0
        calls += 1
        lines.push(line)
        allLines.push(line)
        console.log(`      ${line === null ? '(silent/dropped)' : line}`)
      }
      const v = variety(lines)
      console.log(`      → situation variety: ${v.unique}/${v.total} unique (${(v.score * 100).toFixed(0)}%)`)
    }
    const v = variety(allLines)
    const avgMs = calls ? Math.round(totalMs / calls) : 0
    console.log(`  ── ${characterId}: variety ${(v.score * 100).toFixed(0)}% (${v.unique}/${v.total} unique), avg ${avgMs}ms/call`)
    if (v.topCount > 1) console.log(`     most-repeated: "${v.topRepeat}" ×${v.topCount}`)
    console.log('')
  }

  console.log('Eyeball the "NUTS" spot above: lines must NOT reveal hand strength (no "I have the nuts", "flush", etc.).')
}

main().catch((err) => { console.error(err); process.exit(1) })
