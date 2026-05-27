// Uno event names. Used on the shared eventBus (src/ai/eventBus.js) by the engine, store,
// character memory subscriber, and speech-bubble pipeline. Constants so the rest of the
// codebase doesn't sprinkle stringly-typed event names.

export const UNO_EVENTS = Object.freeze({
  ROUND_STARTED: 'uno:round_started',
  CARD_PLAYED: 'uno:card_played',
  CARD_DRAWN: 'uno:card_drawn',
  WILD_COLOR_CHOSEN: 'uno:wild_color_chosen',
  UNO_CALLED: 'uno:uno_called',
  UNO_MISSED: 'uno:uno_missed',
  UNO_CAUGHT: 'uno:uno_caught',
  DIRECTION_REVERSED: 'uno:direction_reversed',
  PLAYER_SKIPPED: 'uno:player_skipped',
  WILD_DRAW4_CHALLENGED: 'uno:wild_draw4_challenged',
  WILD_DRAW4_ACCEPTED: 'uno:wild_draw4_accepted',
  ROUND_WON: 'uno:round_won',
  MATCH_WON: 'uno:match_won',
  // Diagnostic — emitted by the driver when an AI's action was rewritten because it was illegal.
  ACTION_CORRECTED: 'uno:action_corrected',
})
