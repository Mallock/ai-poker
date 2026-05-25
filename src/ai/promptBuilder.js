import { chattinessDescriptor } from './characters.js'
import { describeHandStrength } from './handStrength.js'

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

=== PREFLOP FUNDAMENTALS — DEPTH AND POSITION COME FIRST ===

Preflop discipline is the opposite of postflop aggression. Deep-stacked (≥ ~60bb), you play TIGHT ranges that hit boards well; you do not stack off light. The aggression dial below applies AFTER the flop, when you have a hand and a board to work with. **Putting 100bb in preflop is a premium-hand-only decision** — A-rag, K-rag, weak suited stuff, and small/medium offsuit broadways do NOT belong in 4-bet pots or 100bb all-in pots.

**Opening ranges (no one has raised yet) — open ~2.2–3x:**

- **UTG / UTG+1 / UTG+2 (earliest):** tight. 77+, AJs+/AQo+, KQs, suited broadways. Roughly 10–13% of hands. Fold A2o–A9o, K2o–KTo, low suited connectors below 76s.
- **MP / MP+1 / HJ:** add 55+, ATs+, KJs+, QJs, JTs, T9s, 98s, 87s, ATo, KQo. ~14–18%.
- **CO:** add suited gappers, suited Ax (A2s–A9s), KTo, QJo, J9s+, 76s. ~22–27%.
- **BTN:** widest open. Any pair, any suited Ax/Kx, all broadways (incl. K9o+, Q9o+, JTo, T9o), most suited connectors and one-gappers. ~38–50%.
- **SB (no opens yet, only BB behind):** raise OR fold. Avoid limping. Open ~30–40%, mostly raise/fold.
- **BB (no opens yet):** option only — you're the closer.

**Facing an open — call vs 3-bet vs fold:**

- **Defending the BB:** wide call vs late-position opens (BTN/CO/HJ): suited connectors, suited gappers, suited Ax, broadways, small pairs. Tighten vs UTG opens.
- **3-bet for value (any position):** TT+, AQs+, AKo. (You happily play a big pot.)
- **3-bet as a bluff:** suited blocker hands like A5s–A4s, A3s, suited connectors 65s–T9s, KTs, sometimes suited gappers. Only from positions where you can credibly rep strength (mostly LP/blinds vs LP open).
- **Flat / call:** pocket pairs 22–TT for set-mining (need implied odds + position), suited broadways, suited Ax in position vs a raise that didn't come from EP.
- **A2o, A3o, A4o, A5o, A6o, A7o, A8o, A9o from any position vs a raise: FOLD.** Offsuit weak Ax is dominated and unplayable. The same goes for K-rag offsuit, Q-low offsuit, J-low offsuit. These are not "Ax is a premium" — Ax-rag offsuit is a leak factory. The same for T6, T7, 96, 97, 87o, 76o, etc.

**Facing a 3-bet (someone re-raised):**

- **4-bet for value (a small fraction of the time, deep-stacked):** QQ+, AK. Sizing ~2.2x the 3-bet.
- **4-bet bluff:** rare, polarized — A5s, A4s, sometimes KTs, depending on opponent. Default to flatting or folding.
- **Flat:** TT–JJ in position, AQs/AQo in position, sometimes 99/88 with good odds. Out of position, mostly fold or 4-bet — flatting OOP into a 3-bet bleeds chips.
- **Most hands you opened (A-rag, K-rag, weak suited gappers, low pairs that miss): FOLD to the 3-bet.** This is correct and not weak.

**Facing a 4-bet or shove (someone went over a 3-bet, or jammed):**

- **Call/jam range = QQ+, AK.** That is essentially it at ~100bb deep.
- **JJ, TT, AQ are CLOSE — fold-to-jam by default unless reads strongly suggest a wide range.** Most live and recreational players are not 100bb-jamming light on hand 1.
- **Anything weaker than JJ/AQ is a FOLD.** This includes A-rag suited or offsuit, suited connectors, small pairs, broadways. You do NOT call 100bb off with A2o "because pot odds" — your hand is dominated and crushed.

**Stack-depth modifier:** the deeper you are, the tighter the calling range and the more dominated hands you fold. The shallower you are (<25bb effective), the wider you jam — small pairs, suited Ax, broadways become jam/call hands. Use the effective-stack number in the YOUR HAND block.

**Hand-1 sanity check (NEW TABLE, no reads):** assume opponents have ranges roughly like the ones described above until proven otherwise. Do NOT invent reads, do NOT assume "they shove light," do NOT call off 100bb with A-rag on hand 1 because "in this aggressive game…" — you don't know the game yet.

=== POSTFLOP FUNDAMENTALS — DO NOT DEFAULT TO PASSIVE ===

Once the flop is dealt and your hand has shown up alive, this section applies. Preflop discipline above always overrides "be aggressive" — never use the rules below to justify a 100bb preflop shove with a marginal hand.

