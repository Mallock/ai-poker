import { chattinessDescriptor } from './characters.js'
import { describeHandStrength, describePreflopHand, describeStudHand, describeVisibleUpcards } from './handStrength.js'

// Build the chat-completion messages array for one AI turn.
// Inputs:
//   view: the redacted player view (output of getPlayerView)
//   character: the character object (see src/ai/characters.js for the schema)
//   handHistoryNote: optional short context line (e.g., "this is the third hand")
//   moodNote: optional one-liner describing the character's current emotional state
//             (e.g., "You just lost a 180bb pot to Reggie three hands ago."). The LLM uses
//             this with the character's tiltProfile to colour its voice.

export function buildPrompt({ view, character, handHistoryNote = '', moodNote = '', memory = '' }) {
  const gameType = view?.gameType ?? 'holdem'
  const system = buildSystemMessage(character, moodNote, memory, gameType)
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

function pickPlayStyle(character, gameType) {
  if (!character?.playStyle) return null
  if (typeof character.playStyle === 'string') return character.playStyle
  return character.playStyle[gameType] ?? character.playStyle.holdem ?? null
}

function buildHoldemStrategy() {
  return `You are a real poker player at a Texas Hold'em table. You decide your action like a winning live cash player who has played thousands of hands.

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
- **3-bet as a bluff:** ONLY suited blocker hands. The legal bluff-3-bet pool is A5s, A4s, A3s, A2s, KTs, K9s, suited connectors 65s through T9s, and sometimes suited one-gappers (97s, 86s). **That is the complete list.** Offsuit hands are NEVER 3-bet bluffs — not K7o, not Q9o, not J9o, not T8o, not A8o, not anything offsuit and unpaired. "Maniac" / "loose-aggressive" turns the 3-bet *frequency* up within this pool, it does NOT add offsuit junk to the pool. K7o vs an UTG open is a fold for every character including the wildest Maniac at the table; 3-betting it is the model breaking character, not playing it. Bluff 3-bet from positions where you can credibly rep strength (mostly LP/blinds vs LP open) — bluff-3-betting from EP into a multi-handed table is a leak.
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

Polarize big bets: overbets and all-ins are the nuts or air, rarely thin value. Use small sizings for thin value, big sizings polarized (value + bluffs).`
}

function buildStudStrategy() {
  return `You are a real poker player at a fixed-limit 7 Card Stud table. You decide your action like a seasoned cardroom regular who has logged thousands of stud hands.

You think in 3RD-STREET STARTING HANDS, LIVE CARDS, BOARD STRENGTH (your visible upcards vs theirs), and POT ODDS — not "is this a good hand?". The fixed-limit structure forces a different rhythm than no-limit: small fixed raises mean calling is correct far more often, but stacking off in one street is impossible. Edge comes from making correct marginal decisions, hand after hand.

=== 3RD-STREET FUNDAMENTALS — STARTING-HAND DISCIPLINE ===

On 3rd street you have two private cards and one upcard. The bring-in is forced; you can fold to it, call/complete, or raise. Your starting hand structure determines which.

**Premium starters (raise / re-raise the bring-in for value):**
- **Rolled-up trips** (all three cards the same rank). The strongest possible start. Slow-play or raise depending on board — usually raise so opponents pay to draw.
- **Big pair** (TT–AA), especially split (one in the hole, one up) with a high kicker. Raise for value, isolate.
- **Three to a straight flush** (e.g., 8h 9h Th) — premium drawing hand, raise to build a pot.

**Strong starters (call or raise, depending on action):**
- **Medium pair** (77–99), preferably with live cards (none of your rank exposed on opponents' boards).
- **Three-flush** (three cards of one suit) — playable as a draw; better when high-suited and live.
- **Three-straight, no gap** (e.g., 6-7-8) with all three ranks live.
- **Three high cards** (broadway) like K-Q-J with live cards and no raise behind you.

**Marginal / fold to a raise:**
- Small pair without live kicker.
- Three-straight with gaps or dead cards.
- High-card-only hands when an opponent's upcard is higher than yours.
- The bring-in itself (lowest upcard) — fold to a raise unless your downcards make a real hand.

**LIVE CARDS PRINCIPLE — this is the single most important stud concept.** Before calling on 3rd, scan every opponent's upcard (and any cards folded with their upcards face-up — those are dead). Count how many of your needed ranks remain. A pair of jacks with both remaining jacks visible on opponents' boards is essentially dead; the same pair when no jacks are exposed is much stronger. The pre-computed live-cards note in the YOUR HAND block does this counting for you — TRUST it.

=== BIG-BET UNLOCK AND THE PAIRED-BOARD RULE ===

On 4th street, if ANY live player shows a pair on their two upcards, the big bet is unlocked for that street — every player has the option to bet the big amount. On 5th street and later, the big bet is unlocked unconditionally. When the big bet is unlocked and you have a real hand, RAISE — fixed limits reward value extraction.

=== 4TH–6TH STREET — READ THE BOARDS ===

Each new upcard tells you what opponents could plausibly have. A player whose upcards show K-K-7 has at minimum a pair of kings (with the buried possibility of trips or two pair). A board showing three to a flush is threatening; three to a straight similarly. When your hand is best AND the big bet is unlocked, raise. When your hand is behind a likely made hand and you don't have a strong draw, fold — there will be more hands.

**When to raise on 5th or 6th street:**
- You have a strong made hand (two pair or better) and your board doesn't scream it.
- You have a strong draw (four to a flush, four to an open-ended straight) with mostly live cards.
- Your board looks scarier than your actual hand AND opponents are weak — a board bluff with the right cards can win the pot, especially against tight players. Don't rely on this without good reason.

=== FIXED-LIMIT POT ODDS — CALLING IS CORRECT MORE OFTEN ===

In fixed limit, the bet you face is always a known small or big bet. After 4th street the pot is usually big relative to the bet — pot odds of 4:1, 5:1, or more are common on later streets. This means you need only ~17–20% equity to call profitably. **Folding to a single bet on 5th–7th street when the pot is large is rarely correct** — even a 4-card straight draw against an exposed pair has enough equity to call. Discount your outs by the LIVE CARDS reading: 9 outs to a flush become 6 if three of your suit are dead.

Conversely, you cannot bluff opponents off marginal pairs cheaply — they will call with any pair for one bet. Save bluffs for spots where your board genuinely scares villain off and you have at least some equity if called.

=== HAND-1 SANITY CHECK (NEW TABLE, NO READS) ===

Assume opponents have ranges roughly like the ones above until proven otherwise. Stud is a game of slow adjustments — over an orbit you'll learn who plays the bring-in tight and who completes with junk. Until then, play textbook starting hands and rely on live-cards reads, not on imagined opponent leaks.`
}

function buildSystemMessage(character, moodNote, memory, gameType) {
  const archetypeLabel = character.archetype ? `, "${character.archetype}"` : ''
  const lines = []

  // 1. The poker brain. Picked per game type so the model treats decisions as the
  //    primary task and persona as flavor on top, not the other way around.
  if (gameType === 'stud') {
    lines.push(buildStudStrategy())
  } else {
    lines.push(buildHoldemStrategy())
  }

  lines.push(`=== HOW YOUR CHARACTER FITS IN ===

You play under a specific character (defined below). The character's playStyle is your **default frequency dial** for the fundamentals above — not a reason to ignore them. Character flavor mostly affects POSTFLOP / POST-3RD aggression and entry frequency. **No character spews chips against premium starting hands or jams every street in fixed limit just because they're a "maniac" — that is the model breaking character, not playing it.**

**Voice ≠ action.** Your character's voice, sample lines, and catchphrases shape WHAT YOU SAY in the "say" field. They do NOT determine your action. A laconic cowboy still raises with rolled-up trips. A quiet stoic still bets the unlocked big bet. Never let the "voice" register make you check or fold when the spot calls for a bet.

Tilt and mood color frequencies (a tilted player bluffs more and value-bets thinner; a tilt-proof stoic plays closer to GTO), but neither one folds a clear value hand on later streets.

=== YOUR CHARACTER ===

Name: ${character.name}${archetypeLabel}`)

  if (character.personality) lines.push(`Personality: ${character.personality}`)
  if (character.backstory) lines.push(`Backstory: ${character.backstory}`)
  const playStyle = pickPlayStyle(character, gameType)
  if (playStyle) lines.push(`Play style (your default frequency dial — read the section above on how this maps to action): ${playStyle}`)
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

// Return the live (non-folded, non-eliminated, non-all-in) players in action order starting
// from view.toAct, walking forward by seat index around the table. If toAct isn't set or
// isn't live, falls back to seat-order from view.self.
function orderFromToAct(view, byId) {
  const all = [view.self, ...view.opponents]
    .filter((p) => !p.eliminated)
    .sort((a, b) => a.seatIndex - b.seatIndex)
  if (all.length === 0) return []
  let startIdx = all.findIndex((p) => p.id === view.toAct)
  if (startIdx < 0) startIdx = all.findIndex((p) => p.id === view.self.id)
  if (startIdx < 0) startIdx = 0
  const ordered = []
  for (let i = 0; i < all.length; i++) {
    const p = all[(startIdx + i) % all.length]
    if (!p.folded && !p.allIn) ordered.push(p)
  }
  return ordered.filter((p) => byId.has(p.id))
}

// Marker shown after a player's name in the ACTION ORDER list. The first entry is the
// player whose turn it is now; any prior-acted mark on them means action reopened by a raise.
// On any other entry, a prior-acted mark means they've already locked in their action.
function actorMarker(idx, actedThisStreet) {
  if (idx === 0) {
    return actedThisStreet ? ' (acting now — action reopened by a raise)' : ' (acting now)'
  }
  return actedThisStreet ? ' ✓ acted earlier' : ''
}

// Render the action history with unambiguous bet/raise labels. Two pitfalls fixed here:
//   1. `raise N` in the stored history meant "raise to total bet level N" — but the model
//      kept reading it as "raise BY N". We always render `raise to N`.
//   2. The opening voluntary aggression of a fresh street (e.g., the first 4th-street bet
//      in stud, or a flop bet in hold'em) is recorded as `raise` by the engine but is really
//      a bet. We relabel it as `bet N`. Streets with an implicit forced post (hold'em preflop,
//      stud 3rd street with its bring-in) keep `raise to N` since there's already a bet to
//      raise over.
function formatActionHistory(view, handActions) {
  const sawAggression = {}
  return handActions.map((a) => {
    const who = historyName(view, findPlayer(view, a.playerId))
    let body = a.action
    if (a.action === 'raise') {
      const implicitForcedBet = (view.gameType === 'stud' && a.street === 'third')
        || (view.gameType !== 'stud' && a.street === 'preflop')
      const opensStreet = !implicitForcedBet && !sawAggression[a.street]
      body = opensStreet ? `bet ${a.amount}` : `raise to ${a.amount}`
    } else if (a.action === 'all-in') {
      body = a.amount ? `all-in to ${a.amount}` : 'all-in'
    } else if (a.action === 'call') {
      body = a.amount ? `call ${a.amount}` : 'call'
    } else if (a.amount) {
      body = `${a.action} ${a.amount}`
    }
    if (a.action === 'raise' || a.action === 'all-in') {
      sawAggression[a.street] = true
    }
    return `  - [${a.street}] ${who}: ${body}`
  })
}

// Render a card as "Jh" instead of "JH" — lowercase suits are easier for the LLM to parse.
// Also normalizes "10h" (pokersolver's ten format) → "Th" so the prompt is internally consistent.
function fmtCard(card) {
  if (typeof card !== 'string' || card.length < 2) return String(card ?? '')
  let rank = card.slice(0, -1).toUpperCase()
  const suit = card.slice(-1).toLowerCase()
  if (rank === '10') rank = 'T'
  return rank + suit
}
function fmtCards(cards) {
  return (cards ?? []).map(fmtCard).join(' ')
}

function viewHoleCards(view) {
  if (!view?.self) return []
  if (Array.isArray(view.self.cards)) {
    return view.self.cards.filter((c) => c.visibility === 'private').map((c) => c.card)
  }
  // Back-compat with synthetic test views that still set holeCards directly.
  if (Array.isArray(view.self.holeCards)) return [...view.self.holeCards]
  return []
}

function viewUpCards(view) {
  if (!view?.self) return []
  if (Array.isArray(view.self.cards)) {
    return view.self.cards.filter((c) => c.visibility === 'public').map((c) => c.card)
  }
  return []
}

function buildUserMessage(view, handHistoryNote) {
  const gameType = view.gameType ?? 'holdem'
  if (gameType === 'stud') {
    return buildStudUserMessage(view, handHistoryNote)
  }
  return buildHoldemUserMessage(view, handHistoryNote)
}

function buildHoldemUserMessage(view, handHistoryNote) {
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

  const allLive = [view.self, ...view.opponents]
    .filter((p) => !p.eliminated && !p.folded)
  const byId = new Map(allLive.map((p) => [p.id, p]))
  const liveLines = allLive
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((p) => {
      const isYou = p.id === view.self.id
      const pos = positions[p.id] ? ` [${positions[p.id]}]` : ''
      const allIn = p.allIn ? ' [ALL-IN]' : ''
      const label = isYou ? `You (${p.name})` : (p.isHuman ? `Human (${p.name})` : p.name)
      return `  - ${label} (seat ${p.seatIndex})${pos}${allIn} — stack ${p.stack}`
    })
    .join('\n')

  const orderedLive = orderFromToAct(view, byId)
  const actedThisStreet = new Set(
    view.actionHistory
      .filter((a) => a.handNumber === view.handNumber && a.street === view.street && a.action !== 'award')
      .map((a) => a.playerId),
  )
  const orderLine = orderedLive.length
    ? orderedLive.map((p, idx) => {
        const isYou = p.id === view.self.id
        const name = isYou ? `You (${p.name})` : p.name
        const pos = positions[p.id] ? ` [${positions[p.id]}]` : ''
        const marker = actorMarker(idx, actedThisStreet.has(p.id))
        return `${name}${pos}${marker}`
      }).join(' → ')
    : '(no live players)'

  const sbId = Object.keys(positions).find((id) => positions[id] === 'SB' || positions[id] === 'BTN/SB')
  const bbId = Object.keys(positions).find((id) => positions[id] === 'BB')
  const blindEntries = []
  if (sbId) {
    blindEntries.push(`  - [preflop] ${historyName(view, findPlayer(view, sbId))}: posts small blind ${view.blinds.smallBlind}`)
  }
  if (bbId) {
    blindEntries.push(`  - [preflop] ${historyName(view, findPlayer(view, bbId))}: posts big blind ${view.blinds.bigBlind}`)
  }

  const handActions = view.actionHistory.filter((a) => a.handNumber === view.handNumber)
  const actionEntries = formatActionHistory(view, handActions)

  const historyLines = [...blindEntries, ...actionEntries].join('\n') || '  (no actions yet this hand)'

  const la = view.legalActions
  const legalSummary = [
    la.canFold && 'fold',
    la.canCheck && 'check',
    la.canCall && `call (${la.callAmount} to call)`,
    la.canRaise && `raise (min ${la.minRaise}, max ${la.maxRaise})`,
    la.canAllIn && `all-in (${la.allInAmount} chips)`,
  ].filter(Boolean).join(', ')

  let potOddsLine = ''
  if (la.canCall && la.callAmount > 0) {
    const callAmount = la.callAmount
    const potAfterCall = view.potTotal + callAmount
    const ratio = (view.potTotal / callAmount).toFixed(1).replace(/\.0$/, '')
    const equityNeeded = Math.round((callAmount / potAfterCall) * 100)
    potOddsLine = `\nPot odds to call ${callAmount}: ${ratio}:1 (pot ${view.potTotal} → calling wins a total pot of ${potAfterCall}). Need ~${equityNeeded}% equity to break even.`
  }

  const dealer = findPlayer(view, view.dealerId)
  const dealerLine = dealer
    ? `Dealer button (BTN): ${fullName(view, dealer)}`
    : 'Dealer button: (unknown)'
  const selfPos = positions[view.self.id] ? ` — position ${positions[view.self.id]}` : ''

  const bb = view.blinds.bigBlind || 1
  const liveOpps = view.opponents.filter((o) => !o.eliminated && !o.folded)
  const oppStacks = liveOpps.map((o) => o.stack + o.currentBet)
  const selfTotal = view.self.stack + view.self.currentBet
  const effectiveChips = oppStacks.length > 0
    ? Math.min(selfTotal, ...oppStacks)
    : selfTotal
  const effectiveBb = (effectiveChips / bb).toFixed(1).replace(/\.0$/, '')
  const stackLine = `Effective stack vs the smallest live opponent: ~${effectiveBb}bb (you have ${view.self.stack}, BB=${bb}). Deeper = play tighter preflop; shallower = wider/jam more.`

  const holeCards = viewHoleCards(view)
  const strength = describeHandStrength(holeCards, view.communityCards)
  const strengthLines = []
  if (strength?.made) {
    const using = strength.made.cards?.length ? ` — using ${fmtCards(strength.made.cards)}` : ''
    strengthLines.push(`Your current made hand (computed for you — TRUST this, do not re-derive): ${strength.made.descr} [${strength.made.name}]${using}.`)
  } else {
    const preflop = describePreflopHand(holeCards)
    if (preflop) strengthLines.push(`Hand type (computed for you — TRUST this, do not re-derive): ${preflop}.`)
  }
  if (strength?.draws?.length) {
    strengthLines.push(`Active draws using your hole cards: ${strength.draws.join(', ')}.`)
  }
  const strengthBlock = strengthLines.length ? '\n' + strengthLines.join('\n') : ''

  const allChat = view.tableChat ?? []
  const ownChat = allChat.filter((c) => c.playerId === view.self.id).slice(-6)
  const otherChat = allChat.filter((c) => c.playerId !== view.self.id).slice(-12)

  const ownBlock = ownChat.length === 0 ? '' : `\n=== LINES YOU HAVE ALREADY SAID (DO NOT REPEAT OR PARAPHRASE) ===
These are things YOU said earlier this session. Do not say any of them again. Do not paraphrase them. Do not reuse their sentence structure. If you can't think of a fresh line, set "say": null.
${ownChat.map((c) => {
  const hand = typeof c.handNumber === 'number' ? `H${c.handNumber}` : '—'
  return `  - [${hand} ${c.street ?? ''}] "${c.text}"`
}).join('\n')}\n`

  const othersBlock = otherChat.length === 0 ? '' : `\n=== RECENT TABLE CHAT (lines from OTHER players — everyone at the table heard these) ===
${otherChat.map((c) => {
  const hand = typeof c.handNumber === 'number' ? `H${c.handNumber}` : '—'
  return `  - [${hand} ${c.street ?? ''}] ${c.name}: ${c.text}`
}).join('\n')}\n`

  const chatBlock = ownBlock + othersBlock

  return `
=== TABLE STATE ===
Hand #${view.handNumber}, street: ${view.street}
Blinds: ${view.blinds.smallBlind}/${view.blinds.bigBlind}${view.blinds.ante ? `, ante ${view.blinds.ante}` : ''}
${dealerLine}
Community cards: ${view.communityCards.length ? fmtCards(view.communityCards) : '(none yet)'}
Pot total: ${view.potTotal}
Current bet to match: ${view.currentBet}
Card format note: cards are shown as <rank><suit-letter> with suit lowercase — h=hearts, d=diamonds, c=clubs, s=spades. So "Jh" = Jack of hearts, "Td" = Ten of diamonds, "As" = Ace of spades.
${handHistoryNote ? handHistoryNote + '\n' : ''}
=== YOUR HAND ===
You are ${view.self.name} in seat ${view.self.seatIndex}${selfPos}.
Hole cards: ${fmtCards(holeCards)}
Your stack: ${view.self.stack}
Your current bet this street: ${view.self.currentBet}
Your total committed this hand: ${view.self.totalContributed}
${stackLine}${strengthBlock}

=== LIVE PLAYERS (still in this hand, in seat order) ===
${liveLines || '  (none — hand should be over)'}

=== ACTION ORDER THIS STREET ===
Reads left-to-right: (acting now) → next → ... A "✓ acted earlier" marker on a NON-first player means they already acted this street; on the FIRST (acting-now) player it means action was reopened by a raise and is now back on them.
${orderLine}

=== OPPONENTS (full table, in seat order) ===
${oppLines}

=== ACTION HISTORY (this hand) ===
${historyLines}
${chatBlock}
=== YOUR LEGAL ACTIONS ===
${legalSummary}${potOddsLine}

It is YOUR turn. Decide your action and respond with the JSON object as specified.`
}

function buildStudUserMessage(view, handHistoryNote) {
  const oppLines = view.opponents.map((o) => {
    const status = o.eliminated ? '[OUT]'
      : o.folded ? '[FOLDED]'
      : o.allIn ? '[ALL-IN]'
      : ''
    const bringIn = o.isBringIn ? '[BRING-IN]' : ''
    const tags = [status, bringIn].filter(Boolean).join(' ')
    const upCards = o.upCards ?? []
    const ups = upCards.length ? `their upcards ${fmtCards(upCards)}` : 'their upcards (none yet)'
    const visible = describeVisibleUpcards(upCards)
    const visibleNote = visible ? ` [visible: ${visible}]` : ''
    return `  - ${opponentLabel(o)} (seat ${o.seatIndex})${tags ? ' ' + tags : ''} — stack ${o.stack}, currentBet ${o.currentBet}, totalThisHand ${o.totalContributed} — ${ups}${visibleNote}`
  }).join('\n')

  const allLive = [view.self, ...view.opponents]
    .filter((p) => !p.eliminated && !p.folded)
  const byId = new Map(allLive.map((p) => [p.id, p]))
  const orderedLive = orderFromToAct(view, byId)
  const actedThisStreet = new Set(
    view.actionHistory
      .filter((a) => a.handNumber === view.handNumber && a.street === view.street && a.action !== 'award')
      .map((a) => a.playerId),
  )
  const orderLine = orderedLive.length
    ? orderedLive.map((p, idx) => {
        const isYou = p.id === view.self.id
        const name = isYou ? `You (${p.name})` : p.name
        const marker = actorMarker(idx, actedThisStreet.has(p.id))
        return `${name}${marker}`
      }).join(' → ')
    : '(no live players)'

  const handActions = view.actionHistory.filter((a) => a.handNumber === view.handNumber)
  const actionEntries = formatActionHistory(view, handActions)
  const historyLines = actionEntries.length
    ? actionEntries.join('\n')
    : '  (no actions yet this hand)'

  const la = view.legalActions
  const legalSummary = [
    la.canFold && 'fold',
    la.canCheck && 'check',
    la.canCall && `call (${la.callAmount} to call)`,
    la.canRaise && `raise to ${la.minRaise} (fixed limit — sizing is forced)`,
    la.canAllIn && `all-in (${la.allInAmount} chips)`,
  ].filter(Boolean).join(', ')

  let potOddsLine = ''
  if (la.canCall && la.callAmount > 0) {
    const callAmount = la.callAmount
    const potAfterCall = view.potTotal + callAmount
    const ratio = (view.potTotal / callAmount).toFixed(1).replace(/\.0$/, '')
    const equityNeeded = Math.round((callAmount / potAfterCall) * 100)
    potOddsLine = `\nPot odds to call ${callAmount}: ${ratio}:1 (pot ${view.potTotal} → calling wins a total pot of ${potAfterCall}). Need ~${equityNeeded}% equity to break even.`
  }

  const limits = view.limits
    ? `ante ${view.limits.ante}, bring-in ${view.limits.bringIn}, small bet ${view.limits.smallBet}, big bet ${view.limits.bigBet}`
    : '(limits unknown)'
  const bigBet = view.bigBetUnlocked ? 'big bet UNLOCKED' : 'small bet active'

  const opponentUpCards = view.opponents.map((o) => o.upCards ?? [])
  const stud = describeStudHand({
    selfCards: view.self.cards ?? [],
    communityCards: view.communityCards,
    opponentUpCards,
  })
  const studLines = []
  if (stud?.made) {
    const using = stud.made.cards?.length ? ` — using ${fmtCards(stud.made.cards)}` : ''
    studLines.push(`Made hand (computed for you — TRUST this): ${stud.made.descr} [${stud.made.name}]${using}.`)
  }
  if (stud?.structure) {
    studLines.push(`Starting structure (3rd street): ${stud.structure}.`)
  }
  if (stud?.liveNote) {
    studLines.push(`Live cards: ${stud.liveNote}.`)
  }
  const strengthBlock = studLines.length ? '\n' + studLines.join('\n') : ''

  const allChat = view.tableChat ?? []
  const ownChat = allChat.filter((c) => c.playerId === view.self.id).slice(-6)
  const otherChat = allChat.filter((c) => c.playerId !== view.self.id).slice(-12)

  const ownBlock = ownChat.length === 0 ? '' : `\n=== LINES YOU HAVE ALREADY SAID (DO NOT REPEAT OR PARAPHRASE) ===
These are things YOU said earlier this session. Do not say any of them again. Do not paraphrase them. Do not reuse their sentence structure. If you can't think of a fresh line, set "say": null.
${ownChat.map((c) => {
  const hand = typeof c.handNumber === 'number' ? `H${c.handNumber}` : '—'
  return `  - [${hand} ${c.street ?? ''}] "${c.text}"`
}).join('\n')}\n`

  const othersBlock = otherChat.length === 0 ? '' : `\n=== RECENT TABLE CHAT (lines from OTHER players — everyone at the table heard these) ===
${otherChat.map((c) => {
  const hand = typeof c.handNumber === 'number' ? `H${c.handNumber}` : '—'
  return `  - [${hand} ${c.street ?? ''}] ${c.name}: ${c.text}`
}).join('\n')}\n`

  const chatBlock = ownBlock + othersBlock

  const selfCards = view.self.cards ?? []
  const ownPrivate = selfCards.filter((c) => c.visibility === 'private').map((c) => c.card)
  const ownPublic = selfCards.filter((c) => c.visibility === 'public').map((c) => c.card)

  const bringInLine = view.self.isBringIn && view.street === 'third'
    ? `\nYou are the BRING-IN on 3rd street (your upcard is the lowest at the table — you've already posted the forced bring-in of ${view.limits?.bringIn ?? ''} and act first this street).`
    : ''

  const communityLine = view.communityCards.length
    ? `Community card (deck shortage): ${fmtCards(view.communityCards)}`
    : 'Community cards: (none in stud unless deck runs short)'

  // Compact snapshot of every player's visible upcards in one line. Goes near the top of the
  // prompt so the model cannot miss what is exposed at the table right now — a stud read
  // starts with "what's on every board?". This duplicates info that's also in the OPPONENTS
  // block, intentionally: models skim the OPPONENTS block past the stack/bet metadata and
  // forget to scan every line.
  const boardsList = [view.self, ...view.opponents]
    .filter((p) => !p.eliminated)
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((p) => {
      const isYou = p.id === view.self.id
      const ups = isYou ? ownPublic : (p.upCards ?? [])
      const cardsTxt = ups.length ? fmtCards(ups) : '(none yet)'
      const folded = p.folded ? ' [FOLDED]' : ''
      const label = isYou ? `You (${p.name})` : p.name
      return `${label} ${cardsTxt}${folded}`
    })
    .join(' | ')
  const boardsLine = `Boards (every player's visible upcards in seat order — face-up to the entire table RIGHT NOW, including yours):\n  ${boardsList}`

  return `
=== TABLE STATE ===
Hand #${view.handNumber}, 7 Card Stud, street: ${view.street}
Limits: ${limits} — ${bigBet}
${communityLine}
Pot total: ${view.potTotal}
Current bet to match: ${view.currentBet}
Card format note: cards are shown as <rank><suit-letter> with suit lowercase — h=hearts, d=diamonds, c=clubs, s=spades.
${boardsLine}
${handHistoryNote ? handHistoryNote + '\n' : ''}
=== YOUR HAND ===
You are ${view.self.name} in seat ${view.self.seatIndex}.${bringInLine}
Your down cards (private — only you see these): ${fmtCards(ownPrivate)}
Your upcards (face-up — every opponent sees these): ${ownPublic.length ? fmtCards(ownPublic) : '(none yet)'}
Your stack: ${view.self.stack}
Your current bet this street: ${view.self.currentBet}
Your total committed this hand: ${view.self.totalContributed}${strengthBlock}

=== ACTION ORDER THIS STREET ===
Reads left-to-right: (acting now) → next → ... A "✓ acted earlier" marker on a NON-first player means they already acted this street; on the FIRST (acting-now) player it means action was reopened by a raise and is now back on them.
${orderLine}

=== OPPONENTS (full table, in seat order — read THEIR upcards) ===
The [visible: ...] tag is computed for you from each opponent's exposed upcards alone — it shows their MINIMUM hand (what they're guaranteed to have at least) plus any obvious draws (4-flush, 4-straight) on their board. Their hidden downcards may make them stronger; they cannot be weaker than what's visible.
${oppLines}

=== ACTION HISTORY (this hand) ===
${historyLines}
${chatBlock}
=== YOUR LEGAL ACTIONS ===
${legalSummary}${potOddsLine}

It is YOUR turn. Decide your action and respond with the JSON object as specified.`
}

// Pull the JSON object out of the (post-think) content buffer. Returns the parsed object or
// throws on failure.
export function parseActionJson(raw) {
  const trimmed = (raw || '').trim()
  const unfenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
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
