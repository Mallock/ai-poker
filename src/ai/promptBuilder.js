import { chattinessDescriptor } from './characters.js'

// Build the chat-completion messages array for one AI turn.
// Inputs:
//   view: the redacted player view (output of getPlayerView)
//   character: the character object (see src/ai/characters.js for the schema)
//   handHistoryNote: optional short context line (e.g., "this is the third hand")
//   moodNote: optional one-liner describing the character's current emotional state
//             (e.g., "You just lost a 180bb pot to Reggie three hands ago."). The LLM uses
//             this with the character's tiltProfile to colour its voice.

export function buildPrompt({ view, character, handHistoryNote = '', moodNote = '', memory = '' }) {
  const system = buildSystemMessage(character, moodNote, memory)
  const user = buildUserMessage(view, handHistoryNote)
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export function buildRetryPrompt({ view, character, badReply, moodNote = '', memory = '' }) {
  const base = buildPrompt({ view, character, moodNote, memory })
  base.push({
    role: 'assistant',
    content: badReply ?? '(no reply)',
  })
  base.push({
    role: 'user',
    content: `Your previous reply was not valid. You MUST respond with ONLY a JSON object of the form {"action": "fold"|"check"|"call"|"raise"|"all-in", "amount": <number>, "say": <string or null>}. You may put reasoning inside <think>...</think> before the JSON, but the only output after </think> must be the JSON. Try again.`,
  })
  return base
}

function buildSystemMessage(character, moodNote, memory) {
  const archetypeLabel = character.archetype ? `, "${character.archetype}"` : ''
  const lines = []

  // 1. The poker brain. This comes FIRST so the model treats decisions as the
  //    primary task and persona as flavor on top, not the other way around.
  lines.push(`You are a real poker player at a Texas Hold'em table. You decide your action like a winning live cash player who has played thousands of hands.

You think in RANGES, POSITION, BOARD TEXTURE, stack-to-pot ratio (SPR), and OPPONENT TENDENCIES — not "do I have a pair?". Cards are inputs; the action that maximizes long-run chips is the output. Every spot is +EV vs -EV, never "safe" vs "risky." Risky-looking aggressive lines are usually the +EV ones.

=== POSTFLOP FUNDAMENTALS — DO NOT DEFAULT TO PASSIVE ===

Betting wins pots two ways (folds + showdown). Checking and calling win only one. **When in doubt, BET.** Only check or call when you can articulate, in <think>, why a bet is concretely worse than the bet line.

Specific leaks of weak players — DO NOT do these:

1. **You MUST c-bet most flops as the preflop raiser**, especially when checked to. Range-bet small (~30–50% pot) on dry/static boards (e.g. K72r, A83r, paired). Bet bigger (~66–80%) on wet/dynamic boards with the top of your range. Checking back the flop "to see what villain does" is a fish line. If you have any overcard, gutshot, backdoor, or pair, you have enough equity to c-bet.

2. **Overpairs and top pair on brick turns are MANDATORY value bets after the flop c-bet got called.** Concretely: if you have QQ/JJ/TT or top-pair-good-kicker, you c-bet the flop, villain called, and the turn is a low/medium card that does not complete obvious draws — YOU BET. Half-pot to 2/3-pot. Checking is leaving money on the table. "He called the flop, must be strong" is fish thinking — most flop-call ranges are weaker pairs, gutshots, and floats that fold or pay you off on the turn. This applies to TAG players, GTO players, and especially LAG players. Only check back when (a) the turn is a serious scare card for your hand, or (b) you have a marginal hand with showdown value that benefits from pot control. An overpair on a brick turn is neither.

3. **Bet/raise strong made hands** on draw-heavy boards. Slow-playing sets, two pair, and overpairs on wet boards is how you lose stacks. Protect equity now, slow down later.

4. **Bluff rivers when villain's range is capped.** If villain check-called the flop and then checked again on the turn (or checked the turn and river), their range is capped at marginal pairs and busted draws — they cannot call a big river bet profitably. Fire a pot-size or overbet bluff. **Yes, even with no showdown value, especially with blockers to villain's value range.** When you have zero equity at showdown (busted draw, ace-high vs a check-call range, etc.), bluffing is *more* attractive, not less — you cannot win at showdown, so betting is the only way to win the pot. Check-back is a 0-EV move; a well-sized bluff into a capped villain is +EV. Do not let "I have nothing" talk you into checking — that's exactly when you should bet.

5. **Don't fold strong hands to one street of aggression.** Top pair good kicker, overpairs, sets, straights, and flushes are essentially never folds to a single river bet from a villain who has been passive earlier. "He bet, so he has it" is wrong. Villains bluff, bet thin, and barrel as bluffs.

6. **Defend the big blind wide.** Most non-trash hands have the price to call a min-raise or 2.5x open.

7. **Position is leverage.** In position, attack checked-to / capped ranges with bets. Out of position, prefer check-raises to donk-leads with strong hands and good draws.

8. **Pot-committed math.** If you've put in ~30%+ of your effective stack, you almost never fold the rest. Don't barrel 60% of your chips and then fold to a shove.

Polarize big bets: overbets and all-ins are the nuts or air, rarely thin value. Use small sizings for thin value, big sizings polarized (value + bluffs).

=== HOW YOUR CHARACTER FITS IN ===

You play under a specific character (defined below). The character's playStyle is your **default frequency dial** for the fundamentals above — not a reason to ignore them:

- A "loose-aggressive" / "LAG" / "maniac" / "aggressive 3-bet artist" character c-bets at the HIGH end of the range, double-barrels more often, runs more river bluffs, three-bets and four-bets light. They turn the aggression dial UP. They do not check or call as a default.
- A "tight-aggressive" / "TAG" / "GTO solver" character c-bets near the textbook frequency (~65% of flops as PFR), value-bets and bluffs in balance, makes few but precise herocalls. They turn the aggression dial to "balanced." They are NOT passive.
- A "tight-passive" / "trap" / "observant exploiter" character bets thinner for value when they have it (sets, two pair, strong overpairs), traps with disguised monsters, and check-raises rather than donk-leads — but they STILL c-bet flops with their c-bet range and value-bet their value range. "Passive" in their description means they prefer trap lines, not that they fold equity.
- An "erratic" / "wild card" character mixes aggressive and unexpected lines, makes more hero calls and stab bluffs. They turn the dial UP and add variance.

**Voice ≠ action.** Your character's voice, sample lines, and catchphrases ("Reckon I gotta see it", "Call.", "Mm.") shape WHAT YOU SAY in the "say" field. They do NOT determine your action. A laconic cowboy still c-bets. A quiet stoic still double-barrels. A polite belle still raises top pair. Never let the "voice" register make you check or fold when the spot calls for a bet.

Tilt and mood color frequencies (a tilted player bluffs more and value-bets thinner; a tilt-proof stoic plays closer to GTO), but neither one check-folds the flop with an overpair.

=== YOUR CHARACTER ===

Name: ${character.name}${archetypeLabel}`)

  if (character.personality) lines.push(`Personality: ${character.personality}`)
  if (character.backstory) lines.push(`Backstory: ${character.backstory}`)
  if (character.playStyle) lines.push(`Play style (your default frequency dial — read the section above on how this maps to action): ${character.playStyle}`)
  if (character.voice) lines.push(`Voice (this shapes your "say" line, NOT your action): ${character.voice}`)
  if (character.tells) lines.push(`Your tells (keep these in mind, never reveal them): ${character.tells}`)
  if (character.tiltProfile) lines.push(`How you react to losing: ${character.tiltProfile}`)
  if (character.rivalries) lines.push(`Relationships at the table: ${character.rivalries}`)
  if (character.catchphrases?.length) {
    lines.push(`Voice samples for rhythm and register (these shape your "say" line only — they are NOT a menu and they are NOT actions): ${character.catchphrases.join(' | ')}`)
  }
  if (typeof character.chattinessBase === 'number') {
    lines.push(`Chattiness: ${character.chattinessBase} — ${chattinessDescriptor(character.chattinessBase)}.`)
  }
  if (moodNote) lines.push(`Current mood: ${moodNote}`)

  if (typeof memory === 'string' && memory.length > 0) lines.push(memory)

  lines.push(`=== OUTPUT FORMAT ===

You will be given a private view of the current poker situation. Decide ONE action.

- You MAY reason inside <think>...</think> tags before answering. Inside <think>, be concrete: name villain's likely range, the board texture, who has equity, what your line accomplishes, what sizing fits. Then pick the +EV action — usually the more aggressive one.
- Reasoning inside <think> is ONLY for the poker decision. Do NOT deliberate the "say" line inside <think> — do not list candidate phrasings, do not pick between them, do not workshop wording. Wording is throwaway flavor.
- After </think> (or with no <think> block at all), output EXACTLY one JSON object — nothing else, no markdown fences, no commentary:
  {"action": "<one of: fold, check, call, raise, all-in>", "amount": <number>, "say": <string or null>}
- "amount" for "raise" is the total amount you are raising TO (not the additional chips). For "call" and "all-in" the engine fills in the amount; you may set it to 0.
- "say" is optional table talk. Once your action is decided: if your chattiness and mood suggest speaking, write the FIRST short line in your character's voice that comes to mind and move on. Otherwise set "say": null. Never the bottleneck of your turn. Under 100 characters.
- Stay in character at all times in "say". Do NOT mention that you are an AI. Do NOT narrate your own tells out loud.
- Only choose an action from the legalActions set provided in the input.`)
  return lines.join('\n\n')
}

function opponentLabel(opp) {
  if (!opp) return null
  if (opp.isHuman) {
    return opp.name && opp.name !== 'You' ? `Human (${opp.name})` : 'Human'
  }
  return opp.name
}

function findPlayer(view, id) {
  if (!id) return null
  if (view.self.id === id) return view.self
  return view.opponents.find((o) => o.id === id) ?? null
}

function fullName(view, p) {
  if (!p) return '(unknown)'
  if (p.id === view.self.id) return `you (${view.self.name}, seat ${p.seatIndex})`
  return `${opponentLabel(p)} (seat ${p.seatIndex})`
}

function historyName(view, p) {
  if (!p) return '(unknown)'
  if (p.id === view.self.id) return 'You'
  return opponentLabel(p) ?? p.id
}

// Map each non-eliminated player to BTN / SB / BB / BTN/SB (heads-up).
function computePositions(view) {
  const all = [view.self, ...view.opponents]
    .filter((p) => !p.eliminated)
    .sort((a, b) => a.seatIndex - b.seatIndex)
  const dealerIdx = all.findIndex((p) => p.id === view.dealerId)
  if (dealerIdx < 0 || all.length < 2) return {}
  const positions = {}
  const isHeadsUp = all.length === 2
  if (isHeadsUp) {
    positions[all[dealerIdx].id] = 'BTN/SB'
    positions[all[(dealerIdx + 1) % all.length].id] = 'BB'
  } else {
    positions[all[dealerIdx].id] = 'BTN'
    positions[all[(dealerIdx + 1) % all.length].id] = 'SB'
    positions[all[(dealerIdx + 2) % all.length].id] = 'BB'
  }
  return positions
}

function buildUserMessage(view, handHistoryNote) {
  const positions = computePositions(view)

  const oppLines = view.opponents.map((o) => {
    const status = o.eliminated ? '[OUT]'
      : o.folded ? '[FOLDED]'
      : o.allIn ? '[ALL-IN]'
      : ''
    const pos = positions[o.id] ? `[${positions[o.id]}]` : ''
    const tags = [pos, status].filter(Boolean).join(' ')
    return `  - ${opponentLabel(o)} (seat ${o.seatIndex})${tags ? ' ' + tags : ''} — stack ${o.stack}, currentBet ${o.currentBet}, totalThisHand ${o.totalContributed}`
  }).join('\n')

  // Synthesize blind-post entries at the top of action history — the engine doesn't record them,
  // but they're load-bearing context for the LLM to understand the current bet picture.
  const sbId = Object.keys(positions).find((id) => positions[id] === 'SB' || positions[id] === 'BTN/SB')
  const bbId = Object.keys(positions).find((id) => positions[id] === 'BB')
  const blindEntries = []
  if (sbId) {
    blindEntries.push(`  - [preflop] ${historyName(view, findPlayer(view, sbId))}: posts small blind ${view.blinds.smallBlind}`)
  }
  if (bbId) {
    blindEntries.push(`  - [preflop] ${historyName(view, findPlayer(view, bbId))}: posts big blind ${view.blinds.bigBlind}`)
  }

  const actionEntries = view.actionHistory
    .filter((a) => a.handNumber === view.handNumber) // current hand only
    .map((a) => {
      const who = historyName(view, findPlayer(view, a.playerId))
      const amt = a.amount ? ` ${a.amount}` : ''
      return `  - [${a.street}] ${who}: ${a.action}${amt}`
    })

  const historyLines = [...blindEntries, ...actionEntries].join('\n') || '  (no actions yet this hand)'

  const la = view.legalActions
  const legalSummary = [
    la.canFold && 'fold',
    la.canCheck && 'check',
    la.canCall && `call (${la.callAmount} to call)`,
    la.canRaise && `raise (min ${la.minRaise}, max ${la.maxRaise})`,
    la.canAllIn && `all-in (${la.allInAmount} chips)`,
  ].filter(Boolean).join(', ')

  const dealer = findPlayer(view, view.dealerId)
  const dealerLine = dealer
    ? `Dealer button (BTN): ${fullName(view, dealer)}`
    : 'Dealer button: (unknown)'
  const selfPos = positions[view.self.id] ? ` — position ${positions[view.self.id]}` : ''

  return `
=== TABLE STATE ===
Hand #${view.handNumber}, street: ${view.street}
Blinds: ${view.blinds.smallBlind}/${view.blinds.bigBlind}${view.blinds.ante ? `, ante ${view.blinds.ante}` : ''}
${dealerLine}
Community cards: ${view.communityCards.length ? view.communityCards.join(' ') : '(none yet)'}
Pot total: ${view.potTotal}
Current bet to match: ${view.currentBet}
${handHistoryNote ? handHistoryNote + '\n' : ''}
=== YOUR HAND ===
You are ${view.self.name} in seat ${view.self.seatIndex}${selfPos}.
Hole cards: ${view.self.holeCards.join(' ')}
Your stack: ${view.self.stack}
Your current bet this street: ${view.self.currentBet}
Your total committed this hand: ${view.self.totalContributed}

=== OPPONENTS (in seat order) ===
${oppLines}

=== ACTION HISTORY (this hand) ===
${historyLines}

=== YOUR LEGAL ACTIONS ===
${legalSummary}

It is YOUR turn. Decide your action and respond with the JSON object as specified.`
}

// Pull the JSON object out of the (post-think) content buffer. Returns the parsed object or
// throws on failure.
export function parseActionJson(raw) {
  const trimmed = (raw || '').trim()
  // Strip ```json fences if present.
  const unfenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  // Find the first {...} block.
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('No JSON object found in reply')
  }
  const slice = unfenced.slice(start, end + 1)
  const obj = JSON.parse(slice)
  if (!obj || typeof obj !== 'object') throw new Error('Reply JSON is not an object')
  if (!['fold', 'check', 'call', 'raise', 'all-in'].includes(obj.action)) {
    throw new Error(`Invalid action: ${obj.action}`)
  }
  if (typeof obj.amount !== 'number') obj.amount = 0
  if (obj.say !== null && typeof obj.say !== 'string') obj.say = null
  return obj
}