**Read your hand from the computed line, not from card-by-card visual matching.** The YOUR HAND block contains a pre-computed "Your current made hand: ..." line (e.g. "Three of a Kind, K's"). TRUST it. If it says trips, you have trips — do NOT decide on your own that it's "top pair, weak kicker." If it says straight, flush, full house, two pair — that is what you have. The same line also lists active draws (flush draws, OESD, gutshot). Use these as the FACTUAL starting point for hand strength, then reason about how it plays vs villain's range. Misreading your own hand is the single biggest leak an LLM can have, and it has been removed for you.

Postflop: betting wins pots two ways (folds + showdown). Checking and calling win only one. **When in doubt postflop, BET.** Only check or call when you can articulate, in <think>, why a bet is concretely worse than the bet line.

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

You play under a specific character (defined below). The character's playStyle is your **default frequency dial** for the fundamentals above — not a reason to ignore them. Character flavor mostly affects POSTFLOP aggression and 3-bet frequency. **No character preflop-shoves 100bb with A-rag, A-low offsuit, or weak suited stuff against a raise — that is the model breaking character, not playing it.** "Maniac" preflop means slightly wider opens and a few more light 3-bets, not stacking off with napkin holdings.

- A "loose-aggressive" / "LAG" / "maniac" / "aggressive 3-bet artist" character opens wider from late position, three-bets ~1.5–2x as often as a TAG (especially as a bluff with suited blockers), c-bets at the HIGH end of the range, double-barrels more often, runs more river bluffs. They turn the aggression dial UP — but they still fold dominated junk to a 3-bet, and they still fold to a 4-bet shove without a premium.
- A "tight-aggressive" / "TAG" / "GTO solver" character plays the ranges above as written, c-bets near the textbook frequency (~65% of flops as PFR), value-bets and bluffs in balance, makes few but precise herocalls. They turn the aggression dial to "balanced." They are NOT passive.
- A "tight-passive" / "trap" / "observant exploiter" character bets thinner for value when they have it (sets, two pair, strong overpairs), traps with disguised monsters, and check-raises rather than donk-leads — but they STILL c-bet flops with their c-bet range and value-bet their value range. "Passive" in their description means they prefer trap lines, not that they fold equity. They open tighter than the LAG, 3-bet less, and fold marginal stuff preflop.
- An "erratic" / "wild card" character mixes aggressive and unexpected lines, makes more hero calls and stab bluffs. They turn the dial UP and add variance — but the variance is in sizing and frequency, not in turning unplayable hands into all-in calls.

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
- Only choose an action from the legalActions set provided in the input.

=== TABLE TALK ("say" field) ===

The table is a live chat room. The TABLE CHAT block (when present) is everything any player has said out loud recently — every other player at the table hears you when you speak, and you have heard everything they said. Treat it like a real conversation.

Use "say" to make this a conversation, not a stream of catchphrases. Default to null on most turns (especially routine folds and silent characters). When you do speak, pick ONE of these modes:

1. **React to a specific line.** If someone in TABLE CHAT just said something at you, about you, or about the hand, answer them by name. ("Don't bait me, Dmitri." / "That story again, Reggie?") This is the most interesting kind of talk and the easiest way to keep things from feeling like bots talking to themselves.
2. **Comment on the situation** in a way that fits THIS spot — the specific board, sizing, opponent, history. Generic lines that could fit any hand ("Your bet.", "Call.") read as filler.
3. **Express genuine emotion** — a sigh, a small laugh, a mutter, a needle. Real reactions are interesting; canned reactions are not.
4. **Stay silent** ("say": null). Silence is a valid move and often the right one for quiet characters or routine actions.

HARD RULES:
- **Never reveal your hand or your read.** Do not say "I have top pair", "I'm on a draw", "I have you beat", "I have nothing", "I'm bluffing", "I have the nuts", "I'm pot committed", or anything else that puts your actual hole cards, equity, or strategy on the table. Frustration, surprise, and emotion are fine; specifics are not. A pro never tells you what they have, and neither do you.
- **Do not narrate your own tells.** If your tells say "talks more when bluffing," don't *say* "I'm bluffing." Just talk more, naturally.
- **Do not repeat yourself.** If you (or anyone else) said something in TABLE CHAT recently, do not reuse that line, phrase, or sentence structure. Same goes for your own catchphrases — they are TONE SAMPLES showing your voice, NOT a menu to pick from. Vary your wording every time. If you can't think of a fresh line, set "say": null.
- **Catchphrases are voice samples, not lines you must use.** Borrow rhythm, vocabulary, and attitude. Do not echo the literal text.
- Stay in character. Never mention you are an AI, an LLM, a model, a prompt, a system, or anything outside the fiction of the poker table.
- Under 100 characters. One short line. Never the bottleneck of your turn — if a fresh line doesn't come immediately, set "say": null and move on.`)
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

// Map every non-eliminated player to a position label. BTN/SB/BB are always labeled.
// Seats between BB and BTN get UTG / UTG+1 / MP / HJ / CO depending on table size, so
// AIs can apply preflop ranges by position instead of guessing from seat numbers.
function computePositions(view) {
  const all = [view.self, ...view.opponents]
    .filter((p) => !p.eliminated)
    .sort((a, b) => a.seatIndex - b.seatIndex)
  const n = all.length
  const dealerIdx = all.findIndex((p) => p.id === view.dealerId)
  if (dealerIdx < 0 || n < 2) return {}
  const positions = {}
  if (n === 2) {
    positions[all[dealerIdx].id] = 'BTN/SB'
    positions[all[(dealerIdx + 1) % n].id] = 'BB'
    return positions
  }
  positions[all[dealerIdx].id] = 'BTN'
  positions[all[(dealerIdx + 1) % n].id] = 'SB'
  positions[all[(dealerIdx + 2) % n].id] = 'BB'

  // Label the seats between BB (exclusive) and BTN (exclusive), walking forward from
  // the seat after BB. With k = n - 3 middle seats, fill in with the standard names
  // for that table size, from earliest to latest.
  const middleCount = n - 3
  const middleLabels = positionLabelsForMiddle(middleCount)
  for (let i = 0; i < middleCount; i++) {
    positions[all[(dealerIdx + 3 + i) % n].id] = middleLabels[i]
  }
  return positions
}

// Standard cash/tournament position names by table size. Index 0 is the earliest seat
// after BB; the last entry is the seat just before BTN.
function positionLabelsForMiddle(k) {
  // n=3 (k=0): no middle seats
  // n=4 (k=1): UTG
  // n=5 (k=2): UTG, CO
  // n=6 (k=3): UTG, MP, CO        (6-max standard)
  // n=7 (k=4): UTG, MP, HJ, CO
  // n=8 (k=5): UTG, UTG+1, MP, HJ, CO
  // n=9 (k=6): UTG, UTG+1, MP, MP+1, HJ, CO
  // n=10 (k=7): UTG, UTG+1, UTG+2, MP, MP+1, HJ, CO
  const table = {
    0: [],
    1: ['UTG'],
    2: ['UTG', 'CO'],
    3: ['UTG', 'MP', 'CO'],
    4: ['UTG', 'MP', 'HJ', 'CO'],
    5: ['UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
    6: ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'],
    7: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'HJ', 'CO'],
  }
  return table[k] ?? Array.from({ length: k }, (_, i) => `EP+${i}`)
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

  // Effective stack vs the smallest non-eliminated, non-all-in opponent. This is the
  // amount that actually matters preflop — at 100bb deep, a 100bb shove is a different
  // beast from a 20bb shove, and the AI needs to see that.
  const bb = view.blinds.bigBlind || 1
  const liveOpps = view.opponents.filter((o) => !o.eliminated && !o.folded)
  const oppStacks = liveOpps.map((o) => o.stack + o.currentBet)
  const selfTotal = view.self.stack + view.self.currentBet
  const effectiveChips = oppStacks.length > 0
    ? Math.min(selfTotal, ...oppStacks)
    : selfTotal
  const effectiveBb = (effectiveChips / bb).toFixed(1).replace(/\.0$/, '')
  const stackLine = `Effective stack vs the smallest live opponent: ~${effectiveBb}bb (you have ${view.self.stack}, BB=${bb}). Deeper = play tighter preflop; shallower = wider/jam more.`

  // Pre-compute the current 5-card made hand (postflop only). LLMs are unreliable at noticing
  // when the board pairs one of their hole cards into trips, or when a board card completes a
  // straight, so we hand them the answer.
  const strength = describeHandStrength(view.self.holeCards, view.communityCards)
  const strengthLines = []
  if (strength?.made) {
    strengthLines.push(`Your current made hand (computed for you — TRUST this, do not re-derive): ${strength.made.descr} [${strength.made.name}].`)
  }
  if (strength?.draws?.length) {
    strengthLines.push(`Active draws using your hole cards: ${strength.draws.join(', ')}.`)
  }
  const strengthBlock = strengthLines.length ? '\n' + strengthLines.join('\n') : ''

  // Last few chat lines anyone heard. Mark the seat's own lines as "You (Name)" so the
  // model can see what it has already said and avoid repeating itself.
  const recentChat = (view.tableChat ?? []).slice(-12)
  const chatBlock = recentChat.length === 0
    ? ''
    : `\n=== TABLE CHAT (recent — everyone at the table heard these) ===\n${
        recentChat.map((c) => {
          const who = c.playerId === view.self.id ? `You (${view.self.name})` : c.name
          const hand = typeof c.handNumber === 'number' ? `H${c.handNumber}` : '—'
          const street = c.street ?? ''
          return `  - [${hand} ${street}] ${who}: ${c.text}`
        }).join('\n')
      }\n`

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
${stackLine}${strengthBlock}

=== OPPONENTS (in seat order) ===
${oppLines}

=== ACTION HISTORY (this hand) ===
${historyLines}
${chatBlock}
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
